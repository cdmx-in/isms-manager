import { Client as MinioClient } from 'minio';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { prisma } from '../index.js';
import { StorageProvider, FileCategory } from '@prisma/client';

// MinIO client singleton
let minioClient: MinioClient | null = null;

export const getMinioClient = (): MinioClient => {
  if (!minioClient) {
    minioClient = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || '',
      secretKey: process.env.MINIO_SECRET_KEY || '',
    });
  }
  return minioClient;
};

// Initialize MinIO bucket
export const initMinIO = async (): Promise<void> => {
  const client = getMinioClient();
  const bucket = process.env.MINIO_BUCKET || 'isms-files';

  try {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket);
      logger.info(`MinIO bucket '${bucket}' created`);

      // Set bucket policy for authenticated access only
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Deny',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/*`],
            Condition: {
              Bool: { 'aws:SecureTransport': 'false' },
            },
          },
        ],
      };
      await client.setBucketPolicy(bucket, JSON.stringify(policy));
    }
    logger.info(`MinIO initialized with bucket '${bucket}'`);
  } catch (error) {
    logger.error('MinIO initialization error:', error);
    throw error;
  }
};

// Upload file to MinIO
export const uploadToMinIO = async (
  file: Express.Multer.File,
  organizationId: string,
  category: FileCategory
): Promise<{ storagePath: string; storageUrl: string }> => {
  const client = getMinioClient();
  const bucket = process.env.MINIO_BUCKET || 'isms-files';

  // Generate unique file path: org/category/year/month/uuid_filename
  const date = new Date();
  const storagePath = `${organizationId}/${category.toLowerCase()}/${date.getFullYear()}/${
    date.getMonth() + 1
  }/${uuidv4()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  try {
    await client.putObject(
      bucket,
      storagePath,
      file.buffer,
      file.size,
      {
        'Content-Type': file.mimetype,
        'x-amz-meta-original-name': file.originalname,
        'x-amz-meta-organization-id': organizationId,
      }
    );

    // Generate presigned URL (valid for 7 days)
    const storageUrl = await client.presignedGetObject(bucket, storagePath, 7 * 24 * 60 * 60);

    logger.info(`File uploaded to MinIO: ${storagePath}`);
    return { storagePath, storageUrl };
  } catch (error) {
    logger.error('MinIO upload error:', error);
    throw error;
  }
};

// Get file from MinIO
export const getFromMinIO = async (storagePath: string): Promise<Readable> => {
  const client = getMinioClient();
  const bucket = process.env.MINIO_BUCKET || 'isms-files';

  try {
    return await client.getObject(bucket, storagePath);
  } catch (error) {
    logger.error('MinIO get error:', error);
    throw error;
  }
};

// Delete file from MinIO
export const deleteFromMinIO = async (storagePath: string): Promise<void> => {
  const client = getMinioClient();
  const bucket = process.env.MINIO_BUCKET || 'isms-files';

  try {
    await client.removeObject(bucket, storagePath);
    logger.info(`File deleted from MinIO: ${storagePath}`);
  } catch (error) {
    logger.error('MinIO delete error:', error);
    throw error;
  }
};

// Generate presigned download URL
export const getMinIOPresignedUrl = async (
  storagePath: string,
  expirySeconds: number = 3600
): Promise<string> => {
  const client = getMinioClient();
  const bucket = process.env.MINIO_BUCKET || 'isms-files';

  try {
    return await client.presignedGetObject(bucket, storagePath, expirySeconds);
  } catch (error) {
    logger.error('MinIO presigned URL error:', error);
    throw error;
  }
};

// ============================================
// GOOGLE DRIVE INTEGRATION
// ============================================

// Get Google OAuth2 client
export const getGoogleOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI
  );
};

// Generate Google Drive auth URL
export const getGoogleDriveAuthUrl = (state: string): string => {
  const oauth2Client = getGoogleOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
    state,
  });
};

// Exchange auth code for tokens
export const exchangeGoogleDriveCode = async (code: string) => {
  const oauth2Client = getGoogleOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

// Get authenticated Google Drive client for user
export const getGoogleDriveClient = async (userId: string): Promise<drive_v3.Drive | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleDriveAccessToken: true,
      googleDriveRefreshToken: true,
      googleDriveTokenExpiry: true,
    },
  });

  if (!user?.googleDriveAccessToken || !user?.googleDriveRefreshToken) {
    return null;
  }

  const oauth2Client = getGoogleOAuth2Client();
  oauth2Client.setCredentials({
    access_token: user.googleDriveAccessToken,
    refresh_token: user.googleDriveRefreshToken,
    expiry_date: user.googleDriveTokenExpiry?.getTime(),
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          googleDriveAccessToken: tokens.access_token,
          googleDriveTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        },
      });
    }
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
};

// Upload file to Google Drive
export const uploadToGoogleDrive = async (
  userId: string,
  file: Express.Multer.File,
  folderId?: string
): Promise<{ storagePath: string; storageUrl: string } | null> => {
  const drive = await getGoogleDriveClient(userId);
  if (!drive) {
    throw new Error('Google Drive not connected. Please authorize access first.');
  }

  try {
    // Create a readable stream from buffer
    const stream = new Readable();
    stream.push(file.buffer);
    stream.push(null);

    const fileMetadata: drive_v3.Schema$File = {
      name: file.originalname,
      parents: folderId ? [folderId] : undefined,
    };

    const media = {
      mimeType: file.mimetype,
      body: stream,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, webViewLink, webContentLink',
    });

    if (!response.data.id) {
      throw new Error('Failed to get file ID from Google Drive');
    }

    // Make file accessible via link
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    logger.info(`File uploaded to Google Drive: ${response.data.id}`);
    return {
      storagePath: response.data.id,
      storageUrl: response.data.webViewLink || '',
    };
  } catch (error) {
    logger.error('Google Drive upload error:', error);
    throw error;
  }
};

// Get file from Google Drive
export const getFromGoogleDrive = async (
  userId: string,
  fileId: string
): Promise<Readable | null> => {
  const drive = await getGoogleDriveClient(userId);
  if (!drive) {
    return null;
  }

  try {
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    return response.data as Readable;
  } catch (error) {
    logger.error('Google Drive get error:', error);
    throw error;
  }
};

// Delete file from Google Drive
export const deleteFromGoogleDrive = async (
  userId: string,
  fileId: string
): Promise<void> => {
  const drive = await getGoogleDriveClient(userId);
  if (!drive) {
    throw new Error('Google Drive not connected');
  }

  try {
    await drive.files.delete({ fileId });
    logger.info(`File deleted from Google Drive: ${fileId}`);
  } catch (error) {
    logger.error('Google Drive delete error:', error);
    throw error;
  }
};

// List files in Google Drive folder
export const listGoogleDriveFiles = async (
  userId: string,
  folderId?: string
): Promise<drive_v3.Schema$File[]> => {
  const drive = await getGoogleDriveClient(userId);
  if (!drive) {
    return [];
  }

  try {
    const query = folderId
      ? `'${folderId}' in parents and trashed = false`
      : 'trashed = false';

    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
    });

    return response.data.files || [];
  } catch (error) {
    logger.error('Google Drive list error:', error);
    throw error;
  }
};

// ============================================
// UNIFIED FILE SERVICE
// ============================================

export interface UploadOptions {
  organizationId: string;
  userId: string;
  category: FileCategory;
  provider?: StorageProvider;
  googleDriveFolderId?: string;
  description?: string;
  assetId?: string;
  controlId?: string;
  auditId?: string;
  incidentId?: string;
}

export const uploadFile = async (
  file: Express.Multer.File,
  options: UploadOptions
) => {
  const provider = options.provider || 'MINIO';
  let storagePath: string;
  let storageUrl: string;

  if (provider === 'GOOGLE_DRIVE') {
    const result = await uploadToGoogleDrive(
      options.userId,
      file,
      options.googleDriveFolderId
    );
    if (!result) {
      throw new Error('Failed to upload to Google Drive');
    }
    storagePath = result.storagePath;
    storageUrl = result.storageUrl;
  } else {
    const result = await uploadToMinIO(file, options.organizationId, options.category);
    storagePath = result.storagePath;
    storageUrl = result.storageUrl;
  }

  // Create file record in database
  const fileRecord = await prisma.fileUpload.create({
    data: {
      organizationId: options.organizationId,
      fileName: `${uuidv4()}_${file.originalname}`,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      storageProvider: provider,
      storagePath,
      storageUrl,
      category: options.category,
      description: options.description,
      uploadedById: options.userId,
      assetId: options.assetId,
      controlId: options.controlId,
      auditId: options.auditId,
      incidentId: options.incidentId,
    },
  });

  return fileRecord;
};

export const deleteFile = async (fileId: string, userId: string) => {
  const file = await prisma.fileUpload.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    throw new Error('File not found');
  }

  // Delete from storage provider
  if (file.storageProvider === 'GOOGLE_DRIVE') {
    await deleteFromGoogleDrive(userId, file.storagePath);
  } else {
    await deleteFromMinIO(file.storagePath);
  }

  // Delete database record
  await prisma.fileUpload.delete({
    where: { id: fileId },
  });
};

export const getFileStream = async (
  fileId: string,
  userId: string
): Promise<{ stream: Readable; file: any }> => {
  const file = await prisma.fileUpload.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    throw new Error('File not found');
  }

  let stream: Readable | null;

  if (file.storageProvider === 'GOOGLE_DRIVE') {
    stream = await getFromGoogleDrive(userId, file.storagePath);
  } else {
    stream = await getFromMinIO(file.storagePath);
  }

  if (!stream) {
    throw new Error('Failed to retrieve file');
  }

  return { stream, file };
};

// Export a unified storage service object for convenience
export const storageService = {
  initMinIO,
  uploadToMinIO,
  getFromMinIO,
  deleteFromMinIO,
  initGoogleDrive: initMinIO,
  getGoogleAuthUrl: getGoogleDriveAuthUrl,
  handleGoogleCallback: exchangeGoogleDriveCode,
  uploadToGoogleDrive,
  getFromGoogleDrive,
  deleteFromGoogleDrive,
  listGoogleDriveFiles,
  uploadFile,
  deleteFile,
  getFileStream,
  getPresignedUrl: async (storagePath: string, expirySeconds: number = 3600): Promise<string> => {
    const client = getMinioClient();
    const bucket = process.env.MINIO_BUCKET || 'isms-files';
    return await client.presignedGetObject(bucket, storagePath, expirySeconds);
  },
};
