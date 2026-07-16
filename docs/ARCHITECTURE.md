# Architecture

**Framework for Trust (FfT)** — *"Reality leaves a trace."*

FfT is a decentralized physical infrastructure system for verifying real-world events. It combines geographic scarcity (NFT quadrants), content-addressed storage (IPFS), semantic anti-Sybil defenses (vector embeddings), cryptoeconomic incentives (GCD token), and an auditable on-chain timeline, to let anyone submit, verify, and trust claims about what happened, where, and when.

The project has been in active development for over a year and a half.

## System Overview

```
 ┌──────────────┐        ┌───────────────┐        ┌───────────────────┐
 │ React Frontend│  <-->  │ FastAPI Backend│  <-->  │ Polygon Amoy (EVM) │
 │ (MetaMask,    │        │ (Python)       │        │ Smart Contracts    │
 │  Leaflet map) │        │                │        └───────────────────┘
 └──────────────┘        │                │        ┌───────────────────┐
                          │                │  <-->  │ MySQL (ledger,     │
                          │                │        │ quadrant index)    │
                          │                │        └───────────────────┘
                          │                │        ┌───────────────────┐
                          │                │  <-->  │ Qdrant (semantic   │
                          │                │        │ vector clustering) │
                          │                │        └───────────────────┘
                          │                │        ┌───────────────────┐
                          │                │  <-->  │ IPFS (event data,  │
                          │                │        │ media storage)     │
                          └───────────────┘        └───────────────────┘
```

## Core Components

### 1. Geographic Scarcity — `GeoQuadrants` (NFT)

The Earth's land surface is divided into a 10°×10° grid (L0 quadrants), each minted as an ERC-721 NFT. Ownership/stewardship of a quadrant is a prerequisite for certain contribution and moderation actions tied to that geography. Roughly 325 land-only quadrants have been minted, plus a dedicated South Pole NFT (with custom Leaflet rendering — Web Mercator latitude clamped to ±85.05° with a polar cap overlay).

### 2. Event Submission & Verification

Contributors submit real-world event claims through the React frontend. Each submission is:

1. Signed client-side via **EIP-191** using the contributor's connected wallet (MetaMask)
2. Sent to the FastAPI backend, which validates the signature and payload
3. Stored on **IPFS**, giving the event content-addressed, tamper-evident storage
4. Embedded into a **384-dimensional multilingual vector** (`paraphrase-multilingual-MiniLM-L12-v2`) and indexed in **Qdrant**

### 3. Anti-Sybil / Semantic Clustering

Qdrant-based semantic clustering compares new submissions against prior events to detect duplicate, coordinated, or fabricated claims — a defense layer against Sybil attacks and low-effort spam, independent of purely economic (stake-based) defenses.

### 4. Trust Scoring & GCD Token

**GeoChainData (GCD)** is an ERC-20 reputation token implementing a **Proof-of-Contribution** model:

- Verified, truthful contributions are **rewarded** (minted) via `GCD.reward()`
- Fake or malicious contributions are **slashed** (burned)
- A contributor's real-time GCD balance feeds into their trust score calculation, alongside semantic clustering signals from Qdrant

GCD reflects **contributor trustworthiness** — it is not a measure of physical conditions at a location.

### 5. Staking — `FfTStaking`

Contributors can stake GCD to increase their standing / participate in moderation. The reward pool is structurally separated from staked principal, so reward distribution cannot deplete a staker's underlying balance.

### 6. Registry — `FfTRegistry`

Coordinates references between quadrants, events, and contributor state; acts as the central lookup/glue contract for the system.

### 7. On-Chain Time Anchoring — `GeoquadrantAnchor`

The newest architectural layer: an on-chain, auditable time series — referred to internally as the **"flow of economic time"** — anchoring verified state to specific timestamps and quadrants directly on Polygon. This gives any observer a way to audit *when* verified data was committed, not just *that* it was committed. Integrated end-to-end through the FastAPI backend and surfaced in the React frontend.

### 8. Backend — FastAPI (Python)

Mediates all writes to chain (holding `MINTER_ROLE`, `BURN_ROLE`, `ORACLE_ROLE` via a dedicated service wallet), manages the MySQL-backed quadrant index and GCD ledger, runs the embedding pipeline, and exposes the testnet faucet.

### 9. Data Layer — MySQL

Used for the off-chain GCD ledger (`gcd_ledger`, rate-limiting faucet claims and tracking reward history) and the quadrant index (`GET /quadrants`), replacing an earlier browser-side `eth_getLogs` scanning approach that hit RPC provider limitations.

### 10. Frontend — React

Wallet connection and global state via a `useWallet()` hook (replacing earlier prop-drilling and a dual-wallet auto-connect bug), Leaflet-based map rendering of quadrants, event submission forms, moderation panel, GCD wallet view (with EIP-747 "Add GCD to MetaMask" support), and the testnet faucet UI.

## End-to-End Flow (confirmed working)

```
MetaMask connect
   → EIP-191 signed event submission
   → Backend validation
   → Trust score calculation (GCD balance + Qdrant semantic clustering)
   → MySQL ledger update
   → On-chain GCD.reward() broadcast (Polygon Amoy)
```

## Identified Gaps (roadmap)

Assessed against the theoretical trust/time-anchoring framework this project draws on, the following primitives are not yet implemented:

- **Atomic settlement** across the reward/verification pipeline
- **Model Execution Proof** — provenance for any AI-assisted verification steps
- **Post-quantum cryptography** for long-horizon signature security
- **Formal dispute resolution and reputational decay** mechanics
