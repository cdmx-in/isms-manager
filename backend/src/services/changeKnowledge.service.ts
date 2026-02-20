import { prisma } from '../index.js';
import { logger } from '../utils/logger.js';
import { generateEmbeddings, chunkText } from './rag.service.js';
import { itopService } from './itop.service.js';
import OpenAI from 'openai';

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const MAX_SINGLE_CHUNK_CHARS = 24000;
const ITOP_BATCH_SIZE = 500;

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

function buildChangeText(change: any): string {
  const parts: string[] = [];

  parts.push(`Change ${change.ref}: ${change.title}`);
  parts.push(`Status: ${change.status} | Type: ${change.changeType} | Impact: ${change.impact}`);

  const meta: string[] = [];
  if (change.team) meta.push(`Team: ${change.team}`);
  if (change.agent) meta.push(`Agent: ${change.agent}`);
  if (change.supervisor) meta.push(`Supervisor: ${change.supervisor}`);
  if (change.outage !== 'no') meta.push(`Outage: ${change.outage}`);
  if (meta.length > 0) parts.push(meta.join(' | '));

  parts.push('---');

  const desc = stripHtml(change.description);
  if (desc) {
    parts.push(`Description: ${desc}`);
  }

  if (change.fallback) {
    parts.push(`Fallback Plan: ${stripHtml(change.fallback)}`);
  }

  // Add private log entries
  const logEntries = change.privateLog || [];
  if (logEntries.length > 0) {
    parts.push('---');
    parts.push('Change Log:');
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

export async function startSync(organizationId: string, mode: 'full' | 'incremental' = 'incremental'): Promise<{ jobId: string; reused?: boolean }> {
  const existing = await prisma.syncJob.findFirst({
    where: { organizationId, type: 'change_embedding', status: 'running' },
  });
  if (existing) {
    return { jobId: existing.id, reused: true };
  }

  const COOLDOWN_MS = 30 * 1000;
  const recentJob = await prisma.syncJob.findFirst({
    where: {
      organizationId,
      type: 'change_embedding',
      status: { in: ['completed', 'failed'] },
      completedAt: { gte: new Date(Date.now() - COOLDOWN_MS) },
    },
    orderBy: { completedAt: 'desc' },
  });
  if (recentJob) {
    const waitSeconds = Math.ceil((COOLDOWN_MS - (Date.now() - recentJob.completedAt!.getTime())) / 1000);
    throw new Error(`Sync cooldown: please wait ${waitSeconds} seconds before syncing again`);
  }

  let afterDate: string | undefined;
  if (mode === 'incremental') {
    const latest: any[] = await prisma.$queryRaw`
      SELECT MAX("itop_last_update") as max_date FROM "change_embeddings" WHERE "organization_id" = ${organizationId}
    `;
    if (latest[0]?.max_date) {
      afterDate = new Date(latest[0].max_date).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
    } else {
      mode = 'full';
      logger.info('No indexed change records found, falling back to full sync');
    }
  }

  const oql = itopService.buildSyncOql('Change', afterDate);
  const total = await itopService.getChangeCountPublic(oql);

  const job = await prisma.syncJob.create({
    data: {
      type: 'change_embedding',
      status: 'running',
      total,
      organizationId,
    },
  });

  runSyncPipeline(job.id, organizationId, oql, total).catch(async (err) => {
    logger.error('Change sync pipeline failed:', err);
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: err.message, completedAt: new Date() },
    }).catch(() => {});
  });

  return { jobId: job.id };
}

