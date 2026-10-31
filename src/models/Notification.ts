import mongoose, { Schema, Document } from 'mongoose';

export interface INotification {
  userId: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  relatedEntity: {
    entityType: 'lease' | 'adjustment' | 'payment' | 'maintenance';
    entityId: mongoose.Types.ObjectId;
  } | null;
  readAt: Date | null;
}

export interface NotificationDocument extends INotification, Document {
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'adjustment_estimated', 'adjustment_final',
        'payment_submitted', 'payment_confirmed', 'payment_flagged',
        'maintenance_update', 'invitation_sent', 'lease_ended',
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedEntity: {
      entityType: { type: String, enum: ['lease', 'adjustment', 'payment', 'maintenance'] },
      entityId: { type: Schema.Types.ObjectId },
    },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ createdAt: 1 });

export const Notification = mongoose.model<NotificationDocument>('Notification', notificationSchema);
