import { Schema, model } from 'mongoose';

const ajoGroupSchema = new Schema(
  {
    groupId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    creatorUsername: { type: String, required: true, index: true },
    contributionAmount: { type: Number, required: true, min: 0 },
    frequency: { type: String, enum: ['weekly', 'biweekly', 'monthly'], required: true },
    frequencyDay: { type: String, required: true },
    firstContributionDate: { type: String },
    latePenalty: { type: Number, default: 0 },
    totalMembers: { type: Number, required: true, min: 1 },
    totalMonths: { type: Number, default: 0 },
    totalWeeks: { type: Number, default: 0 },
    payoutEnabled: { type: Boolean, default: false },
    autoPayoutEnabled: { type: Boolean, default: false },
    payoutOrder: { type: [String], default: [] },
    nextPayoutIndex: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    members: { type: [Schema.Types.Mixed], default: [] },
    participantHandles: { type: [String], default: [] },
    participantUserIds: { type: [String], default: [] },
    raw: { type: Schema.Types.Mixed, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'ajo_groups',
  },
);

export const AjoGroupModel = model('AjoGroup', ajoGroupSchema);