async function processBatch(
  changes: any[],
  organizationId: string,
): Promise<{ processed: number; errors: number }> {
  let errors = 0;

  const textsToEmbed: string[] = [];
  const changeChunks: Array<{ change: any; chunkIndex: number; content: string }> = [];

  for (const change of changes) {
    const fullText = buildChangeText(change);

    if (fullText.length <= MAX_SINGLE_CHUNK_CHARS) {
      textsToEmbed.push(fullText);
      changeChunks.push({ change, chunkIndex: 0, content: fullText });
    } else {
      const chunks = chunkText(fullText);
      const prefix = `Change ${change.ref}: ${change.title}\n`;
      for (const chunk of chunks) {
        const chunkContent = prefix + chunk.content;
        textsToEmbed.push(chunkContent);
        changeChunks.push({ change, chunkIndex: chunk.metadata.chunkIndex, content: chunkContent });
      }
    }
  }

  const embeddings = await generateEmbeddings(textsToEmbed);

  for (let i = 0; i < changeChunks.length; i++) {
    const { change, chunkIndex, content } = changeChunks[i];
    const embedding = embeddings[i];
    const vectorStr = `[${embedding.join(',')}]`;
    const itopLastUpdate = change.lastUpdate ? new Date(change.lastUpdate) : new Date();
    const metadata = JSON.stringify({
      status: change.status,
      impact: change.impact,
      outage: change.outage,
      changeType: change.changeType,
      team: change.team,
      agent: change.agent,
      supervisor: change.supervisor,
      startDate: change.startDate,
      logEntryCount: (change.privateLog || []).length,
    });

    try {
      await prisma.$executeRaw`
        INSERT INTO "change_embeddings" (id, "itop_id", "chunk_index", ref, title, content, embedding, metadata, "itop_last_update", "organization_id", "created_at", "updated_at")
        VALUES (
          gen_random_uuid(),
          ${change.itopId},
          ${chunkIndex},
          ${change.ref},
          ${change.title},
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
      logger.error(`Failed to upsert change ${change.ref} chunk ${chunkIndex}:`, err.message);
      errors++;
    }
  }

  return { processed: changes.length, errors };
}

async function runSyncPipeline(jobId: string, organizationId: string, baseOql: string, total: number): Promise<void> {
  let processed = 0;
  let errors = 0;

  try {
    const totalPages = Math.ceil(total / ITOP_BATCH_SIZE);

    for (let page = 1; page <= totalPages; page++) {
      const batch = await itopService.getChangesBatch({
        oql: baseOql,
        limit: ITOP_BATCH_SIZE,
        page,
      });

      if (batch.data.length === 0) {
        break;
      }

      const result = await processBatch(batch.data, organizationId);
      processed += result.processed;
      errors += result.errors;

      await prisma.syncJob.update({
        where: { id: jobId },
        data: { progress: Math.min(processed, total) },
      });

      logger.info(`Change sync progress: ${processed}/${total} changes processed (${errors} errors), page ${page}/${totalPages}`);

      if (page < totalPages) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        progress: processed,
        completedAt: new Date(),
        error: errors > 0 ? `Completed with ${errors} errors` : null,
      },
    });

    logger.info(`Change sync completed: ${processed} changes, ${errors} errors`);
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
  const [indexedCount, totalChunks, lastJob] = await Promise.all([
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT "itop_id") as count FROM "change_embeddings" WHERE "organization_id" = ${organizationId}
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "change_embeddings" WHERE "organization_id" = ${organizationId}
    `,
    prisma.syncJob.findFirst({
      where: { organizationId, type: 'change_embedding' },
      orderBy: { startedAt: 'desc' },
    }),
  ]);

  return {
    indexedChanges: Number(indexedCount[0]?.count || 0),
    totalChunks: Number(totalChunks[0]?.count || 0),
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

export interface ChangeSearchResult {
  itopId: string;
  ref: string;
  title: string;
  content: string;
  similarity: number;
  metadata: any;
  chunkIndex: number;
}

export async function searchChanges(
  query: string,
  organizationId: string,
  limit: number = 10
): Promise<ChangeSearchResult[]> {
  const embeddings = await generateEmbeddings([query]);
  const vectorStr = `[${embeddings[0].join(',')}]`;

  const results = await prisma.$queryRaw<ChangeSearchResult[]>`
    SELECT ce."itop_id" as "itopId", ce.ref, ce.title, ce.content,
      1 - (ce.embedding <=> ${vectorStr}::vector) as similarity,
      ce.metadata, ce."chunk_index" as "chunkIndex"
    FROM "change_embeddings" ce
    WHERE ce."organization_id" = ${organizationId}
      AND ce.embedding IS NOT NULL
    ORDER BY ce.embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `;

  return results.map(r => ({
    ...r,
    similarity: Number(r.similarity),
  }));
}

// ============================================
// FIND SIMILAR CHANGES
// ============================================

export async function findSimilarChanges(
  itopId: string,
  organizationId: string,
  limit: number = 5
): Promise<ChangeSearchResult[]> {
  const sourceCheck = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM "change_embeddings"
    WHERE "itop_id" = ${itopId} AND "chunk_index" = 0 AND embedding IS NOT NULL
  `;

  if (!sourceCheck[0] || Number(sourceCheck[0].count) === 0) {
    return [];
  }

  const results = await prisma.$queryRaw<ChangeSearchResult[]>`
    SELECT ce."itop_id" as "itopId", ce.ref, ce.title, ce.content,
      1 - (ce.embedding <=> (SELECT embedding FROM "change_embeddings" WHERE "itop_id" = ${itopId} AND "chunk_index" = 0 LIMIT 1)) as similarity,
      ce.metadata, ce."chunk_index" as "chunkIndex"
    FROM "change_embeddings" ce
    WHERE ce."organization_id" = ${organizationId}
      AND ce."itop_id" != ${itopId}
      AND ce."chunk_index" = 0
      AND ce.embedding IS NOT NULL
    ORDER BY ce.embedding <=> (SELECT embedding FROM "change_embeddings" WHERE "itop_id" = ${itopId} AND "chunk_index" = 0 LIMIT 1)
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

export interface ChangeAnswer {
  answer: string;
  sources: Array<{
    ref: string;
    title: string;
    similarity: number;
    snippet: string;
  }>;
}

export async function askAboutChanges(
  question: string,
  organizationId: string
): Promise<ChangeAnswer> {
  const searchResults = await searchChanges(question, organizationId, 8);

  if (searchResults.length === 0) {
    return {
      answer: 'No relevant changes found in the knowledge base. Please ensure changes have been synced and indexed.',
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
        content: 'You are a change management analyst. Answer questions based on the provided change management records from an ISMS system. Cite sources using [Source N] notation. Be concise, accurate, and focus on patterns, impact analysis, and actionable insights.',
      },
      {
        role: 'user',
        content: `Based on these change records, answer:\n\n**Question:** ${question}\n\n**Change Excerpts:**\n${context}`,
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
