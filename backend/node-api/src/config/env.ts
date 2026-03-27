import { config } from 'dotenv';
import { z } from 'zod';

config();

// Backward-compatible aliases for older/shared env naming.
if (!process.env.INTERSWITCH_SECRET && process.env.INTERSWITCH_SECRET_KEY) {
  process.env.INTERSWITCH_SECRET = process.env.INTERSWITCH_SECRET_KEY;
}

if (!process.env.INTERSWITCH_REDIRECT_BASE_URL && process.env.INTERSWITCH_REDIRECT_URL) {
  process.env.INTERSWITCH_REDIRECT_BASE_URL = process.env.INTERSWITCH_REDIRECT_URL;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5001),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/interswitch'),
  ALLOWED_ORIGIN: z.string().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().optional(),
  INTERSWITCH_MERCHANT_CODE: z.string().default('MX6072'),
  INTERSWITCH_PAY_ITEM_ID: z.string().default('9405967'),
  INTERSWITCH_CLIENT_ID: z.string().default('IKIAB23A4E2756605C1ABC33CE3C287E27267F660D61'),
  INTERSWITCH_SECRET: z.string().default('secret'),
  INTERSWITCH_AUTH_MODE: z.enum(['basic', 'bearer', 'none']).default('basic'),
  INTERSWITCH_ACCESS_TOKEN: z.string().optional(),
  INTERSWITCH_TOKEN_URL: z.string().url().optional(),
  INTERSWITCH_PAY_BILL_MODE: z.enum(['live', 'mock']).optional(),
  INTERSWITCH_MODE: z.enum(['TEST', 'LIVE']).default('TEST'),
  INTERSWITCH_BASE_URL: z.string().url().default('https://qa.interswitchng.com'),
  INTERSWITCH_INLINE_SCRIPT_URL: z.string().url().default('https://newwebpay.qa.interswitchng.com/inline-checkout.js'),
  INTERSWITCH_REDIRECT_BASE_URL: z.string().url().default('https://newwebpay.qa.interswitchng.com/collections/w/pay'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('interswitch/profiles'),
  JWT_SECRET: z.string().min(12).default('change-this-dev-jwt-secret'),
  JWT_EXPIRES_IN: z.string().default('12h'),
});

export const env = envSchema.parse(process.env);
