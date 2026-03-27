import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { z } from 'zod';
import { UserModel } from '../models/User.js';
import { TransactionModel } from '../models/Transaction.js';
import { NotificationModel } from '../models/Notification.js';
import { AjoGroupModel } from '../models/AjoGroup.js';
import { issueAuthToken } from '../services/authService.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { uploadProfileImageToCloudinary } from '../services/cloudinary.js';

export const usersRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
});

const registerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email(),
  age: z.string().min(1),
  username: z.string().min(3),
  pin: z.string().min(4),
  password: z.string().min(4),
  nin: z.string().optional(),
  accountNumber: z.string().min(10),
  walletId: z.string().min(3),
  createdAt: z.string().min(1),
  faceVerified: z.boolean(),
  ajoUsername: z.string().optional(),
  profileImage: z.string().optional(),
  ajoActivated: z.boolean().optional(),
  piggyActivated: z.boolean().optional(),
  escrowActivated: z.boolean().optional(),
  escrowWalletId: z.string().optional(),
  lockedFunds: z.array(z.unknown()).optional(),
});

const loginSchema = z.object({
  phone: z.string().min(10),
  username: z.string().min(3),
  password: z.string().min(4),
  pin: z.string().min(4),
});

const userStateSchema = z.object({
  escrows: z.array(z.unknown()).optional(),
  savingsGroups: z.array(z.unknown()).optional(),
  userRequests: z.array(z.unknown()).optional(),
  paycodeHistory: z.array(z.unknown()).optional(),
  lockedFunds: z.array(z.unknown()).optional(),
  loans: z.array(z.unknown()).optional(),
  trustScore: z.record(z.unknown()).optional(),
});

const accountStateCommitSchema = z.object({
  nextBalance: z.number().min(0),
  expectedBalance: z.number().min(0).optional(),
});

const syncAjoGroupSchema = z.object({
  group: z.record(z.unknown()),
});

const preferencesSchema = z.object({
  ajoActivated: z.boolean().optional(),
  ajoUsername: z.string().min(3).optional(),
  piggyActivated: z.boolean().optional(),
  escrowActivated: z.boolean().optional(),
  escrowWalletId: z.string().min(3).optional(),
  pin: z.string().min(4).optional(),
});

const normalizeUser = (doc: any) => {
  const raw = doc?.toObject ? doc.toObject() : doc;
  if (!raw) {
    throw new Error('Unable to normalize user record');
  }
  return {
    id: raw._id?.toString() || raw.id,
    firstName: raw.firstName,
    lastName: raw.lastName,
    phone: raw.phone,
    email: raw.email,
    age: raw.age,
    username: raw.username,
    nin: raw.nin,
    accountNumber: raw.accountNumber,
    walletId: raw.walletId,
    createdAt: raw.createdAt,
    faceVerified: raw.faceVerified,
    ajoUsername: raw.ajoUsername,
    profileImage: raw.profileImage,
    ajoActivated: raw.ajoActivated,
    piggyActivated: raw.piggyActivated,
    escrowActivated: raw.escrowActivated,
    escrowWalletId: raw.escrowWalletId,
    lockedFunds: raw.lockedFunds || [],
  };
};

const verifySecret = async (incoming: string, stored: string) => {
  if (!stored) return false;
  try {
    return await bcrypt.compare(incoming, stored);
  } catch {
    // Backward compatibility for legacy plaintext records during transition.
    return incoming === stored;
  }
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeHandle = (value: string) => value.trim().replace(/^@+/, '').toLowerCase();

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
};

const buildPhoneLookup = (value: string) => {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  const normalized = normalizePhone(trimmed);

  const variants = Array.from(new Set([
    trimmed,
    digits,
    normalized,
    normalized ? `0${normalized}` : '',
    normalized ? `234${normalized}` : '',
    normalized ? `+234${normalized}` : '',
  ].filter((entry) => entry.length >= 10)));

  return {
    normalized,
    variants,
    suffixRegex: normalized ? new RegExp(`${escapeRegex(normalized)}$`) : null,
  };
};

