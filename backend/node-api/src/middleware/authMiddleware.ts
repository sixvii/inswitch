import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

type AuthClaims = {
  userId: string;
  phone: string;
  username: string;
  iat?: number;
  exp?: number;
};

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthClaims;
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing bearer token' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ message: 'Invalid bearer token' });
    return;
  }

  try {
    const claims = jwt.verify(token, env.JWT_SECRET) as AuthClaims;
    req.authUser = claims;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
