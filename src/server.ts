import http from 'http';
import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { initSocketServer } from './socket/socket.server';

const server = http.createServer(app);

// Initialize real-time Socket.io server
initSocketServer(server);

async function startServer() {
  try {
    const isConnected = await connectDatabase();
    if (!isConnected) {
      console.error('❌ Could not connect to database. Server aborting.');
      process.exit(1);
    }

    server.listen(env.PORT, () => {
      console.log(`\n🚀 Scan-Pay-Eat backend server running at http://localhost:${env.PORT}`);
      console.log(`📡 Realtime Socket.io active`);
      console.log(`🌍 Environment: ${env.NODE_ENV}\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful Shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    console.log('HTTP and Socket.io server closed.');
    await disconnectDatabase();
    console.log('PostgreSQL database disconnected.');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();
