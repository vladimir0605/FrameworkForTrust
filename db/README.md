# Framework for Trust — Database Schema

This folder contains the MySQL schema definition for the FfT backend (`fft_db`).

`schema.sql` was generated using:

```bash
mysqldump -u <user> -p \
  --no-data \
  --routines \
  --triggers \
  --events \
  --skip-comments \
  --column-statistics=0 \
  fft_db > schema.sql
```

The file contains **structure only** (DDL) — no actual data rows.

## Table overview

| Table | Purpose |
|---|---|
| `events` | Main log of community-reported events (transport, parking, incidents). Links geolocation, H3 grid cell, source reputation, and moderation status. |
| `fft_users` | Canonical map of `wallet_address → internal user id`. Populated automatically on a user's first interaction with the system. |
| `fft_auth_nonces` | Wallet-based authentication (sign-in-with-wallet style) — a one-time nonce per wallet address, with expiry and replay-attack protection. |
| `fft_user_roles` | Global user roles (RBAC), linked to `fft_users.id`. |
| `fft_quadrant_permissions` | Per-quadrant permissions — multiple wallets can hold the same permission within the same quadrant. |
| `gcd_ledger` | Ledger of the GCD reputation token — each award/slash is a separate row with the resulting balance (`balance_after`), making the history fully auditable. |
| `quadrants_l0` | Off-chain description of quadrants (L0 hierarchy level) — category, tags, IPFS metadata CID, quantized coordinates. |
| `quadrants_minted` | On-chain records of minted NFT quadrants — block, transaction hash, and log index guarantee against double-recording the same blockchain event. |
| `quadrants_indexer_state` | State of the background blockchain indexer process (last processed block, run time, errors). |

## Note on coordinate systems

The database intentionally uses **three different coordinate formats** across tables, depending on the precision required at each layer:

- `events.lat/lon` — `decimal(9,6)`, full GPS coordinates of an individual event.
- `quadrants_l0.lat/lon` — `smallint`, quantized/grid coordinates at the L0 hierarchy level.
- `quadrants_minted.lat/lon` — `double`, coordinates as recorded in the on-chain mint transaction.

A more detailed explanation of the relationship between these layers is provided in `ARCHITECTURE.md`.

## Security note

This file intentionally does **not** contain:
- Connection credentials (see `.env.example` in the project root)
- Real user data (wallet addresses, email addresses, IP addresses)
- Seed/fixture data — these will be added separately with fabricated values, to make local project setup easier.
