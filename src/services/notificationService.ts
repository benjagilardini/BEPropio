import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { AppError } from '../utils/AppError.js';
import { paginate, getSkip, type PaginatedResult } from '../utils/pagination.js';
import { getIO } from '../config/socket.js';

interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedEntity?: {
    entityType: 'lease' | 'adjustment' | 'payment' | 'maintenance';
    entityId: mongoose.Types.ObjectId | string;
  };
}

interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  message: string;
  relatedEntity: { entityType: string; entityId: string } | null;
  readAt: string | null;
  createdAt: string;
}

function toNotificationDTO(n: any): NotificationDTO {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    message: n.message,
    relatedEntity: n.relatedEntity?.entityType
      ? { entityType: n.relatedEntity.entityType, entityId: n.relatedEntity.entityId.toString() }
      : null,
    readAt: n.readAt ? new Date(n.readAt).toISOString() : null,
    createdAt: n.createdAt?.toISOString?.() ?? n.createdAt,
  };
}

async function create(input: CreateNotificationInput) {
  const notification = await Notification.create({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    relatedEntity: input.relatedEntity
      ? {
          entityType: input.relatedEntity.entityType,
          entityId: typeof input.relatedEntity.entityId === 'string'
            ? new mongoose.Types.ObjectId(input.relatedEntity.entityId)
            : input.relatedEntity.entityId,
        }
      : null,
  });

  try {
    getIO().to(`user:${input.userId}`).emit('notification', toNotificationDTO(notification));
  } catch { /* socket not initialized in tests */ }

  return notification;
}

async function listForUser(
  userId: string,
  query: { page?: number; limit?: number; unreadOnly?: boolean },
): Promise<PaginatedResult<NotificationDTO>> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = getSkip(page, limit);

  const filter: Record<string, unknown> = { userId };
  if (query.unreadOnly) filter.readAt = null;

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
  ]);

  return paginate(notifications.map(toNotificationDTO), total, page, limit);
}

async function markAsRead(userId: string, notificationId: string) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true },
  );
  if (!notification) throw AppError.notFound('Notificación no encontrada');
  return toNotificationDTO(notification);
}

async function markAllAsRead(userId: string) {
  await Notification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
}

async function getUnreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ userId, readAt: null });
}

export const notificationService = {
  create,
  listForUser,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
