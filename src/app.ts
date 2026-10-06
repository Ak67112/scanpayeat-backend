import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { sendSuccess } from './utils/response';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import adminRoutes from './modules/admin/admin.routes';
import shopRoutes from './modules/shopkeepers/shop.routes';
import publicRoutes from './modules/public/public.routes';
import orderRoutes from './modules/orders/order.routes';
import paymentRoutes from './modules/payments/payment.routes';
import webhookRoutes from './modules/webhooks/webhook.routes';
import customerRoutes from './modules/customers/customer.routes';

const app: Application = express();

// Security Headers (disable CSP for Swagger UI)
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// CORS configuration supporting credentials and subdomains
const allowedOrigins = [
  env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'https://scanpayeat-frontend.vercel.app',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.scanpayeat.com') ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost')
      ) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Serverless route prefix normalizer
app.use((req, res, next) => {
  if (
    req.url.startsWith('/auth') ||
    req.url.startsWith('/admin') ||
    req.url.startsWith('/shop') ||
    req.url.startsWith('/public') ||
    req.url.startsWith('/orders') ||
    req.url.startsWith('/payments') ||
    req.url.startsWith('/webhooks') ||
    req.url.startsWith('/me')
  ) {
    req.url = '/api' + req.url;
  }
  next();
});

// Logging
if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Cookie parser
app.use(cookieParser());

// Body Parsers with rawBody preservation for Webhook signature verification
app.use(
  express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true }));

import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';

const getOpenApiSpec = () => {
  try {
    const localPath = path.join(__dirname, 'docs', 'openapi.json');
    const targetPath = fs.existsSync(localPath)
      ? localPath
      : path.join(process.cwd(), 'src', 'docs', 'openapi.json');
    if (fs.existsSync(targetPath)) {
      return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    }
  } catch (err) {
    console.warn('Could not load openapi.json:', err);
  }
  return { openapi: '3.0.0', info: { title: 'Scan-Pay-Eat API', version: '1.0.0' }, paths: {} };
};

const openapiSpec = getOpenApiSpec();

// Documentation & Swagger UI
app.get('/api-docs/openapi.json', (req: Request, res: Response) => {
  res.json(openapiSpec);
});
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'Scan-Pay-Eat API Documentation',
  })
);

// Root & Health Check
app.get('/', (req: Request, res: Response) => {
  sendSuccess(res, { status: 'healthy', name: 'Scan-Pay-Eat Backend API', docs: '/api-docs' }, 'Scan-Pay-Eat API is active');
});

app.get('/health', (req: Request, res: Response) => {
  sendSuccess(res, { status: 'healthy', timestamp: new Date().toISOString() }, 'Scan-Pay-Eat API is active');
});

// Mount Module Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/me', customerRoutes);

// 404 Catch-All
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.path} - Endpoint not found`,
  });
});

// Global Error Handler
app.use(errorHandler);

export default app;
