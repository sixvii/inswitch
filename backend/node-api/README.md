# Node API

Express + TypeScript API with MongoDB.

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

## Endpoints

- `GET /api/health`
- `GET /api/transactions`
- `GET /api/transactions/:transactionId`
- `POST /api/transactions`
- `GET /api/interswitch/config`
- `POST /api/interswitch/pay-bill`
- `GET /api/interswitch/verify?transactionReference=<ref>&amount=<kobo>`
