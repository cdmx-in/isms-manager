import OpenAI from 'openai';
import pdf from 'pdf-parse';
import { prisma } from '../index.js';
import { logger } from '../utils/logger.js';
import { downloadFile } from './googleDrive.service.js';

// ============================================
// RAG SERVICE - Document Indexing & Search
// ============================================

const getOpenAIClient = (): OpenAI => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  return new OpenAI({ apiKey });
};

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 200;
const EMBEDDING_DIMENSIONS = 1536;

// ============================================
// PDF TEXT EXTRACTION
// ============================================

export const extractTextFromPdf = async (buffer: Buffer): Promise<string> => {
  const data = await pdf(buffer);
  return data.text;
};

// ============================================
// TEXT CHUNKING
// ============================================

interface TextChunk {
  content: string;
  metadata: { startChar: number; endChar: number; chunkIndex: number };
  tokenCount: number;
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const chunkText = (text: string): TextChunk[] => {
  const chunks: TextChunk[] = [];
  const charChunkSize = CHUNK_SIZE * 4;
  const charOverlap = CHUNK_OVERLAP * 4;

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  let currentChunk = '';
  let chunkStart = 0;
  let charOffset = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length > charChunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: { startChar: chunkStart, endChar: charOffset, chunkIndex: chunks.length },
        tokenCount: estimateTokens(currentChunk),
      });

      const overlapStart = Math.max(0, currentChunk.length - charOverlap);
      currentChunk = currentChunk.slice(overlapStart) + '\n\n' + trimmed;
      chunkStart = charOffset - (currentChunk.length - trimmed.length - 2);
    } else {
      if (currentChunk.length > 0) {
        currentChunk += '\n\n' + trimmed;
      } else {
        currentChunk = trimmed;
        chunkStart = charOffset;
      }
    }
    charOffset += trimmed.length + 2;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      metadata: { startChar: chunkStart, endChar: charOffset, chunkIndex: chunks.length },
      tokenCount: estimateTokens(currentChunk),
    });
  }

  return chunks;
};

// ============================================
// EMBEDDING GENERATION
// ============================================

export const generateEmbeddings = async (texts: string[]): Promise<number[][]> => {
  const openai = getOpenAIClient();
  const batchSize = 20;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
};

// ============================================
// DOCUMENT INDEXING PIPELINE
// ============================================

export const indexDocument = async (documentId: string): Promise<{ chunkCount: number }> => {
  const doc = await prisma.driveDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  logger.info(`Indexing document: ${doc.name} (${doc.driveFileId})`);

  const buffer = await downloadFile(doc.driveFileId);

  let text: string;
  if (doc.mimeType === 'application/pdf') {
    text = await extractTextFromPdf(buffer);
  } else {
    text = buffer.toString('utf-8');
  }

  if (!text || text.trim().length < 10) {
    logger.warn(`Document ${doc.name} has no extractable text`);
    await prisma.driveDocument.update({
      where: { id: documentId },
      data: { isIndexed: true, indexedAt: new Date(), chunkCount: 0, syncStatus: 'SYNCED' },
    });
    return { chunkCount: 0 };
  }

  const chunks = chunkText(text);
  logger.info(`Document ${doc.name}: ${chunks.length} chunks`);

  const embeddings = await generateEmbeddings(chunks.map(c => c.content));

  // Delete existing chunks (re-index)
  await prisma.documentChunk.deleteMany({ where: { documentId } });

  // Store chunks with embeddings via raw SQL (Prisma can't handle vector type)
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    const vectorStr = `[${embedding.join(',')}]`;

    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk" (id, "documentId", "chunkIndex", content, metadata, "tokenCount", embedding, "createdAt")
      VALUES (
        gen_random_uuid(),
        ${documentId},
        ${chunk.metadata.chunkIndex},
        ${chunk.content},
        ${JSON.stringify(chunk.metadata)}::jsonb,
        ${chunk.tokenCount},
        ${vectorStr}::vector,
        NOW()
      )
    `;
  }

  await prisma.driveDocument.update({
    where: { id: documentId },
    data: { isIndexed: true, indexedAt: new Date(), chunkCount: chunks.length, syncStatus: 'SYNCED' },
  });

  logger.info(`Indexed ${doc.name}: ${chunks.length} chunks`);
  return { chunkCount: chunks.length };
};

export const indexAllDocuments = async (
  organizationId: string
): Promise<{ indexed: number; errors: number; totalChunks: number }> => {
  const documents = await prisma.driveDocument.findMany({
    where: { organizationId, isIndexed: false, mimeType: 'application/pdf' },
  });

  let indexed = 0, errors = 0, totalChunks = 0;

  for (const doc of documents) {
    try {
      const result = await indexDocument(doc.id);
      indexed++;
      totalChunks += result.chunkCount;
    } catch (error) {
      logger.error(`Error indexing ${doc.name}:`, error);
      errors++;
      await prisma.driveDocument.update({
        where: { id: doc.id },
        data: { syncStatus: 'ERROR' },
      }).catch(() => {});
    }
  }

  return { indexed, errors, totalChunks };
};

// ============================================
// SEMANTIC SEARCH
// ============================================

export interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  documentId: string;
  documentName: string;
  webViewLink: string | null;
  chunkIndex: number;
  metadata: any;
}

export const semanticSearch = async (
  query: string,
  organizationId: string,
  options?: { limit?: number; folderId?: string }
): Promise<SearchResult[]> => {
  const limit = options?.limit || 10;

  const embeddings = await generateEmbeddings([query]);
  const vectorStr = `[${embeddings[0].join(',')}]`;

  if (options?.folderId) {
    return prisma.$queryRaw<SearchResult[]>`
      SELECT dc.id, dc.content,
        1 - (dc.embedding <=> ${vectorStr}::vector) as similarity,
        dc."documentId", dd.name as "documentName", dd."webViewLink",
        dc."chunkIndex", dc.metadata
      FROM "DocumentChunk" dc
      JOIN "DriveDocument" dd ON dc."documentId" = dd.id
      WHERE dd."organizationId" = ${organizationId}
        AND dd."folderId" = ${options.folderId}
        AND dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;
  }

  return prisma.$queryRaw<SearchResult[]>`
    SELECT dc.id, dc.content,
      1 - (dc.embedding <=> ${vectorStr}::vector) as similarity,
      dc."documentId", dd.name as "documentName", dd."webViewLink",
      dc."chunkIndex", dc.metadata
    FROM "DocumentChunk" dc
    JOIN "DriveDocument" dd ON dc."documentId" = dd.id
    WHERE dd."organizationId" = ${organizationId}
      AND dc.embedding IS NOT NULL
    ORDER BY dc.embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `;
};

