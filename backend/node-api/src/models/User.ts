import { Schema, model } from 'mongoose';

const lockedFundSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    unlockDate: { type: String, required: true },
    createdAt: { type: String, required: true },
    releasedAt: { type: String },
    status: { type: String, enum: ['locked', 'released'], required: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    age: { type: String, required: true },
    username: { type: String, required: true, unique: true, index: true },
    pin: { type: String, required: true },
    password: { type: String, required: true },
    nin: { type: String },
    accountNumber: { type: String, required: true, unique: true, index: true },
    walletId: { type: String, required: true, unique: true, index: true },
    createdAt: { type: String, required: true },
    faceVerified: { type: Boolean, required: true },
    ajoUsername: { type: String },
    profileImage: { type: String },
    ajoActivated: { type: Boolean },
    piggyActivated: { type: Boolean },
    escrowActivated: { type: Boolean },
    escrowWalletId: { type: String },
    balance: { type: Number, required: true, default: 50000, min: 0 },
    lockedFunds: { type: [lockedFundSchema], default: [] },
    escrows: { type: [Schema.Types.Mixed], default: [] },
    savingsGroups: { type: [Schema.Types.Mixed], default: [] },
    userRequests: { type: [Schema.Types.Mixed], default: [] },
    paycodeHistory: { type: [Schema.Types.Mixed], default: [] },
    loans: { type: [Schema.Types.Mixed], default: [] },
    trustScore: {
      type: Schema.Types.Mixed,
      default: {
        overall: 450,
        transactionVolume: 60,
        savingsDiscipline: 50,
        escrowReliability: 70,
        billPaymentConsistency: 55,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const UserModel = model('User', userSchema);
