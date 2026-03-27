# Backend Workspace

This backend folder now contains a hybrid architecture:

- `node-api`: Express + TypeScript API (good for rapid integration and orchestration)
- `java-service`: Spring Boot + MongoDB API (good for domain workflows and strongly typed services)
- `docker-compose.yml`: Local MongoDB runtime

## Prerequisites

- Node.js 20+
- Java 21+
- Maven 3.9+
- Docker

## 1) Start MongoDB

From this backend folder:

```bash
docker compose up -d
```

MongoDB will run on `mongodb://localhost:27017/interswitch`.

## 2) Run Node API

```bash
cd node-api
cp .env.example .env
npm install
npm run dev
```

Node API base URL: `http://localhost:5001`

Endpoints:

- `GET /api/health`
- `GET /api/transactions`
- `GET /api/transactions/:transactionId`
- `POST /api/transactions`

Sample payload:

```json
{
  "idempotencyKey": "txn-demo-0001",
  "type": "send",
  "amount": 12000,
  "senderAccount": "1234567890",
  "receiverAccount": "0123456789",
  "senderName": "Jane Doe",
  "receiverName": "John Doe",
  "description": "Demo transfer",
  "status": "pending"
}
```

## 3) Run Java Service

```bash
cd java-service
cp .env.example .env
export $(grep -v '^#' .env | xargs)
./mvnw spring-boot:run
```

If `mvnw` is unavailable in your environment, run:

```bash
mvn spring-boot:run
```

Java service base URL: `http://localhost:8081`

Endpoints:

- `GET /api/health`
- `GET /api/payouts`
- `POST /api/payouts`

Sample payload:

```json
{
  "idempotencyKey": "payout-demo-001",
  "beneficiaryName": "Alex Johnson",
  "beneficiaryAccount": "0099887766",
  "bankCode": "033",
  "amount": 5000.00,
  "currency": "NGN",
  "status": "PENDING"
}
```

## Suggested responsibility split

- Node API:
  - Public API gateway for frontend
  - Interswitch API orchestration and webhook intake
  - Request signing, idempotency, retries

- Java service:
  - Payout workflows
  - Approval and reconciliation logic
  - Compliance and audit services

## Next build steps

1. Add shared auth (JWT or session) and role claims.
2. Add provider clients for Interswitch endpoints.
3. Add webhook verification + event store.
4. Connect frontend pages to Node API instead of local Zustand-only simulation.
5. Add integration tests and API contracts.

## Migration: Backfill transaction owners

After introducing user-scoped transaction reads, older transactions may not have `ownerUserId` yet.
Use this migration to map legacy records by account number.

Dry run (recommended first):

```bash
cd node-api
npm run migrate:backfill-transaction-owners
```

Apply updates:

```bash
cd node-api
npm run migrate:backfill-transaction-owners:apply
```

Notes:
- Mapping is based on `senderAccount` and `receiverAccount` matched against users' `accountNumber`.
- Ambiguous and unmatched records are reported but not modified.
- A CSV report for unresolved records is generated in `node-api/migration-reports/` for manual cleanup.
- Frontend auth-expiry handling is already active for current protected APIs (`/api/transactions`, `/api/interswitch/pay-bill`, `/api/interswitch/verify`).
