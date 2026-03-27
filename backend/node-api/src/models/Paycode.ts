import { Schema, model } from 'mongoose';

export interface PaycodeDocument {
  ownerUserId: string;
  code: string;
  amount: number;
  status: 'active' | 'expired' | 'used' | 'cancelled';
  expiresAt: Date;
  usedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paycodeSchema = new Schema<PaycodeDocument>(
  {
    ownerUserId: { type: String, required: true, index: true },
    code: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    status: {
      type: String,
      required: true,
      enum: ['active', 'expired', 'used', 'cancelled'],
      default: 'active',
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

paycodeSchema.index({ ownerUserId: 1, createdAt: -1 });

export const PaycodeModel = model<PaycodeDocument>('Paycode', paycodeSchema);
