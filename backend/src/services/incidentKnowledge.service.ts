import { prisma } from '../index.js';
import { logger } from '../utils/logger.js';
import { generateEmbeddings, chunkText } from './rag.service.js';
import { itopService } from './itop.service.js';
import OpenAI from 'openai';

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const MAX_SINGLE_CHUNK_CHARS = 24000; // ~6000 tokens, safe for embedding
const ITOP_BATCH_SIZE = 500;
const EMBEDDING_BATCH_SIZE = 20;

// ============================================
// HTML STRIPPING
// ============================================

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================
// TEXT CONSTRUCTION
// ============================================

function buildIncidentText(incident: any): string {
  const parts: string[] = [];

  parts.push(`Incident ${incident.ref}: ${incident.title}`);
  parts.push(`Status: ${incident.status} | Severity: ${incident.severity} | Priority: P${incident.priority}`);

  const meta: string[] = [];
  if (incident.team) meta.push(`Team: ${incident.team}`);
  if (incident.agent) meta.push(`Agent: ${incident.agent}`);
  if (incident.service) meta.push(`Service: ${incident.service}`);
  if (incident.origin) meta.push(`Origin: ${incident.origin}`);
  if (meta.length > 0) parts.push(meta.join(' | '));

  parts.push('---');

  const desc = stripHtml(incident.description);
  if (desc) {
    parts.push(`Description: ${desc}`);
  }

  // Add public log entries
  const logEntries = incident.publicLog || [];
  if (logEntries.length > 0) {
    parts.push('---');
    parts.push('Investigation Log:');
    for (const entry of logEntries) {
      const msg = entry.message || stripHtml(entry.message_html || '');
      if (msg) {
        parts.push(`[${entry.date}] ${entry.user_login}: ${msg}`);
      }
    }
  }

  return parts.join('\n');
}

// ============================================
// SYNC PIPELINE
// ============================================

/**
 * Start a background sync job to index incidents from iTop
 */
export async function startSync(organizationId: string, mode: 'full' | 'incremental' = 'incremental'): Promise<{ jobId: string; reused?: boolean }> {
  // Check for existing running job
  const existing = await prisma.syncJob.findFirst({
    where: { organizationId, type: 'incident_embedding', status: 'running' },
  });
  if (existing) {
    return { jobId: existing.id, reused: true };
  }

  // Cooldown: prevent sync abuse - minimum 30 seconds between syncs
  const COOLDOWN_MS = 30 * 1000;
  const recentJob = await prisma.syncJob.findFirst({
    where: {
      organizationId,
      type: 'incident_embedding',
      status: { in: ['completed', 'failed'] },
      completedAt: { gte: new Date(Date.now() - COOLDOWN_MS) },
    },
    orderBy: { completedAt: 'desc' },
  });
  if (recentJob) {
    const waitSeconds = Math.ceil((COOLDOWN_MS - (Date.now() - recentJob.completedAt!.getTime())) / 1000);
    throw new Error(`Sync cooldown: please wait ${waitSeconds} seconds before syncing again`);
  }

  // Determine OQL based on mode
  let afterDate: string | undefined;
  let effectiveMode = mode;
  if (mode === 'incremental') {
    const latest: any[] = await prisma.$queryRaw`
      SELECT MAX("itop_last_update") as max_date FROM "incident_embeddings" WHERE "organization_id" = ${organizationId}
    `;
    if (latest[0]?.max_date) {
      afterDate = new Date(latest[0].max_date).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
    } else {
      // No records indexed yet - fall back to full sync
      effectiveMode = 'full';
      logger.info('No indexed records found, falling back to full sync');
    }
  }

  // Get total count
  const oql = itopService.buildSyncOql('Incident', afterDate);
  const total = await itopService.getIncidentCount(oql);

  // If incremental finds nothing new, check for an incomplete previous full sync to resume
  if (mode === 'incremental' && total === 0) {
    const incompleteSync = await prisma.syncJob.findFirst({
      where: {
        organizationId,
        type: 'incident_embedding',
        status: { in: ['failed', 'completed'] },
        total: { gt: 0 },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (incompleteSync && incompleteSync.progress < incompleteSync.total) {
      // Resume from where the interrupted sync left off
      const resumePage = Math.floor(incompleteSync.progress / ITOP_BATCH_SIZE) + 1;
      const fullOql = itopService.buildSyncOql('Incident'); // no date filter
      const fullTotal = await itopService.getIncidentCount(fullOql);

      logger.info(`Resuming incomplete sync from page ${resumePage} (previously indexed ${incompleteSync.progress}/${incompleteSync.total})`);

      const job = await prisma.syncJob.create({
        data: {
          type: 'incident_embedding',
          status: 'running',
          total: fullTotal,
          progress: incompleteSync.progress, // start from previous progress
          organizationId,
        },
      });

      runSyncPipeline(job.id, organizationId, fullOql, fullTotal, resumePage, incompleteSync.progress).catch(async (err) => {
        logger.error('Resume sync pipeline failed:', err);
        await prisma.syncJob.update({
          where: { id: job.id },
          data: { status: 'failed', error: err.message, completedAt: new Date() },
        }).catch(() => {});
      });

      return { jobId: job.id };
    }

    // Truly up-to-date: create a minimal completed job to record the check
    const job = await prisma.syncJob.create({
      data: {
        type: 'incident_embedding',
        status: 'running',
        total: 0,
        organizationId,
      },
    });

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: 'completed', progress: 0, completedAt: new Date(), error: null },
    });

    logger.info('Incremental sync: knowledge base is up to date (0 new incidents)');
    return { jobId: job.id };
  }

  // Create sync job
  const job = await prisma.syncJob.create({
    data: {
      type: 'incident_embedding',
      status: 'running',
      total,
      organizationId,
    },
  });

  // Run sync in background (don't await)
  runSyncPipeline(job.id, organizationId, oql, total).catch(async (err) => {
    logger.error('Sync pipeline failed:', err);
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: err.message, completedAt: new Date() },
    }).catch(() => {});
  });

  return { jobId: job.id };
}

