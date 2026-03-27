import { UserModel } from '../models/User.js';
import { TransactionModel } from '../models/Transaction.js';
import { NotificationModel } from '../models/Notification.js';
import { AjoGroupModel } from '../models/AjoGroup.js';

interface SavingsGroup {
  id: string;
  name: string;
  creatorUsername: string;
  members: any[];
  payoutEnabled?: boolean;
  autoPayoutEnabled?: boolean;
  payoutOrder?: string[];
  nextPayoutIndex?: number;
  contributionAmount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  frequencyDay?: string;
  firstContributionDate?: string;
  createdAt: string;
}

interface AjoMember {
  ajoUsername: string;
  fullName: string;
  accepted?: boolean;
  slots?: number;
  contributions: Array<{
    id: string;
    memberUsername: string;
    amount?: number;
    date: string;
    status: 'paid' | 'pending';
  }>;
}

const getCurrentPeriodKey = (group: SavingsGroup, date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfWeek = date.getDay();

  if (group.frequency === 'weekly') {
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - dayOfWeek);
    const weekYear = weekStart.getFullYear();
    const weekMonth = String(weekStart.getMonth() + 1).padStart(2, '0');
    const weekDay = String(weekStart.getDate()).padStart(2, '0');
    return `${weekYear}-${weekMonth}-${weekDay}`;
  }

  if (group.frequency === 'biweekly') {
    const biWeekStart = new Date(date);
    const daysOff = dayOfWeek + (Math.floor(date.getDate() / 14) * 7);
    biWeekStart.setDate(date.getDate() - daysOff);
    const biYear = biWeekStart.getFullYear();
    const biMonth = String(biWeekStart.getMonth() + 1).padStart(2, '0');
    const biDay = String(biWeekStart.getDate()).padStart(2, '0');
    return `${biYear}-${biMonth}-${biDay}`;
  }

  return `${year}-${month}`;
};

const getContributionPeriodKey = (group: SavingsGroup, dateStr: string): string => {
  return getCurrentPeriodKey(group, new Date(dateStr));
};

const getLatestContributionTimestampForPeriod = (
  group: SavingsGroup,
  members: AjoMember[],
  periodKey: string,
): number | null => {
  const timestamps: number[] = [];

  members.forEach((member) => {
    member.contributions
      .filter((contribution) => (
        contribution.status === 'paid'
        && contribution.memberUsername !== '__PAYOUT__'
        && getContributionPeriodKey(group, contribution.date) === periodKey
      ))
      .forEach((contribution) => {
        timestamps.push(new Date(contribution.date).getTime());
      });
  });

  return timestamps.length > 0 ? Math.max(...timestamps) : null;
};

