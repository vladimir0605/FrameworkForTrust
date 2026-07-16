# Smart Contracts

Framework for Trust (FfT) is deployed on the **Polygon Amoy testnet**. This document lists all deployed contracts, their addresses, and the roles/permissions configured for the backend service wallet.

> ⚠️ **Testnet notice:** All addresses below are on Polygon Amoy (chain ID `80002`), a public testnet. Contracts will be redeployed on Polygon mainnet prior to production launch; addresses will change at that point and this document will be updated accordingly.

## Deployed Contracts

| Contract | Address | PolygonScan (Amoy) |
|---|---|---|
| `GeoChainData` (GCD token) | `0x3131AcA746B7613390DED61613E5C0Ae9944B635` | [View](https://amoy.polygonscan.com/address/0x3131AcA746B7613390DED61613E5C0Ae9944B635) |
| `GeoQuadrants` | `0x1421C0dd6D962fb5c5A29340C74bEE66AdA60BFb` | [View](https://amoy.polygonscan.com/address/0x1421C0dd6D962fb5c5A29340C74bEE66AdA60BFb) |
| `FfTRegistry` | `0x58baE811a67E312BBB7B7fF1A438a2A0137155cd` | [View](https://amoy.polygonscan.com/address/0x58baE811a67E312BBB7B7fF1A438a2A0137155cd) |
| `FfTStaking` | `0x49568b041FD6F77dAD1611978043Ba2b18D84b92` | [View](https://amoy.polygonscan.com/address/0x49568b041FD6F77dAD1611978043Ba2b18D84b92) |
| `GeoquadrantAnchor` | `TBD — add address here` | — |

## Contract Roles

### `GeoChainData` (GCD)

ERC-20-based reputation token issued under a Proof-of-Contribution model. GCD is rewarded for verified, truthful contributions and slashed for fake/malicious ones. It reflects **contributor trustworthiness**, not the physical condition of a location.

- `MINTER_ROLE` — allowed to mint new GCD as rewards
- `BURN_ROLE` — allowed to slash/burn GCD from an address
- `ORACLE_ROLE` — allowed to write oracle-verified data (e.g. trust score inputs) on-chain

### `GeoQuadrants`

ERC-721 contract representing land divided into 10°×10° geographic quadrants (L0 grid). Supports bulk minting (`batchMintQuadrants()`) and a dedicated special mint for the South Pole (`mintSouthPole()`). North Pole minting is currently pending.

### `FfTRegistry`

Central registry contract coordinating references between quadrants, events, and contributor identity/state.

### `FfTStaking`

Handles GCD staking. Reward pool and staked token balances are held separately (structural fix applied to prevent reward pool depletion from affecting staked principal).

### `GeoquadrantAnchor`

Provides an on-chain, auditable time series — the project's "flow of economic time" — anchoring verified event/state data to specific timestamps and quadrants. Integrated into both the FastAPI backend and the React frontend.

## Backend Service Wallet

| | |
|---|---|
| Address | `0x36be1C6a0360737FF8c64D2c66685aC1D25726B3` |
| Roles | `MINTER_ROLE`, `BURN_ROLE`, `ORACLE_ROLE` |

This wallet is used by the backend to broadcast reward transactions (`GCD.reward()`), slash malicious contributions, and write oracle/anchor data. Its private key is never exposed to the frontend; all writes are mediated through signed backend requests.

## Known Issues / Pre-Mainnet Reconciliation

- **On-chain vs. off-chain GCD ledger discrepancy:** the primary backend wallet currently shows more GCD on-chain than recorded in the off-chain `gcd_ledger` MySQL table. This originates from mints that occurred before the ledger system was introduced. This must be reconciled (or explicitly documented as pre-ledger testnet noise) before any mainnet migration.

## Testnet Faucet

A rate-limited testnet faucet is available for obtaining test GCD:

- Endpoint: `POST /faucet/claim`
- Limit: one claim per wallet per 24 hours (enforced via `gcd_ledger`)
- Feature flag: `ENABLE_TESTNET_FAUCET` (must be enabled in backend `.env`)
