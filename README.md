# FrameworkForTrust
# Framework for Trust (FfT)

> *A decentralized protocol for verifying and scoring real-world events — built on Polygon, powered by semantic AI, anchored to geography.*

---

## Why does this exist?

Every day, millions of events happen around us — traffic accidents, floods, power outages, protests, local disruptions. This information travels through social media, messaging apps, and news outlets. But how do you know if it's real?

**The problem is not a lack of information. It's a lack of trust in information.**

Current systems rely on centralized authorities to decide what is true. A single company, a single algorithm, a single government can silence, manipulate, or simply miss what's happening on the ground.

FfT takes a different approach: **let the community verify itself, with cryptographic proof and economic stakes.**

---

## What is FfT?

Framework for Trust is a **DePIN** (Decentralized Physical Infrastructure Network) that connects the physical world to the blockchain through geo-anchored trust scores.

In plain language:
- Anyone can report a real-world event (flood, accident, outage, etc.)
- The system scores that event based on who reported it, what they've staked, and how similar events cluster nearby
- Verified contributors earn **GCD tokens** (GeoChainData) on-chain
- Bad actors lose their stake

The result is a **self-correcting, permissionless layer of ground truth** — no single point of control, no single point of failure.

---

## How it works — in 4 steps

```
1. REPORT      A user connects their wallet and submits an event
               at a geographic location (GPS or map click).
               They sign the payload with MetaMask — cryptographic
               proof that this specific wallet made this specific claim.

2. SCORE       The backend computes a trust_score using:
               • Contributor's on-chain GCD reputation
               • Semantic similarity to nearby events (AI embedding)
               • Anti-Sybil cluster detection
               • Stake weight

3. REWARD      If the event passes scoring thresholds:
               → Off-chain ledger updated
               → On-chain GCD.reward() called — real tokens minted

4. SLASH       If a moderator marks an event as fake:
               → GCD.burn() called — tokens destroyed on-chain
               → Permanent record of the infraction
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (React)                  │
│   Leaflet map · MetaMask · JWT auth · EventForm      │
└─────────────────────┬───────────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────────┐
│                  BACKEND (FastAPI)                   │
│   Trust scoring · EIP-191 signatures · GCD oracle   │
│   MySQL · Qdrant (semantic search) · Web3.py         │
└──────────┬────────────────────────┬─────────────────┘
           │                        │
┌──────────▼──────────┐  ┌─────────▼─────────────────┐
│   MySQL Database    │  │   Qdrant Vector DB          │
│   Events · Ledger   │  │   384-dim multilingual      │
│   Quadrants · Auth  │  │   semantic embeddings       │
└─────────────────────┘  └───────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│              POLYGON AMOY TESTNET                    │
│                                                      │
│  GeoChainData (GCD)   ERC20 token with MINTER_ROLE  │
│  GeoQuadrants (NFT)   10°×10° grid of Earth as NFTs │
│  FfTRegistry          On-chain address registry      │
│  FfTStaking           Stake · Reward · Slash         │
└─────────────────────────────────────────────────────┘
```

---

## Smart Contracts — Polygon Amoy Testnet

| Contract | Address | Role |
|---|---|---|
| GeoChainData (GCD) | `0x3131AcA746B7613390DED61613E5C0Ae9944B635` | ERC20 utility token |
| GeoQuadrants (NFT) | `0x1421C0dd6D962fb5c5A29340C74bEE66AdA60BFb` | Geographic NFT grid |
| FfTRegistry | `0x58baE811a67E312BBB7B7fF1A438a2A0137155cd` | Contract address registry |
| FfTStaking | `0x49568b041FD6F77dAD1611978043Ba2b18D84b92` | Staking and slash |

---

## Tech Stack

**Frontend**
- React 18 + Leaflet (interactive map)
- ethers.js v6 (MetaMask, EIP-191 signatures)
- JWT authentication (nonce → sign → token)

**Backend**
- Python 3.9 + FastAPI + Uvicorn
- MySQL (events, ledger, auth nonces)
- Qdrant (vector database for semantic search)
- `paraphrase-multilingual-MiniLM-L12-v2` — 384-dim multilingual embeddings
- Web3.py (on-chain reward/slash oracle)

**Blockchain**
- Solidity ^0.8.26 + OpenZeppelin v5
- Polygon Amoy testnet (chainId: 80002)
- AccessControl: MINTER_ROLE, BURN_ROLE, ORACLE_ROLE

---

## Local Setup

