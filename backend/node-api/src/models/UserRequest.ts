import { Schema, model } from 'mongoose';

export interface UserRequestDocument {
  requesterUserId: string;
  requesterName: string;
  requesterAccount: string;
  requesterPhone?: string;
  requestedFromUserId: string;
  requestedFromAccount: string;
  requestedFromName: string;
  type: 'airtime' | 'data' | 'money';
  network?: string;
  amount: number;
  respondedAmount?: number;
  responderName?: string;
  respondedAt?: string;
  note?: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: Date;
  updatedAt: Date;
}

const userRequestSchema = new Schema<UserRequestDocument>(
  {
    requesterUserId: { type: String, required: true, index: true },
    requesterName: { type: String, required: true },
    requesterAccount: { type: String, required: true, index: true },
    requesterPhone: { type: String },
    requestedFromUserId: { type: String, required: true, index: true },
    requestedFromAccount: { type: String, required: true, index: true },
    requestedFromName: { type: String, required: true },
    type: { type: String, required: true, enum: ['airtime', 'data', 'money'] },
    network: { type: String },
    amount: { type: Number, required: true, min: 0.01 },
    respondedAmount: { type: Number, min: 0.01 },
    responderName: { type: String },
    respondedAt: { type: String },
    note: { type: String },
    status: { type: String, required: true, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const UserRequestModel = model<UserRequestDocument>('UserRequest', userRequestSchema);