// ============================================
// RAG Q&A
// ============================================

export interface RagAnswer {
  answer: string;
  sources: Array<{
    documentName: string;
    webViewLink: string | null;
    snippet: string;
    similarity: number;
  }>;
}

export const answerQuestion = async (
  question: string,
  organizationId: string
): Promise<RagAnswer> => {
  const searchResults = await semanticSearch(question, organizationId, { limit: 8 });

  if (searchResults.length === 0) {
    return {
      answer: 'No relevant information found in indexed documents. Please ensure documents have been synced and indexed.',
      sources: [],
    };
  }

  const context = searchResults
    .map((r, i) => `[Source ${i + 1}: ${r.documentName}]\n${r.content}`)
    .join('\n\n---\n\n');

  const openai = getOpenAIClient();

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are an ISMS policy expert. Answer questions based on the provided policy document excerpts. Cite sources using [Source N] notation. Be concise and accurate.',
      },
      {
        role: 'user',
        content: `Based on these ISMS policy excerpts, answer:\n\n**Question:** ${question}\n\n**Excerpts:**\n${context}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 1024,
  });

  return {
    answer: completion.choices[0]?.message?.content || 'Unable to generate answer.',
    sources: searchResults.slice(0, 5).map(r => ({
      documentName: r.documentName,
      webViewLink: r.webViewLink,
      snippet: r.content.substring(0, 200) + '...',
      similarity: Number(r.similarity),
    })),
  };
};

// ============================================
// STATUS
// ============================================

export const getIndexingStatus = async (organizationId: string) => {
  const [totalDocs, indexedDocs, pendingDocs, errorDocs, totalChunks] = await Promise.all([
    prisma.driveDocument.count({ where: { organizationId } }),
    prisma.driveDocument.count({ where: { organizationId, isIndexed: true } }),
    prisma.driveDocument.count({ where: { organizationId, isIndexed: false, syncStatus: { not: 'ERROR' } } }),
    prisma.driveDocument.count({ where: { organizationId, syncStatus: 'ERROR' } }),
    prisma.documentChunk.count({ where: { document: { organizationId } } }),
  ]);

  return {
    totalDocuments: totalDocs,
    indexedDocuments: indexedDocs,
    pendingDocuments: pendingDocs,
    errorDocuments: errorDocs,
    totalChunks,
    isFullyIndexed: pendingDocs === 0 && errorDocs === 0 && totalDocs > 0,
  };
};