/**
 * Process a single batch: build texts, generate embeddings, upsert to DB
 */
async function processBatch(
  incidents: any[],
  organizationId: string,
): Promise<{ processed: number; errors: number }> {
  let errors = 0;

  const textsToEmbed: string[] = [];
  const incidentChunks: Array<{ incident: any; chunkIndex: number; content: string }> = [];

  for (const incident of incidents) {
    const fullText = buildIncidentText(incident);

    if (fullText.length <= MAX_SINGLE_CHUNK_CHARS) {
      textsToEmbed.push(fullText);
      incidentChunks.push({ incident, chunkIndex: 0, content: fullText });
    } else {
      const chunks = chunkText(fullText);
      const prefix = `Incident ${incident.ref}: ${incident.title}\n`;
      for (const chunk of chunks) {
        const chunkContent = prefix + chunk.content;
        textsToEmbed.push(chunkContent);
        incidentChunks.push({ incident, chunkIndex: chunk.metadata.chunkIndex, content: chunkContent });
      }
    }
  }

  // Generate embeddings in sub-batches (generateEmbeddings handles batching internally)
  const embeddings = await generateEmbeddings(textsToEmbed);

  // Upsert into database
  for (let i = 0; i < incidentChunks.length; i++) {
    const { incident, chunkIndex, content } = incidentChunks[i];
    const embedding = embeddings[i];
    const vectorStr = `[${embedding.join(',')}]`;
    const itopLastUpdate = incident.lastUpdate ? new Date(incident.lastUpdate) : new Date();
    const metadata = JSON.stringify({
      status: incident.status,
      severity: incident.severity,
      priority: incident.priority,
      impact: incident.impact,
      urgency: incident.urgency,
      team: incident.team,
      agent: incident.agent,
      service: incident.service,
      origin: incident.origin,
      caller: incident.caller,
      startDate: incident.startDate,
      logEntryCount: (incident.publicLog || []).length,
    });

    try {
      await prisma.$executeRaw`
        INSERT INTO "incident_embeddings" (id, "itop_id", "chunk_index", ref, title, content, embedding, metadata, "itop_last_update", "organization_id", "created_at", "updated_at")
        VALUES (
          gen_random_uuid(),
          ${incident.itopId},
          ${chunkIndex},
          ${incident.ref},
          ${incident.title},
          ${content},
          ${vectorStr}::vector,
          ${metadata}::jsonb,
          ${itopLastUpdate},
          ${organizationId},
          NOW(),
          NOW()
        )
        ON CONFLICT ("itop_id", "chunk_index") DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          "itop_last_update" = EXCLUDED."itop_last_update",
          ref = EXCLUDED.ref,
          title = EXCLUDED.title,
          "updated_at" = NOW()
      `;
    } catch (err: any) {
      logger.error(`Failed to upsert incident ${incident.ref} chunk ${chunkIndex}:`, err.message);
      errors++;
    }
  }

  return { processed: incidents.length, errors };
}

