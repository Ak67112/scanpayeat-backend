import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

// Ensure DATABASE_URL is optimized for serverless deployments (Vercel)
function getSanitizedDatabaseUrl(): string {
  const rawUrl = process.env.DATABASE_URL || '';
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    // On serverless environments (Vercel / AWS Lambda), limit connections to 1 per instance
    // to prevent exhausting PostgreSQL connection slots on cloud providers (Aiven)
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('pool_timeout', '10');
    url.searchParams.set('connect_timeout', '15');
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const dbUrl = getSanitizedDatabaseUrl();

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// CRITICAL FOR SERVERLESS / VERCEL:
// Always reuse prisma client instance across warm serverless function invocations
// in ALL environments including production!
globalThis.prismaGlobal = prisma;

export async function connectDatabase(): Promise<boolean> {
  try {
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL database successfully.');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL database:', error);
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
