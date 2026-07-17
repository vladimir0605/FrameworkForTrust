# Provenance

This document establishes the development timeline and originality claims for the Framework for Trust (FfT) project, and records the cryptographic and on-chain evidence supporting them.

## Project Timeline

- **November 2024** — Development of Framework for Trust begins.
- **2025–2026** — Iterative development of the core architecture: geospatial NFT quadrants (H3 grid + custom L0 hierarchy), the GeoChainData (GCD) reputation token under a Proof-of-Contribution model, on-chain event anchoring, and a hybrid on-chain/off-chain trust-scoring system.
- **2026** — Codebase translated to English and sanitized of sensitive/operational data in preparation for public release. Core documentation (`CONTRACTS.md`, `ARCHITECTURE.md`, this file) authored alongside the public GitHub release.

## Cryptographic Timestamp (OpenTimestamps)

To establish an independently verifiable point in time for this codebase, a git commit hash was timestamped using [OpenTimestamps](https://opentimestamps.org/), which anchors a hash to the Bitcoin blockchain.

| | |
|---|---|
| Commit hash | `0550a3ac3984685d9bd4e9dbde1d31efc4ac165b` |
| Timestamp file | `provenance/FrameworkForTrust_2026-07-16.txt` |
| OTS proof | `provenance/FrameworkForTrust_2026-07-16.txt.ots` |
| Date submitted | 2026-07-16 |
| Calendar servers | `alice.btc.calendar.opentimestamps.org`, `bob.btc.calendar.opentimestamps.org`, `finney.calendar.eternitywall.com` |

**Status:** pending Bitcoin block confirmation at time of writing. Once confirmed, the proof will be upgraded (`ots upgrade`) to embed the full Bitcoin Merkle proof, after which it can be independently verified by anyone (`ots verify`) without trusting the calendar servers.

Anyone can verify this proof using the [OpenTimestamps client](https://github.com/opentimestamps/opentimestamps-client) or the [public verifier](https://opentimestamps.org/):

```bash
ots verify provenance/FrameworkForTrust_2026-07-16.txt.ots
```

This confirms that git commit `0550a3ac3984685d9bd4e9dbde1d31efc4ac165b` — and therefore the full state of the codebase at that commit — existed no later than the confirmed Bitcoin block timestamp.

## On-Chain Deployment Evidence

Beyond the OTS proof, the project's smart contracts are themselves independently timestamped by virtue of being deployed on a public blockchain. Each deployment transaction is permanently recorded with a block timestamp on Polygon.

### Testnet (Polygon Amoy, chain ID `80002`)

| Contract | Address |
|---|---|
| `GeoChainData` (GCD token) | `0x3131AcA746B7613390DED61613E5C0Ae9944B635` |
| `GeoQuadrants` | `0x1421C0dd6D962fb5c5A29340C74bEE66AdA60BFb` |
| `FfTRegistry` | `0x58baE811a67E312BBB7B7fF1A438a2A0137155cd` |
| `FfTStaking` | `0x49568b041FD6F77dAD1611978043Ba2b18D84b92` |
| `GeoquadrantAnchor` | TBD — see `CONTRACTS.md` |

Full contract details, roles, and permissions are documented in [`CONTRACTS.md`](./CONTRACTS.md).

### Mainnet (Polygon)

Contracts have not yet been deployed to Polygon mainnet. Per `CONTRACTS.md`, redeployment to mainnet is planned prior to production launch. **This section will be updated with mainnet contract addresses and deployment transaction hashes once that migration occurs** — at which point those deployments will serve as an additional, independent layer of on-chain provenance for the production system.

## Scope and Limitations

- The OTS proof above establishes provenance for the codebase **at the specific commit referenced**, not for the project concept in general or for any code written after that commit. Subsequent significant milestones (e.g. new contract deployments, major architecture changes) should be timestamped separately, following the same process, to build a continuous chain of dated evidence over time.
- On-chain contract deployments establish provenance only for the deployed bytecode and its on-chain behavior, not for off-chain code (backend, frontend) unless that code is separately hashed and anchored (e.g. via `GeoquadrantAnchor`).
