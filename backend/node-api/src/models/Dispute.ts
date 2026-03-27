import { Schema, model } from 'mongoose';

export interface DisputeDocument {
  ownerUserId: string;
  transactionId: string;
  issue: string;
  status: 'open' | 'resolved';
  createdAt: Date;
  updatedAt: Date;
}

const disputeSchema = new Schema<DisputeDocument>(
  {
    ownerUserId: { type: String, required: true, index: true },
    transactionId: { type: String, required: true, index: true },
    issue: { type: String, required: true, minlength: 5 },
    status: { type: String, required: true, enum: ['open', 'resolved'], default: 'open' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const DisputeModel = model<DisputeDocument>('Dispute', disputeSchema);