const DEFAULT_TRUST_SCORE = {
  overall: 450,
  transactionVolume: 60,
  savingsDiscipline: 50,
  escrowReliability: 70,
  billPaymentConsistency: 55,
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const computeTrustScoreFromActivity = (user: any, transactions: any[]) => {
  const accountNumber = String(user?.accountNumber || '');
  const walletId = String(user?.walletId || '');
  const userHandle = normalizeHandle(String(user?.ajoUsername || user?.username || ''));

  const myTransactions = Array.isArray(transactions) ? transactions : [];
  const myEscrows = (Array.isArray(user?.escrows) ? user.escrows : []).filter((entry: any) => (
    String(entry?.buyerWalletId || '') === walletId || String(entry?.sellerWalletId || '') === walletId
  ));

  const mySavingsContributions = (Array.isArray(user?.savingsGroups) ? user.savingsGroups : [])
    .flatMap((group: any) => (Array.isArray(group?.members) ? group.members : []))
    .filter((member: any) => normalizeHandle(String(member?.ajoUsername || '')) === userHandle)
    .flatMap((member: any) => (Array.isArray(member?.contributions) ? member.contributions : []));

  const myBillTransactions = myTransactions.filter((tx: any) => (
    tx?.type === 'bills' || tx?.type === 'airtime' || tx?.type === 'data' || tx?.type === 'insurance'
  ));

  const hasActivity =
    myTransactions.length > 0 ||
    myEscrows.length > 0 ||
    mySavingsContributions.length > 0 ||
    myBillTransactions.length > 0;

  if (!hasActivity) {
    return user?.trustScore || DEFAULT_TRUST_SCORE;
  }

  const successfulTransactions = myTransactions.filter((tx: any) => tx?.status === 'success').length;
  const transactionVolume = clampPercent((successfulTransactions / 25) * 100);

  const paidContributions = mySavingsContributions.filter((contribution: any) => contribution?.status === 'paid').length;
  const savingsDiscipline = mySavingsContributions.length > 0
    ? clampPercent((paidContributions / mySavingsContributions.length) * 100)
    : 0;

  const reliableEscrows = myEscrows.filter((entry: any) => entry?.status === 'released').length;
  const escrowReliability = myEscrows.length > 0
    ? clampPercent((reliableEscrows / myEscrows.length) * 100)
    : 0;

  const successfulBills = myBillTransactions.filter((tx: any) => tx?.status === 'success').length;
  const billPaymentConsistency = myBillTransactions.length > 0
    ? clampPercent((successfulBills / myBillTransactions.length) * 100)
    : 0;

  const weightedAverage = (
    (transactionVolume * 0.35) +
    (savingsDiscipline * 0.25) +
    (escrowReliability * 0.2) +
    (billPaymentConsistency * 0.2)
  );

  return {
    overall: Math.round((weightedAverage / 100) * 850),
    transactionVolume,
    savingsDiscipline,
    escrowReliability,
    billPaymentConsistency,
  };
};

const buildUserStatePayload = async (user: any) => {
  const userId = String(user?._id || '');
  const transactions = userId
    ? await TransactionModel.find({ ownerUserId: userId }).lean()
    : [];

  const trustScore = computeTrustScoreFromActivity(user, transactions);

  if (userId && JSON.stringify(user?.trustScore || {}) !== JSON.stringify(trustScore)) {
    await UserModel.updateOne({ _id: userId }, { $set: { trustScore } });
  }

  return {
    escrows: user.escrows || [],
    savingsGroups: user.savingsGroups || [],
    userRequests: user.userRequests || [],
    paycodeHistory: user.paycodeHistory || [],
    lockedFunds: user.lockedFunds || [],
    loans: user.loans || [],
    trustScore,
  };
};

usersRouter.get('/exists', async (req, res, next) => {
  try {
    const phone = z.string().min(10).parse(req.query.phone);
    const lookup = buildPhoneLookup(phone);
    const user = await UserModel.findOne({
      $or: [
        { phone: { $in: lookup.variants } },
        ...(lookup.suffixRegex ? [{ phone: lookup.suffixRegex }] : []),
      ],
    }).lean();
    res.status(200).json({ data: { exists: !!user } });
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/search', requireAuth, async (req, res, next) => {
  try {
    const query = z.string().min(1).parse(req.query.query);
    const normalized = query.trim().replace(/^@+/, '');

    if (normalized.length < 2) {
      res.status(200).json({ data: [] });
      return;
    }

    const lookupRegex = new RegExp(`^${escapeRegex(normalized)}`, 'i');
    const currentUserId = req.authUser?.userId;

    const users = await UserModel.find({
      ...(currentUserId ? { _id: { $ne: currentUserId } } : {}),
      $or: [
        { username: lookupRegex },
        { ajoUsername: lookupRegex },
      ],
    })
      .sort({ username: 1 })
      .limit(8)
      .lean();

    res.status(200).json({
      data: users.map((user) => ({
        id: user._id?.toString(),
        accountNumber: user.accountNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        walletId: user.walletId,
        username: user.username,
        ajoUsername: user.ajoUsername,
        ajoActivated: !!user.ajoActivated,
      })),
    });
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/by-account/:accountNumber', requireAuth, async (req, res, next) => {
  try {
    const accountNumber = z.string().min(10).parse(req.params.accountNumber);
    const user = await UserModel.findOne({ accountNumber }).lean();

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({
      data: {
        id: user._id?.toString(),
        accountNumber: user.accountNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        walletId: user.walletId,
      },
    });
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/by-username/:username', requireAuth, async (req, res, next) => {
  try {
    const username = z.string().min(3).parse(req.params.username);
    const normalized = username.trim().replace(/^@+/, '');
    const lookupRegex = new RegExp(`^${escapeRegex(normalized)}$`, 'i');
    const user = await UserModel.findOne({
      $or: [
        { username: lookupRegex },
        { ajoUsername: lookupRegex },
      ],
    }).lean();

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({
      data: {
        id: user._id?.toString(),
        accountNumber: user.accountNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        walletId: user.walletId,
        username: user.username,
        ajoUsername: user.ajoUsername,
        ajoActivated: !!user.ajoActivated,
      },
    });
  } catch (error) {
    next(error);
  }
});

usersRouter.post('/register', async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);
    const lookup = buildPhoneLookup(payload.phone);

    if (!lookup.normalized || lookup.normalized.length < 10) {
      res.status(400).json({ message: 'Invalid phone number' });
      return;
    }

    const conflict = await UserModel.findOne({
      $or: [
        { phone: { $in: lookup.variants } },
        ...(lookup.suffixRegex ? [{ phone: lookup.suffixRegex }] : []),
        { username: payload.username },
        { accountNumber: payload.accountNumber },
      ],
    }).lean();

    if (conflict) {
      res.status(409).json({ message: 'User already exists with provided phone, username, or account number' });
      return;
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const pinHash = await bcrypt.hash(payload.pin, 12);

    const created = await UserModel.create({
      ...payload,
      phone: lookup.normalized,
      password: passwordHash,
      pin: pinHash,
      balance: 50000,
    });

    const normalizedUser = normalizeUser(created);
    const token = issueAuthToken({
      userId: normalizedUser.id,
      phone: normalizedUser.phone,
      username: normalizedUser.username,
    });

    res.status(201).json({ data: normalizedUser, token });
  } catch (error) {
    next(error);
  }
});

usersRouter.post('/login', async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const lookup = buildPhoneLookup(payload.phone);
    const user = await UserModel.findOne({
      $or: [
        { phone: { $in: lookup.variants } },
        ...(lookup.suffixRegex ? [{ phone: lookup.suffixRegex }] : []),
      ],
    }).lean();

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (user.username !== payload.username) {
      res.status(401).json({ message: 'Username does not match' });
      return;
    }

    const passwordValid = await verifySecret(payload.password, user.password);
    if (!passwordValid) {
      res.status(401).json({ message: 'Incorrect password' });
      return;
    }

    const pinValid = await verifySecret(payload.pin, user.pin);
    if (!pinValid) {
      res.status(401).json({ message: 'Incorrect PIN' });
      return;
    }

    const normalizedUser = normalizeUser(user);
    const token = issueAuthToken({
      userId: normalizedUser.id,
      phone: normalizedUser.phone,
      username: normalizedUser.username,
    });

    res.status(200).json({ data: normalizedUser, token });
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/me/state', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const user = await UserModel.findById(userId).lean();
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({ data: await buildUserStatePayload(user) });
  } catch (error) {
    next(error);
  }
});

