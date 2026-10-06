import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { env } from '../config/env';

let io: SocketIOServer | null = null;

export function initSocketServer(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          origin === env.FRONTEND_URL ||
          origin.includes('localhost') ||
          origin.endsWith('.scanpayeat.com')
        ) {
          return callback(null, true);
        }
        return callback(null, true); // Allow dev origins
      },
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket) => {
    // Join shop-specific room (e.g. shop:101 for shopkeeper dashboard)
    socket.on('join_shop', (data: { shopId: number }) => {
      if (data?.shopId) {
        const room = `shop:${data.shopId}`;
        socket.join(room);
        console.log(`🔌 Socket ${socket.id} joined room: ${room}`);
      }
    });

    // Join order-specific room (e.g. order:100245 for live customer tracking)
    socket.on('join_order', (data: { orderId: number }) => {
      if (data?.orderId) {
        const room = `order:${data.orderId}`;
        socket.join(room);
        console.log(`🔌 Socket ${socket.id} joined room: ${room}`);
      }
    });

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Emit new order to shopkeeper room
 */
export function emitNewOrder(shopId: number, orderData: unknown): void {
  if (io) {
    io.to(`shop:${shopId}`).emit('new_order', orderData);
  }
}

/**
 * Emit order status update to shopkeeper and customer rooms
 */
export function emitOrderStatusUpdate(
  shopId: number,
  orderId: number,
  orderData: unknown
): void {
  if (io) {
    io.to(`shop:${shopId}`).emit('order_status_updated', orderData);
    io.to(`order:${orderId}`).emit('order_status_updated', orderData);
  }
}