### Prerequisites

```bash
Node.js 18+
Python 3.9+
MySQL 8.0+
Qdrant (Docker or local binary)
MetaMask browser extension
```

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/framework-for-trust.git
cd framework-for-trust
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with your values
npm start
```

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your values
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start Qdrant

```bash
docker run -p 6333:6333 qdrant/qdrant
```

### 3. Initialize database

```bash
cd backend
python3 quadrants_init.py
```

---

## Environment Variables

### Backend `.env`

```bash
# Database
FFT_DB_HOST=127.0.0.1
FFT_DB_USER=your_db_user
FFT_DB_PASS=your_db_password
FFT_DB_NAME=fft_db

# Blockchain
AMOY_RPC_URL=https://rpc-amoy.polygon.technology/
GCD_CONTRACT_ADDRESS=0x3131AcA746B7613390DED61613E5C0Ae9944B635
REGISTRY_ADDRESS=0x58baE811a67E312BBB7B7fF1A438a2A0137155cd
STAKING_ADDRESS=0x49568b041FD6F77dAD1611978043Ba2b18D84b92

# Backend Oracle Wallet (must have MINTER_ROLE and BURN_ROLE)
BACKEND_WALLET_ADDRESS=0x...
BACKEND_WALLET_PRIVATE_KEY=...  # Keep secret, never commit!

# Auth
FFT_AUTH_JWT_SECRET=<random 256-bit hex>
FFT_AUTH_JWT_TTL_SEC=86400

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=fft_events
QDRANT_VECTOR_SIZE=384

# Embedding
FFT_USE_PSEUDO_EMBEDDING=0
FFT_EMBEDDING_MODEL=paraphrase-multilingual-MiniLM-L12-v2

# IPFS
FFT_JWT_PINATA=<your Pinata JWT>

# CORS
CORS_ORIGINS=http://localhost:3000
```

### Frontend `.env.local`

```bash
REACT_APP_API_BASE=http://localhost:8000
REACT_APP_REGISTRY_ADDRESS=0x58baE811a67E312BBB7B7fF1A438a2A0137155cd
REACT_APP_GCD_ADDRESS=0x3131AcA746B7613390DED61613E5C0Ae9944B635
REACT_APP_QUADRANTS_ADDRESS=0x1421C0dd6D962fb5c5A29340C74bEE66AdA60BFb
REACT_APP_STAKING_ADDRESS=0x49568b041FD6F77dAD1611978043Ba2b18D84b92
```

---

## What makes FfT different?

| Feature | Traditional apps | FfT |
|---|---|---|
| Who decides what's true? | Central authority | Cryptographic consensus |
| Can reports be deleted? | Yes, easily | No — events are on-chain |
| Who profits from data? | Platform | Contributors |
| Can you verify a reporter? | No | Yes — via on-chain GCD reputation |
| Language support | Varies | Multilingual AI (EN/DE/FR/AR/RU/CN/SR/HR/SI/ES/PO...) |

---

## Trust Score — how is it calculated?

```
trust_score = base + bonus_local + cluster_bonus

base = w1 × ui_rep + w2 × onchain_rep + w3 × stake_norm
         ↑               ↑                  ↑
    User's slider    GCD balance       Amount staked

bonus_local  = +0.1 if similar events confirm  /  -0.2 if conflicts
cluster_bonus = Qdrant semantic similarity score (AI)
```

The higher the trust score, the more GCD tokens are rewarded. The lower (and especially fake-marked events), the more tokens are slashed.

---

## Roadmap

- [x] Core event ingestion with EIP-191 signatures
- [x] On-chain GCD reward and slash
- [x] Semantic anti-Sybil clustering (Qdrant + sentence-transformers)
- [x] JWT auth with MetaMask wallet
- [x] GeoQuadrants NFT grid on Polygon Amoy
- [ ] Public beta with real users
- [ ] DAO governance for moderation
- [ ] IOTA Tangle integration (feeless micro-transactions)
- [ ] Post-quantum cryptography (research phase)
- [ ] Mobile app (iOS / Android)

---

## Contributing

FfT is in public beta. Contributions, feedback, and ideas are welcome.

If you find a bug or have a feature request, please open an issue.
If you want to contribute code, please open a pull request with a clear description.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Contact

Built by a small team of developers with a belief that decentralized trust infrastructure
is one of the most important unsolved problems of our time.

If you share that belief — reach out.

---

*"Trust is not given. It is earned, verified, and recorded."*