/**
 * The actual sync pipeline - runs in background.
 * Uses iTop's native page parameter for pagination.
 * startPage and initialProcessed allow resuming an interrupted sync.
 */
async function runSyncPipeline(
  jobId: string,
  organizationId: string,
  baseOql: string,
  total: number,
  startPage: number = 1,
  initialProcessed: number = 0,
): Promise<void> {
  let processed = initialProcessed;
  let errors = 0;

  try {
    const totalPages = Math.ceil(total / ITOP_BATCH_SIZE);

    for (let page = startPage; page <= totalPages; page++) {
      const batch = await itopService.getIncidentsBatch({
        oql: baseOql,
        limit: ITOP_BATCH_SIZE,
        page,
      });

      if (batch.data.length === 0) {
        break;
      }

      // Process the batch (embed + upsert)
      const result = await processBatch(batch.data, organizationId);
      processed += result.processed;
      errors += result.errors;

      // Update job progress
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { progress: Math.min(processed, total) },
      });

      logger.info(`Sync progress: ${processed}/${total} incidents processed (${errors} errors), page ${page}/${totalPages}`);

      // Throttle: 2s pause between batches to reduce iTop server load
      if (page < totalPages) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Mark job complete
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        progress: processed,
        completedAt: new Date(),
        error: errors > 0 ? `Completed with ${errors} errors` : null,
      },
    });

    logger.info(`Sync completed: ${processed} incidents, ${errors} errors`);
  } catch (err: any) {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: err.message, completedAt: new Date(), progress: processed },
    }).catch(() => {});
    throw err;
  }
}

// ============================================
// SYNC STATUS
// ============================================

export async function getSyncJobStatus(jobId: string) {
  return prisma.syncJob.findUnique({ where: { id: jobId } });
}

