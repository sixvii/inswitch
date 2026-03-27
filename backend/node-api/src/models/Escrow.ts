import { Schema, model } from 'mongoose';

export interface EscrowDocument {
  buyerUserId: string;
  buyerWalletId: string;
  buyerName: string;
  sellerUserId: string;
  sellerWalletId: string;
  sellerName: string;
  amount: number;
  description: string;
  deliveryDeadline: string;
  status: 'pending_acceptance' | 'pending_delivery' | 'delivery_confirmed' | 'released' | 'disputed' | 'cancelled';
  penalty: number;
  releasedAt?: string;
  sellerSettledAt?: string;
  createdAt: Date;
  updatedAt: Date;
}

const escrowSchema = new Schema<EscrowDocument>(
  {
    buyerUserId: { type: String, required: true, index: true },
    buyerWalletId: { type: String, required: true, index: true },
    buyerName: { type: String, required: true },
    sellerUserId: { type: String, required: true, index: true },
    sellerWalletId: { type: String, required: true, index: true },
    sellerName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    description: { type: String, required: true },
    deliveryDeadline: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending_acceptance', 'pending_delivery', 'delivery_confirmed', 'released', 'disputed', 'cancelled'],
      default: 'pending_acceptance',
    },
    penalty: { type: Number, required: true, default: 0, min: 0 },
    releasedAt: { type: String },
    sellerSettledAt: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const EscrowModel = model<EscrowDocument>('Escrow', escrowSchema);
