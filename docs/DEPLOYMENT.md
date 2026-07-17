# Deployment

This document describes how Framework for Trust (FfT) is deployed across its target platforms, and in what order.

> **Status notice:** As of this writing, the database and backend deployment described below reflect the current setup. The static landing page (Cloudflare Pages) and a fully wired end-to-end deployment (frontend ↔ backend ↔ Qdrant, all pointing at production URLs) are **planned, not yet live** — see the "Landing Page" and "Qdrant Cloud" sections below for current status.

## Deployment Order

Deployment follows a fixed dependency order:

1. **Database** (MySQL) — must exist first, since the backend fails to start without a reachable DB.
2. **Backend** (FastAPI, Railway) — depends on the database and on the deployed smart contracts (Polygon Amoy addresses, see [`CONTRACTS.md`](./CONTRACTS.md)) being already live.
3. **Frontend** (React, Vercel) — depends on the backend's public API URL and on the same contract addresses.
4. **Landing page** (Cloudflare Pages) — independent static site; can be deployed at any point but is listed last as it has no dependency on the others.

## 1. Database — Railway (MySQL)

- MySQL runs as a managed Railway plugin/service alongside the backend service, within the same Railway project.
- Schema is defined in [`db/schema.sql`](../db/schema.sql) (structure only, no data) — apply it to a fresh database before the backend's first start:

```bash
mysql -h <railway-db-host> -P <railway-db-port> -u <user> -p <db_name> < db/schema.sql
```

- Relevant environment variables (see `.env.example`): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. On Railway, host/port/user/password are provided automatically by the MySQL plugin and should be wired into the backend service's environment variables — not hardcoded.

## 2. Backend — Railway (FastAPI)

- No `railway.json`, `railway.toml`, or `Procfile` currently exists in the repository. Railway's default Python buildpack detection is used; a start command must be set manually in the Railway service settings (e.g. `uvicorn main:app --host 0.0.0.0 --port $PORT`, adjusted to match the actual FastAPI entrypoint).
- Required environment variables — grouped by purpose, following `.env.example`:

  **Core**
  `FFT_ENV`, `FFT_API_HOST`, `FFT_API_PORT`, `API_BASE`, `NODE_ENV`, `LOG_LEVEL`

  **Database**
  `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

  **CORS**
  `FFT_CORS_ORIGINS`, `CORS_ORIGINS` — must be updated to the production frontend URL(s) once Vercel and Cloudflare Pages domains are known; the default in `.env.example` (`http://localhost:3000`) is development-only.

  **Blockchain / contracts** (Polygon Amoy — see [`CONTRACTS.md`](./CONTRACTS.md) for addresses)
  `FFT_POLYGON_RPC_URL`, `chainId`, `CONTRACT_ADDRESS`, `GCD_CONTRACT_ADDRESS`, `QUADRANTS_ADDRESS`, `REGISTRY_ADDRESS`, `STAKING_ADDRESS`, `ANCHOR_CONTRACT_ADDRESS`, `MINTER_ROLE`, `BURN_ROLE`, `PAUSER_ROLE`, `ORACLE_ROLE`

  **Backend wallet**
  `BACKEND_WALLET_ADDRESS`, `BACKEND_WALLET_PRIVATE_KEY` — see Security section below.

  **Qdrant**
  `QDRANT_HOST`, `QDRANT_PORT`, `QDRANT_API_KEY`, `QDRANT_COLLECTION`, `QDRANT_VECTOR_SIZE`, `QDRANT_REP_REF` — see Section 3.

  **Indexer**
  `QUADRANTS_DEPLOY_FROM_BLOCK`, `QUADRANTS_LOG_SCAN_STEP`, `QUADRANTS_INDEXER_INTERVAL_SEC`, `QUADRANTS_FINALITY_BLOCKS`, `FFT_QIDX_STEP_START`, `FFT_QIDX_STEP_MIN`, `FFT_QIDX_STEP_MAX`

  **Auth / security**
  `FFT_ADMIN_API_KEY`, `FFT_JWT_SECRET`, `FFT_JWT_ALG`, `FFT_AUTH_JWT_SECRET`, `FFT_AUTH_JWT_TTL_SEC`, `FFT_AUTH_DOMAIN`, `FFT_JWT_PINATA`

  **Embeddings / AI**
  `FFT_USE_PSEUDO_EMBEDDING`, `FFT_EMBEDDING_MODEL`, `OPENAI_API_KEY` (optional)

  **Misc**
  `FFT_PIN_REQUIRE_SIG`, `MAX_EVENTS_PER_WALLET_PER_DAY`, `FFT_GCD_DAILY_REWARD_CAP`, `ENABLE_TESTNET_FAUCET`, `FAUCET_AMOUNT_GCD`, `FAUCET_COOLDOWN_HOURS`

