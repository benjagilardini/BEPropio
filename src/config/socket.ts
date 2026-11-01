import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './index.js';
import type { AuthPayload } from '../middleware/authenticate.js';

let io: Server | null = null;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.frontendUrl,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const raw = socket.handshake.headers.cookie;
    if (!raw) return next(new Error('No cookie'));

    const cookies = parseCookies(raw);
    const token = cookies.accessToken;
    if (!token) return next(new Error('No access token'));

    try {
      const payload = jwt.verify(token, config.jwtAccessSecret) as AuthPayload;
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

function parseCookies(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  raw.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.substring(0, idx).trim();
    result[key] = decodeURIComponent(pair.substring(idx + 1).trim());
  });
  return result;
}