usersRouter.put('/me/state', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const payload = userStateSchema.parse(req.body);
    const updateDoc: Record<string, unknown> = {};

    if (payload.savingsGroups) updateDoc.savingsGroups = payload.savingsGroups;
    if (payload.userRequests) updateDoc.userRequests = payload.userRequests;
    if (payload.paycodeHistory) updateDoc.paycodeHistory = payload.paycodeHistory;
    if (payload.lockedFunds) updateDoc.lockedFunds = payload.lockedFunds;
    if (payload.escrows) updateDoc.escrows = payload.escrows;
    if (payload.loans) updateDoc.loans = payload.loans;
    if (payload.trustScore) updateDoc.trustScore = payload.trustScore;

    const updated = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updateDoc },
      { new: true },
    ).lean();

    if (!updated) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({ data: await buildUserStatePayload(updated) });
  } catch (error) {
    next(error);
  }
});

usersRouter.put('/ajo/groups/:groupId/sync', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const groupId = z.string().min(1).parse(req.params.groupId);
    const payload = syncAjoGroupSchema.parse(req.body);
    const group = payload.group as Record<string, any>;
    const existingGroupDoc = await AjoGroupModel.findOne({ groupId }).lean();

    if (!group || group.id !== groupId) {
      res.status(400).json({ message: 'Invalid group payload' });
      return;
    }

    const creatorHandle = normalizeHandle(String(group.creatorUsername || ''));
    const members = Array.isArray(group.members) ? group.members : [];
    const memberHandles = members
      .map((member: any) => normalizeHandle(String(member?.ajoUsername || '')))
      .filter(Boolean);

    const participantHandles = new Set<string>([creatorHandle, ...memberHandles].filter(Boolean));
    if (participantHandles.size === 0) {
      res.status(400).json({ message: 'Group must contain creator or members' });
      return;
    }

    const previousAcceptedHandles = new Set(
      (Array.isArray(existingGroupDoc?.members) ? existingGroupDoc.members : [])
        .filter((member: any) => !!member?.accepted && !!member?.ajoUsername)
        .map((member: any) => normalizeHandle(String(member.ajoUsername))),
    );

    const currentAcceptedHandles = new Set(
      members
        .filter((member: any) => !!member?.accepted && !!member?.ajoUsername)
        .map((member: any) => normalizeHandle(String(member.ajoUsername))),
    );

    const newlyAcceptedHandles = Array.from(currentAcceptedHandles).filter((handle) => !previousAcceptedHandles.has(handle));

    const authUser = await UserModel.findById(userId).lean();
    if (!authUser) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const authHandle = normalizeHandle(String(authUser.ajoUsername || authUser.username || ''));
    if (!participantHandles.has(authHandle)) {
      res.status(403).json({ message: 'Only group participants can update this group' });
      return;
    }

    const handleRegexes = Array.from(participantHandles).map((handle) => new RegExp(`^${escapeRegex(handle)}$`, 'i'));
    const impactedUsers = await UserModel.find({
      $or: [
        { 'savingsGroups.id': groupId },
        { ajoUsername: { $in: handleRegexes } },
        { username: { $in: handleRegexes } },
      ],
    }).lean();

    const updates = impactedUsers.map((entry) => {
      const entryHandle = normalizeHandle(String(entry.ajoUsername || entry.username || ''));
      const existingGroups = Array.isArray(entry.savingsGroups) ? entry.savingsGroups : [];
      const withoutCurrent = existingGroups.filter((savedGroup: any) => savedGroup?.id !== groupId);
      const shouldHaveGroup = participantHandles.has(entryHandle);
      const nextGroups = shouldHaveGroup ? [group, ...withoutCurrent] : withoutCurrent;

      return {
        updateOne: {
          filter: { _id: entry._id },
          update: { $set: { savingsGroups: nextGroups } },
        },
      };
    });

    if (updates.length > 0) {
      await UserModel.bulkWrite(updates);
    }

    await AjoGroupModel.findOneAndUpdate(
      { groupId },
      {
        $set: {
          groupId,
          name: String(group.name || 'Ajo Group'),
          creatorUsername: String(group.creatorUsername || ''),
          contributionAmount: Number(group.contributionAmount || 0),
          frequency: String(group.frequency || 'weekly'),
          frequencyDay: String(group.frequencyDay || ''),
          firstContributionDate: group.firstContributionDate ? String(group.firstContributionDate) : undefined,
          latePenalty: Number(group.latePenalty || 0),
          totalMembers: Number(group.totalMembers || 1),
          totalMonths: Number(group.totalMonths || 0),
          totalWeeks: Number(group.totalWeeks || 0),
          payoutEnabled: !!group.payoutEnabled,
          autoPayoutEnabled: !!group.autoPayoutEnabled,
          payoutOrder: Array.isArray(group.payoutOrder) ? group.payoutOrder : [],
          nextPayoutIndex: Number(group.nextPayoutIndex || 0),
          status: String(group.status || 'active'),
          members,
          participantHandles: Array.from(participantHandles),
          participantUserIds: impactedUsers.map((entry) => String(entry._id)),
          raw: group,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const usersByHandle = new Map<string, any>();
    impactedUsers.forEach((entry) => {
      const handle = normalizeHandle(String(entry.ajoUsername || entry.username || ''));
      if (handle) usersByHandle.set(handle, entry);
    });

    const pendingMembers = members.filter((member: any) => !member?.accepted && member?.ajoUsername);
    for (const pendingMember of pendingMembers) {
      const pendingHandle = normalizeHandle(String(pendingMember.ajoUsername));
      if (!pendingHandle || pendingHandle === creatorHandle) continue;

      const targetUser = usersByHandle.get(pendingHandle);
      if (!targetUser?._id) continue;

      const alreadyExists = await NotificationModel.findOne({
        userId: targetUser._id.toString(),
        type: 'ajo-invitation',
        'data.groupId': groupId,
        read: false,
      }).lean();

      if (!alreadyExists) {
        await NotificationModel.create({
          userId: targetUser._id.toString(),
          type: 'ajo-invitation',
          title: 'Ajo Group Invitation',
          message: `You were added to ${String(group.name || 'an Ajo group')}. Review group details and choose your slot(s).`,
          data: {
            groupId,
            groupName: group.name,
            creatorUsername: group.creatorUsername,
          },
          read: false,
        });
      }
    }

    const creatorUser = usersByHandle.get(creatorHandle);
    if (creatorUser?._id && newlyAcceptedHandles.length > 0) {
      for (const acceptedHandle of newlyAcceptedHandles) {
        if (acceptedHandle === creatorHandle) continue;

        const acceptedMember = members.find(
          (member: any) => normalizeHandle(String(member?.ajoUsername || '')) === acceptedHandle,
        );
        if (!acceptedMember?.ajoUsername) continue;

        const alreadyNotified = await NotificationModel.findOne({
          userId: creatorUser._id.toString(),
          type: 'ajo-member-joined',
          'data.groupId': groupId,
          'data.memberUsername': acceptedMember.ajoUsername,
        }).lean();

        if (alreadyNotified) continue;

        await NotificationModel.create({
          userId: creatorUser._id.toString(),
          type: 'ajo-member-joined',
          title: 'Ajo Member Joined',
          message: `${String(acceptedMember.fullName || acceptedMember.ajoUsername)} accepted your invitation in ${String(group.name || 'your Ajo group')}.`,
          data: {
            groupId,
            groupName: group.name,
            memberUsername: acceptedMember.ajoUsername,
            memberName: acceptedMember.fullName,
          },
          read: false,
        });
      }
    }

    const refreshed = await UserModel.findById(userId).lean();
    if (!refreshed) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({ data: await buildUserStatePayload(refreshed) });
  } catch (error) {
    next(error);
  }
});

usersRouter.delete('/ajo/groups/:groupId/sync', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const groupId = z.string().min(1).parse(req.params.groupId);
    const authUser = await UserModel.findById(userId).lean();
    if (!authUser) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const group = (authUser.savingsGroups || []).find((entry: any) => entry?.id === groupId) as Record<string, any> | undefined;
    if (!group) {
      res.status(404).json({ message: 'Ajo group not found' });
      return;
    }

    const creatorHandle = normalizeHandle(String(group.creatorUsername || ''));
    const members = Array.isArray(group.members) ? group.members : [];
    const memberHandles = members
      .map((member: any) => normalizeHandle(String(member?.ajoUsername || '')))
      .filter(Boolean);
    const participantHandles = new Set<string>([creatorHandle, ...memberHandles].filter(Boolean));

    const handleRegexes = Array.from(participantHandles).map((handle) => new RegExp(`^${escapeRegex(handle)}$`, 'i'));
    const impactedUsers = await UserModel.find({
      $or: [
        { 'savingsGroups.id': groupId },
        { ajoUsername: { $in: handleRegexes } },
        { username: { $in: handleRegexes } },
      ],
    }).lean();

    const updates = impactedUsers.map((entry) => {
      const existingGroups = Array.isArray(entry.savingsGroups) ? entry.savingsGroups : [];
      const nextGroups = existingGroups.filter((savedGroup: any) => savedGroup?.id !== groupId);
      return {
        updateOne: {
          filter: { _id: entry._id },
          update: { $set: { savingsGroups: nextGroups } },
        },
      };
    });

    if (updates.length > 0) {
      await UserModel.bulkWrite(updates);
    }

    await AjoGroupModel.deleteOne({ groupId });

    const refreshed = await UserModel.findById(userId).lean();
    if (!refreshed) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({ data: await buildUserStatePayload(refreshed) });
  } catch (error) {
    next(error);
  }
});