- The full annotated reference is [`.env.example`](../.env.example) — always the source of truth; the grouping above is a navigation aid, not a replacement for it.

## 3. Qdrant Cloud (Semantic Search)

- **Status: planned, not yet deployed.** A free-tier Qdrant Cloud instance is the intended target; this has not yet been provisioned.
- Once provisioned: `QDRANT_HOST` and `QDRANT_PORT` point at the Qdrant Cloud instance, `QDRANT_API_KEY` authenticates the connection, and `QDRANT_COLLECTION` (`fft_events`) is the collection name used for event embeddings (`QDRANT_VECTOR_SIZE=384`, matching the `paraphrase-multilingual-MiniLM-L12-v2` embedding model configured via `FFT_EMBEDDING_MODEL`).
- The collection must be created (matching vector size and distance metric) before the backend attempts to write embeddings to it — via a setup script or manually through the Qdrant dashboard/API on first deploy.

## 4. Frontend — Vercel (React)

- Build command: `npm run build` (standard Create React App / Vite convention — confirm against the actual `package.json` at deploy time).
- Relevant environment variables (see `.env.example`, `REACT_APP_*` prefix — required for Create React App to expose them to the client bundle):

  `REACT_APP_CHAIN_ID`, `REACT_APP_API_BASE`, `REACT_APP_AMOY_RPC_URL`, `REACT_APP_REGISTRY_ADDRESS`, `REACT_APP_QUADRANTS_ADDRESS`, `REACT_APP_DEPLOY_FROM_BLOCK`, `REACT_APP_IPFS_GATEWAY` (optional — choose one gateway), `REACT_APP_FFT_ADMIN_API_KEY` (optional, admin-only features)

- `REACT_APP_API_BASE` must point at the deployed Railway backend URL, not `localhost`, once the backend is live.
- Contract addresses (`REACT_APP_REGISTRY_ADDRESS`, `REACT_APP_QUADRANTS_ADDRESS`) must match the backend's `.env` values exactly — see [`CONTRACTS.md`](./CONTRACTS.md) as the single source of truth for current addresses, to avoid drift between frontend and backend configuration.

## 5. Landing Page — Cloudflare Pages

- **Status: not yet built.** The static landing page and the fully assembled multi-service deployment (database + backend + Qdrant + frontend, all pointing at each other in production) are planned for the following week and not yet in the repository.
- This section will be completed once the landing page project exists (build tooling, directory location, and Cloudflare Pages project settings).

## Security Checklist Before Any Production Deploy

The following variables from `.env.example` are secrets and must **never** be committed with real values, only ever set directly in each platform's environment variable settings (Railway / Vercel / Cloudflare):

- `DB_PASSWORD`
- `BACKEND_WALLET_PRIVATE_KEY` — controls the wallet holding `MINTER_ROLE`, `BURN_ROLE`, and `ORACLE_ROLE`; compromise of this key allows unauthorized GCD minting/slashing.
- `FFT_JWT_SECRET`, `FFT_AUTH_JWT_SECRET` — used to sign auth tokens; must be long, random values in production, not the placeholder default.
- `FFT_ADMIN_API_KEY`, `REACT_APP_FFT_ADMIN_API_KEY`
- `QDRANT_API_KEY`
- `OPENAI_API_KEY`
- `FFT_JWT_PINATA`

Before going live, also confirm:

- `FFT_CORS_ORIGINS` / `CORS_ORIGINS` are restricted to the actual production frontend domain(s) — not left as `http://localhost:3000`.
- `FFT_PIN_REQUIRE_SIG` is set to `1` in production (per the comment in `.env.example`, this enforces wallet-signature verification on IPFS pin requests).
- `LOG_LEVEL` is set to `WARNING` or `INFO` in production, not `DEBUG`.
- `ENABLE_TESTNET_FAUCET` is disabled (`0`) once the system is no longer testnet-only, to prevent unlimited free GCD claims in a production context.
