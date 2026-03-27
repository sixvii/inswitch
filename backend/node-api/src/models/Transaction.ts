import { Schema, model } from 'mongoose';

export interface TransactionDocument {
  ownerUserId: string;
  idempotencyKey: string;
  type: 'send' | 'receive' | 'airtime' | 'data' | 'bills' | 'insurance' | 'escrow' | 'ajo' | 'cross-border';
  amount: number;
  senderAccount: string;
  receiverAccount: string;
  senderName: string;
  receiverName: string;
  description?: string;
  status: 'success' | 'pending' | 'failed';
  providerReference?: string;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<TransactionDocument>(
  {
    ownerUserId: { type: String, required: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ['send', 'receive', 'airtime', 'data', 'bills', 'insurance', 'escrow', 'ajo', 'cross-border'],
    },
    amount: { type: Number, required: true, min: 0.01 },
    senderAccount: { type: String, required: true },
    receiverAccount: { type: String, required: true },
    senderName: { type: String, required: true },
    receiverName: { type: String, required: true },
    description: { type: String },
    status: { type: String, required: true, enum: ['success', 'pending', 'failed'] },
    providerReference: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const TransactionModel = model<TransactionDocument>('Transaction', transactionSchema);