export async function getKnowledgeBaseStatus(organizationId: string) {
  const [indexedCount, totalChunks, lastJob, incompleteFullSync] = await Promise.all([
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT "itop_id") as count FROM "incident_embeddings" WHERE "organization_id" = ${organizationId}
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "incident_embeddings" WHERE "organization_id" = ${organizationId}
    `,
    prisma.syncJob.findFirst({
      where: { organizationId, type: 'incident_embedding' },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.syncJob.findFirst({
      where: {
        organizationId,
        type: 'incident_embedding',
        status: { in: ['failed', 'completed'] },
        total: { gt: 0 },
      },
      orderBy: { startedAt: 'desc' },
    }),
  ]);

  const incomplete = incompleteFullSync && incompleteFullSync.progress < incompleteFullSync.total
    ? { progress: incompleteFullSync.progress, total: incompleteFullSync.total }
    : null;

  return {
    indexedIncidents: Number(indexedCount[0]?.count || 0),
    totalChunks: Number(totalChunks[0]?.count || 0),
    incompleteSync: incomplete,
    lastSync: lastJob ? {
      id: lastJob.id,
      status: lastJob.status,
      progress: lastJob.progress,
      total: lastJob.total,
      startedAt: lastJob.startedAt,
      completedAt: lastJob.completedAt,
      error: lastJob.error,
    } : null,
  };
}

// ============================================
// SEMANTIC SEARCH
// ============================================

export interface IncidentSearchResult {
  itopId: string;
  ref: string;
  title: string;
  content: string;
  similarity: number;
  metadata: any;
  chunkIndex: number;
}

export async function searchIncidents(
  query: string,
  organizationId: string,
  limit: number = 10
): Promise<IncidentSearchResult[]> {
  const embeddings = await generateEmbeddings([query]);
  const vectorStr = `[${embeddings[0].join(',')}]`;

  const results = await prisma.$queryRaw<IncidentSearchResult[]>`
    SELECT ie."itop_id" as "itopId", ie.ref, ie.title, ie.content,
      1 - (ie.embedding <=> ${vectorStr}::vector) as similarity,
      ie.metadata, ie."chunk_index" as "chunkIndex"
    FROM "incident_embeddings" ie
    WHERE ie."organization_id" = ${organizationId}
      AND ie.embedding IS NOT NULL
    ORDER BY ie.embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `;

  return results.map(r => ({
    ...r,
    similarity: Number(r.similarity),
  }));
}

// ============================================
// FIND SIMILAR INCIDENTS
// ============================================

export async function findSimilarIncidents(
  itopId: string,
  organizationId: string,
  limit: number = 5
): Promise<IncidentSearchResult[]> {
  // Check if source incident exists in the KB
  const sourceCheck = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM "incident_embeddings"
    WHERE "itop_id" = ${itopId} AND "chunk_index" = 0 AND embedding IS NOT NULL
  `;

  if (!sourceCheck[0] || Number(sourceCheck[0].count) === 0) {
    return [];
  }

  // Find nearest neighbors using subquery (avoids deserializing vector in JS)
  const results = await prisma.$queryRaw<IncidentSearchResult[]>`
    SELECT ie."itop_id" as "itopId", ie.ref, ie.title, ie.content,
      1 - (ie.embedding <=> (SELECT embedding FROM "incident_embeddings" WHERE "itop_id" = ${itopId} AND "chunk_index" = 0 LIMIT 1)) as similarity,
      ie.metadata, ie."chunk_index" as "chunkIndex"
    FROM "incident_embeddings" ie
    WHERE ie."organization_id" = ${organizationId}
      AND ie."itop_id" != ${itopId}
      AND ie."chunk_index" = 0
      AND ie.embedding IS NOT NULL
    ORDER BY ie.embedding <=> (SELECT embedding FROM "incident_embeddings" WHERE "itop_id" = ${itopId} AND "chunk_index" = 0 LIMIT 1)
    LIMIT ${limit}
  `;

  return results.map(r => ({
    ...r,
    similarity: Number(r.similarity),
  }));
}

// ============================================
// RAG Q&A
// ============================================

export interface IncidentAnswer {
  answer: string;
  sources: Array<{
    ref: string;
    title: string;
    similarity: number;
    snippet: string;
  }>;
}

export async function askAboutIncidents(
  question: string,
  organizationId: string
): Promise<IncidentAnswer> {
  const searchResults = await searchIncidents(question, organizationId, 8);

  if (searchResults.length === 0) {
    return {
      answer: 'No relevant incidents found in the knowledge base. Please ensure incidents have been synced and indexed.',
      sources: [],
    };
  }

  const context = searchResults
    .map((r, i) => `[Source ${i + 1}: ${r.ref} - ${r.title}]\n${r.content}`)
    .join('\n\n---\n\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a security incident analyst. Answer questions based on the provided incident data excerpts from an ISMS incident management system. Cite sources using [Source N] notation. Be concise, accurate, and focus on patterns, trends, and actionable insights.',
      },
      {
        role: 'user',
        content: `Based on these incident records, answer:\n\n**Question:** ${question}\n\n**Incident Excerpts:**\n${context}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 1500,
  });

  return {
    answer: completion.choices[0]?.message?.content || 'Unable to generate answer.',
    sources: searchResults.slice(0, 5).map(r => ({
      ref: r.ref,
      title: r.title,
      similarity: r.similarity,
      snippet: r.content.substring(0, 200) + '...',
    })),
  };
}
