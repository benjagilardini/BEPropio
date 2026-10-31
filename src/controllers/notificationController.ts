import type { Request, Response } from 'express';
import { notificationService } from '../services/notificationService.js';
import { catchAsync } from '../utils/catchAsync.js';

export const list = catchAsync(async (req: Request, res: Response) => {
  const unreadOnly = req.query.unreadOnly === 'true';
  const result = await notificationService.listForUser(req.user!.userId, {
    ...req.query as any,
    unreadOnly,
  });
  res.json(result);
});

export const markAsRead = catchAsync(async (req: Request, res: Response) => {
  const notification = await notificationService.markAsRead(req.user!.userId, req.params.notificationId as string);
  res.json({ data: notification });
});

export const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
  await notificationService.markAllAsRead(req.user!.userId);
  res.json({ message: 'Todas las notificaciones marcadas como leídas' });
});

export const getUnreadCount = catchAsync(async (req: Request, res: Response) => {
  const count = await notificationService.getUnreadCount(req.user!.userId);
  res.json({ data: { count } });
});
