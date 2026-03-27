# Java Service

Spring Boot + MongoDB service for payout and workflow operations.

## Setup

```bash
cp .env.example .env
export $(grep -v '^#' .env | xargs)
mvn spring-boot:run
```

## Endpoints

- `GET /api/health`
- `GET /api/payouts`
- `POST /api/payouts`
