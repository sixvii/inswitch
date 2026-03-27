import { Schema, model } from 'mongoose';

export interface NotificationDocument {
  userId: string;
  type: 'ajo-payout' | 'ajo-invitation' | 'ajo-member-joined' | 'transaction' | 'alert';
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ['ajo-payout', 'ajo-invitation', 'ajo-member-joined', 'transaction', 'alert'],
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const NotificationModel = model<NotificationDocument>('Notification', notificationSchema);
