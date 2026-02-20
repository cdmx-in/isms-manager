import { google, drive_v3 } from 'googleapis';
import { prisma } from '../index.js';
import { logger } from '../utils/logger.js';
import Redis from 'ioredis';

// ============================================
// GOOGLE DRIVE SERVICE (Service Account)
// ============================================

let driveClient: drive_v3.Drive | null = null;
let redisClient: Redis | null = null;

const CACHE_TTL = 300; // 5 minutes

const getRedis = (): Redis | null => {
  if (redisClient) return redisClient;
  try {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    return redisClient;
  } catch {
    logger.warn('Redis not available for Drive caching');
    return null;
  }
};

export const getDriveClient = async (): Promise<drive_v3.Drive> => {
  if (driveClient) return driveClient;

  const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyFilePath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set');
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  driveClient = google.drive({ version: 'v3', auth });
  logger.info('Google Drive service account client initialized');
  return driveClient;
};

export const isDriveConfigured = (): boolean => {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
};

// ============================================
// TYPES
// ============================================

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  parents?: string[];
  isFolder: boolean;
}

// ============================================
// FOLDER & FILE OPERATIONS
// ============================================

export const listFolderContents = async (
  folderId: string,
  pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken?: string }> => {
  const redis = getRedis();
  const cacheKey = `drive:folder:${folderId}:${pageToken || 'first'}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
  }

  const drive = await getDriveClient();

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink, iconLink, parents)',
    orderBy: 'folder,name',
    pageSize: 100,
    pageToken: pageToken || undefined,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files: DriveFile[] = (response.data.files || []).map(f => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    size: f.size || undefined,
    modifiedTime: f.modifiedTime || undefined,
    webViewLink: f.webViewLink || undefined,
    webContentLink: f.webContentLink || undefined,
    iconLink: f.iconLink || undefined,
    parents: f.parents || undefined,
    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
  }));

  const result = { files, nextPageToken: response.data.nextPageToken || undefined };

  if (redis) {
    try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)); } catch { /* ignore */ }
  }

  return result;
};

export const getFileMetadata = async (fileId: string): Promise<DriveFile> => {
  const drive = await getDriveClient();

  const response = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, modifiedTime, webViewLink, webContentLink, iconLink, parents',
    supportsAllDrives: true,
  });

  return {
    id: response.data.id!,
    name: response.data.name!,
    mimeType: response.data.mimeType!,
    size: response.data.size || undefined,
    modifiedTime: response.data.modifiedTime || undefined,
    webViewLink: response.data.webViewLink || undefined,
    webContentLink: response.data.webContentLink || undefined,
    iconLink: response.data.iconLink || undefined,
    parents: response.data.parents || undefined,
    isFolder: response.data.mimeType === 'application/vnd.google-apps.folder',
  };
};

// Google Workspace MIME types that need export instead of download
const GOOGLE_WORKSPACE_MIMES: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

export const downloadFile = async (fileId: string, userAccessToken?: string): Promise<Buffer> => {
  const drive = await getDriveClient();

  // First check if this is a Google Workspace file
  const meta = await drive.files.get({
    fileId,
    fields: 'mimeType,capabilities/canDownload',
    supportsAllDrives: true,
  });

  const mimeType = meta.data.mimeType || '';
  const exportMime = GOOGLE_WORKSPACE_MIMES[mimeType];

  // Google Workspace files must be exported, not downloaded
  if (exportMime) {
    const response = await drive.files.export(
      { fileId, mimeType: exportMime },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(response.data as ArrayBuffer);
  }

  // Regular files - try service account first
  try {
    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(response.data as ArrayBuffer);
  } catch (error: any) {
    const reason = error.errors?.[0]?.reason;
    if (reason !== 'cannotDownloadFile' || !userAccessToken) {
      throw error;
    }

    // Fallback: use the user's OAuth token for restricted files
    logger.info(`Service account cannot download ${fileId}, trying user token fallback`);
    const userAuth = new google.auth.OAuth2();
    userAuth.setCredentials({ access_token: userAccessToken });
    const userDrive = google.drive({ version: 'v3', auth: userAuth });

    const response = await userDrive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(response.data as ArrayBuffer);
  }
};

export const searchDriveFiles = async (
  query: string,
  folderIds?: string[]
): Promise<DriveFile[]> => {
  const drive = await getDriveClient();

  let q = `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`;
  if (folderIds && folderIds.length > 0) {
    const folderQueries = folderIds.map(id => `'${id}' in parents`).join(' or ');
    q += ` and (${folderQueries})`;
  }

  const response = await drive.files.list({
    q,
    fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink, iconLink, parents)',
    orderBy: 'modifiedTime desc',
    pageSize: 50,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || []).map(f => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    size: f.size || undefined,
    modifiedTime: f.modifiedTime || undefined,
    webViewLink: f.webViewLink || undefined,
    webContentLink: f.webContentLink || undefined,
    iconLink: f.iconLink || undefined,
    parents: f.parents || undefined,
    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
  }));
};

// ============================================
// SYNC OPERATIONS
// ============================================

export const syncFolderToDb = async (
  folderId: string,
  organizationId: string,
  dbFolderId: string
): Promise<{ synced: number; errors: number }> => {
  let synced = 0;
  let errors = 0;
  let pageToken: string | undefined;

  do {
    try {
      const result = await listFolderContents(folderId, pageToken);

      for (const file of result.files) {
        if (file.isFolder) continue;
        try {
          const newModifiedAt = file.modifiedTime ? new Date(file.modifiedTime) : null;

          // Check if the file was modified since last index
          const existing = await prisma.driveDocument.findUnique({
            where: {
              organizationId_driveFileId: { organizationId, driveFileId: file.id },
            },
            select: { driveModifiedAt: true, isIndexed: true, indexedAt: true },
          });

          // If the file was modified after it was last indexed, mark for re-indexing
          const needsReindex = existing?.isIndexed &&
            newModifiedAt &&
            existing.driveModifiedAt &&
            newModifiedAt.getTime() > existing.driveModifiedAt.getTime();

          await prisma.driveDocument.upsert({
            where: {
              organizationId_driveFileId: { organizationId, driveFileId: file.id },
            },
            update: {
              name: file.name,
              mimeType: file.mimeType,
              size: file.size ? parseInt(file.size) : null,
              webViewLink: file.webViewLink || null,
              webContentLink: file.webContentLink || null,
              driveModifiedAt: newModifiedAt,
              lastSyncedAt: new Date(),
              syncStatus: 'SYNCED',
              // Reset indexing if document was modified in Drive
              ...(needsReindex ? { isIndexed: false } : {}),
            },
            create: {
              organizationId,
              folderId: dbFolderId,
              driveFileId: file.id,
              name: file.name,
              mimeType: file.mimeType,
              size: file.size ? parseInt(file.size) : null,
              webViewLink: file.webViewLink || null,
              webContentLink: file.webContentLink || null,
              driveModifiedAt: newModifiedAt,
              lastSyncedAt: new Date(),
              syncStatus: 'SYNCED',
            },
          });

          if (needsReindex) {
            logger.info(`Document "${file.name}" modified in Drive — marked for re-indexing`);
          }

          synced++;
        } catch (err) {
          logger.error(`Error syncing file ${file.name}:`, err);
          errors++;
        }
      }

      pageToken = result.nextPageToken;
    } catch (err) {
      logger.error(`Error listing folder ${folderId}:`, err);
      errors++;
      break;
    }
  } while (pageToken);

  // Invalidate cache
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys(`drive:folder:${folderId}:*`);
      if (keys.length > 0) await redis.del(...keys);
    } catch { /* ignore */ }
  }

  return { synced, errors };
};

export const syncAllFolders = async (organizationId: string): Promise<{ synced: number; errors: number }> => {
  const folders = await prisma.driveFolder.findMany({ where: { organizationId } });

  let totalSynced = 0;
  let totalErrors = 0;

  for (const folder of folders) {
    const result = await syncFolderToDb(folder.driveId, organizationId, folder.id);
    totalSynced += result.synced;
    totalErrors += result.errors;
  }

  return { synced: totalSynced, errors: totalErrors };
};
