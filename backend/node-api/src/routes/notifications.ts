import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { NotificationModel } from '../models/Notification.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const notifications = await NotificationModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await NotificationModel.countDocuments({
      userId,
      read: false,
    });

    res.status(200).json({
      data: notifications,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.patch('/:notificationId/read', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const notification = await NotificationModel.findOneAndUpdate(
      {
        _id: req.params.notificationId,
        userId,
      },
      { $set: { read: true } },
      { new: true },
    );

    if (!notification) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }

    res.status(200).json({
      message: 'Notification marked as read',
      data: notification,
    });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.patch('/read-all', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    await NotificationModel.updateMany(
      {
        userId,
        read: false,
      },
      { $set: { read: true } },
    );

    res.status(200).json({
      message: 'All notifications marked as read',
    });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.delete('/:notificationId', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const notification = await NotificationModel.findOneAndDelete({
      _id: req.params.notificationId,
      userId,
    });

    if (!notification) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }

    res.status(200).json({
      message: 'Notification deleted',
    });
  } catch (error) {
    next(error);
  }
});
