import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import RedisStore from 'connect-redis';
import passport from 'passport';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';

import { configurePassport } from './config/passport.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { sanitizeInput } from './middleware/sanitize.js';
import { requestLogger } from './middleware/requestLogger.js';
import { securityHeaders } from './middleware/securityHeaders.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import orgRoutes from './routes/organization.routes.js';
import assetRoutes from './routes/asset.routes.js';
import riskRoutes from './routes/risk.routes.js';
import controlRoutes from './routes/control.routes.js';
import driveRoutes from './routes/drive.routes.js';
import ragRoutes from './routes/rag.routes.js';
import soaRoutes from './routes/soa.routes.js';
import auditRoutes from './routes/audit.routes.js';
import incidentRoutes from './routes/incident.routes.js';
import fileRoutes from './routes/file.routes.js';
import reportRoutes from './routes/report.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import frameworkRoutes from './routes/framework.routes.js';
import checklistRoutes from './routes/checklist.routes.js';

import { logger } from './utils/logger.js';
import { initMinIO } from './services/storage.service.js';

// Initialize Prisma
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Initialize Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.on('connect', () => logger.info('Redis Client Connected'));

// Create Express app
const app: Express = express();

// Trust proxy (for nginx)
app.set('trust proxy', 1);

// ============================================
// SECURITY MIDDLEWARE (OWASP Top 10)
// ============================================

// 1. Helmet - Set security HTTP headers (A05:2021 Security Misconfiguration)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// 2. CORS configuration (A01:2021 Broken Access Control)
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Page-Size'],
  maxAge: 600, // 10 minutes
}));

// 3. Rate limiting (A04:2021 Insecure Design)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per window
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// 4. HTTP Parameter Pollution protection
app.use(hpp());

// 5. Body parsers with size limits (A03:2021 Injection)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.SESSION_SECRET));

// 6. Custom security headers
app.use(securityHeaders);

// 7. Input sanitization (A03:2021 Injection)
app.use(sanitizeInput);

// ============================================
// LOGGING
// ============================================

// Morgan HTTP request logging
app.use(morgan('combined', {
  stream: { write: (message: string) => logger.http(message.trim()) },
  skip: (req) => req.url === '/api/health',
}));

// Custom request logger for audit trail
app.use(requestLogger);

// ============================================
// SESSION MANAGEMENT
// ============================================

const initializeSession = async () => {
  await redisClient.connect();
  
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'isms:sess:',
    ttl: 86400, // 24 hours
  });

  app.use(session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
    name: 'isms.sid', // Custom cookie name (A02:2021 Cryptographic Failures)
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true, // Prevent XSS (A07:2021 XSS)
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict', // CSRF protection (A01:2021)
      domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined,
    },
  }));

  // Initialize Passport
  configurePassport(passport);
  app.use(passport.initialize());
  app.use(passport.session());
};

// ============================================
// API ROUTES
// ============================================

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/organizations', orgRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/risks', riskRoutes);
app.use('/api/controls', controlRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/soa', soaRoutes);
app.use('/api/audits', auditRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/frameworks', frameworkRoutes);
app.use('/api/checklist', checklistRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ============================================
// SERVER STARTUP
// ============================================

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  try {
    // Connect to database
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Initialize session with Redis
    await initializeSession();
    logger.info('Redis session store initialized');

    // Initialize MinIO storage
    try {
      await initMinIO();
      logger.info('MinIO storage initialized');
    } catch (error) {
      logger.warn('MinIO initialization failed - file uploads may not work:', error);
    }

    // Start server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  await prisma.$disconnect();
  await redisClient.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  await prisma.$disconnect();
  await redisClient.quit();
  process.exit(0);
});

startServer();

export default app;