usersRouter.patch('/me/preferences', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const payload = preferencesSchema.parse(req.body);
    const updateDoc: Record<string, unknown> = {};

    const requiresPinForActivation =
      payload.ajoActivated === true || payload.piggyActivated === true || payload.escrowActivated === true;

    const existingUser = await UserModel.findById(userId).lean();
    if (!existingUser) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (requiresPinForActivation) {
      if (!payload.pin) {
        res.status(400).json({ message: 'PIN is required to activate this service' });
        return;
      }

      const pinValid = await verifySecret(payload.pin, existingUser.pin);
      if (!pinValid) {
        res.status(401).json({ message: 'Incorrect PIN' });
        return;
      }
    }

    if (payload.ajoActivated !== undefined) updateDoc.ajoActivated = payload.ajoActivated;
    if (payload.ajoUsername !== undefined) updateDoc.ajoUsername = payload.ajoUsername;
    if (payload.piggyActivated !== undefined) updateDoc.piggyActivated = payload.piggyActivated;
    if (payload.escrowActivated !== undefined) updateDoc.escrowActivated = payload.escrowActivated;
    if (payload.escrowWalletId !== undefined) updateDoc.escrowWalletId = payload.escrowWalletId;

    const updated = await UserModel.findByIdAndUpdate(userId, { $set: updateDoc }, { new: true }).lean();

    if (!updated) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({ data: normalizeUser(updated) });
  } catch (error) {
    next(error);
  }
});

