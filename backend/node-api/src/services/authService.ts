import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

interface AuthClaims {
  userId: string;
  phone: string;
  username: string;
}

export const issueAuthToken = (claims: AuthClaims) => {
  const signOptions: jwt.SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  };

  return jwt.sign(claims, env.JWT_SECRET, {
    ...signOptions,
  });
};