export async function processAutoPayouts() {
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const startTime = Date.now();

    const groups = await AjoGroupModel.find({
      payoutEnabled: true,
      autoPayoutEnabled: true,
      status: 'active',
    }).lean();

    let payoutsProcessed = 0;
    let notificationsCreated = 0;

    for (const groupDoc of groups) {
      const group = (groupDoc.raw || {
        id: groupDoc.groupId,
        name: groupDoc.name,
        creatorUsername: groupDoc.creatorUsername,
        members: groupDoc.members || [],
        payoutEnabled: groupDoc.payoutEnabled,
        autoPayoutEnabled: groupDoc.autoPayoutEnabled,
        payoutOrder: groupDoc.payoutOrder || [],
        nextPayoutIndex: groupDoc.nextPayoutIndex || 0,
        contributionAmount: groupDoc.contributionAmount,
        frequency: groupDoc.frequency,
        frequencyDay: groupDoc.frequencyDay,
        firstContributionDate: groupDoc.firstContributionDate,
        createdAt: new Date().toISOString(),
      }) as SavingsGroup;

      if (!group.payoutEnabled || !group.autoPayoutEnabled) continue;

      const members = (group.members || []) as AjoMember[];
      const acceptedMembers = members.filter((member) => member.accepted && !!member.ajoUsername);
      if (acceptedMembers.length === 0) continue;

      const periodKey = getCurrentPeriodKey(group, now);
      const allPaid = acceptedMembers.every((member) => (
        member.contributions.some((contribution) => (
          contribution.status === 'paid'
          && contribution.memberUsername !== '__PAYOUT__'
          && getContributionPeriodKey(group, contribution.date) === periodKey
        ))
      ));
      if (!allPaid) continue;

      const alreadyProcessed = acceptedMembers.some((member) => (
        member.contributions.some((contribution) => (
          contribution.status === 'paid'
          && contribution.memberUsername === '__PAYOUT__'
          && getContributionPeriodKey(group, contribution.date) === periodKey
        ))
      ));
      if (alreadyProcessed) continue;

      const latestTimestamp = getLatestContributionTimestampForPeriod(group, acceptedMembers, periodKey);
      if (latestTimestamp === null) continue;

      const isPayoutWindowOpen = now.getTime() >= latestTimestamp + 24 * 60 * 60 * 1000;
      if (!isPayoutWindowOpen) continue;

      const payoutOrder = group.payoutOrder || [];
      if (payoutOrder.length === 0) continue;

      const startIndex = group.nextPayoutIndex ?? 0;
      const recipientUsername = payoutOrder[startIndex % payoutOrder.length];
      const winnerIndex = members.findIndex((member) => member.ajoUsername === recipientUsername);
      if (winnerIndex < 0) continue;

      const potAmount = acceptedMembers.reduce(
        (sum, member) => sum + group.contributionAmount * Math.max(member.slots || 1, 1),
        0,
      );

      const recipientUser = await UserModel.findOne({
        ajoUsername: new RegExp(`^${recipientUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).lean();
      if (!recipientUser) continue;

      const transactionIdempotencyKey = `ajo-autopayout-${group.id}-${periodKey}-${recipientUsername}`;
      const existingTx = await TransactionModel.findOne({ idempotencyKey: transactionIdempotencyKey }).lean();
      if (existingTx) continue;

      try {
        await UserModel.updateOne(
          { _id: recipientUser._id },
          { $inc: { balance: potAmount } },
        );

        await TransactionModel.create({
          idempotencyKey: transactionIdempotencyKey,
          type: 'receive',
          amount: potAmount,
          senderAccount: group.id,
          receiverAccount: recipientUser.accountNumber,
          senderName: `${group.name} Pool`,
          receiverName: `${recipientUser.firstName} ${recipientUser.lastName}`,
          description: `Ajo payout - ${group.name}`,
          status: 'success',
          ownerUserId: recipientUser._id?.toString(),
        });

        const existingPayoutNotification = await NotificationModel.findOne({
          userId: recipientUser._id?.toString(),
          type: 'ajo-payout',
          'data.groupId': group.id,
          'data.periodKey': periodKey,
        }).lean();

        if (!existingPayoutNotification) {
          await NotificationModel.create({
            userId: recipientUser._id?.toString(),
            type: 'ajo-payout',
            title: 'Ajo Payout Received!',
            message: `You received ₦${potAmount.toLocaleString()} from ${group.name}`,
            data: {
              groupId: group.id,
              groupName: group.name,
              amount: potAmount,
              periodKey,
            },
            read: false,
          });
          notificationsCreated += 1;
        }

        const payoutMarker = {
          id: `payout-${group.id}-${periodKey}-${Date.now()}`,
          groupId: group.id,
          memberUsername: '__PAYOUT__',
          amount: potAmount,
          date: nowIso,
          status: 'paid' as const,
        };

        const updatedMembers = members.map((member, index) => {
          if (index !== winnerIndex) return member;
          return {
            ...member,
            contributions: [payoutMarker, ...(member.contributions || [])],
          };
        });

        const updatedGroup = {
          ...group,
          members: updatedMembers,
          nextPayoutIndex: startIndex + 1,
        };

        await AjoGroupModel.updateOne(
          { groupId: group.id },
          {
            $set: {
              members: updatedMembers,
              nextPayoutIndex: startIndex + 1,
              raw: updatedGroup,
            },
          },
        );

        const impactedUsers = await UserModel.find({ 'savingsGroups.id': group.id }).lean();
        if (impactedUsers.length > 0) {
          const updates = impactedUsers.map((entry) => {
            const existingGroups = Array.isArray(entry.savingsGroups) ? entry.savingsGroups : [];
            const nextGroups = existingGroups.map((savedGroup: any) => (
              savedGroup?.id === group.id ? updatedGroup : savedGroup
            ));

            return {
              updateOne: {
                filter: { _id: entry._id },
                update: { $set: { savingsGroups: nextGroups } },
              },
            };
          });

          await UserModel.bulkWrite(updates);
        }

        payoutsProcessed += 1;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to process payout for group ${group.id}, recipient ${recipientUsername}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    // eslint-disable-next-line no-console
    console.log(
      `Auto-payout job completed: ${payoutsProcessed} payouts, ${notificationsCreated} notifications in ${duration}ms`,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto-payout job failed:', error);
  }
}