usersRouter.put('/me/profile-image', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'Image file is required' });
      return;
    }

    if (!file.mimetype?.startsWith('image/')) {
      res.status(400).json({ message: 'Only image files are allowed' });
      return;
    }

    const profileImage = await uploadProfileImageToCloudinary(file.buffer, userId);
    const updated = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { profileImage } },
      { new: true },
    );

    if (!updated) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({
      data: {
        profileImage,
      },
    });
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/me/account-state', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const user = await UserModel.findById(userId).lean();
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({
      data: {
        balance: typeof user.balance === 'number' ? user.balance : 50000,
      },
    });
  } catch (error) {
    next(error);
  }
});

usersRouter.put('/me/account-state/commit', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const payload = accountStateCommitSchema.parse(req.body);
    const filter: Record<string, unknown> = { _id: userId };
    if (typeof payload.expectedBalance === 'number') {
      filter.balance = payload.expectedBalance;
    }

    const updated = await UserModel.findOneAndUpdate(
      filter,
      { $set: { balance: payload.nextBalance } },
      { new: true },
    ).lean();

    if (!updated) {
      if (typeof payload.expectedBalance === 'number') {
        res.status(409).json({ message: 'Account balance changed. Refresh and try again.' });
        return;
      }
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({
      data: {
        balance: updated.balance,
      },
    });
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/debug/ajo-data', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const user = await UserModel.findById(userId).lean();
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({
      data: {
        userId: user._id?.toString(),
        username: user.username,
        ajoActivated: user.ajoActivated,
        ajoUsername: user.ajoUsername,
        savingsGroupsCount: (user.savingsGroups || []).length,
        savingsGroups: user.savingsGroups || [],
      },
    });
  } catch (error) {
    next(error);
  }
});
