# zk_faucet

A privacy-preserving testnet faucet that uses zero-knowledge storage proofs to distribute funds without linking mainnet identity to testnet addresses.

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env — set ETH_RPC_URL and FAUCET_PRIVATE_KEY (see Environment Variables below)

# 3. Build frontend + start server
bun run dev

# 4. Open http://localhost:3000
```

Or use the setup script for a guided first-time setup:

```bash
bash scripts/setup.sh
bun run dev
```

## Architecture Overview

```
                         +-----------+
                         |  Frontend |   Vanilla TS/CSS SPA
                         |  (browser)|   MetaMask signing
                         +-----+-----+
                               |
                          POST /claim
                               |
                         +-----v-----+
                         |   Server   |   Hono API (Bun runtime)
                         |            |   Rate limiting, routing
                         +-----+-----+
                               |
                  +------------+------------+
                  |                         |
           +------v------+          +------v------+
           | ProofModule |          |  Nullifier  |
           |  Registry   |          |   Store     |
           | (verify ZK) |          | (SQLite)    |
           +------+------+          +-------------+
                  |
           +------v------+
           |    Fund      |
           |  Dispatcher  |   Signs + sends testnet ETH
           +------+------+   via viem wallet client
                  |
           +------v------+
           |   Target     |
           |  Network(s)  |   Sepolia, custom L2s, etc.
           +-------------+
```

**Packages:**

| Package | Description |
|---------|-------------|
| `packages/circuits` | Noir ZK circuit (eth_balance) with vlayer MPT integration |
| `packages/contracts` | `NullifierRegistry.sol` — on-chain nullifier audit trail (Ownable, OpenZeppelin v5) |
| `packages/server` | Hono API server: claim, status, modules, networks, health endpoints + static frontend serving |
| `packages/client` | CLI tool for wallet management, epoch queries, and proof generation |
| `packages/e2e` | End-to-end integration tests |
| `packages/frontend` | Vanilla TS/CSS single-page app with MetaMask integration |

**Claim flow:**

1. User connects MetaMask in the frontend and signs a message
2. Client generates a ZK proof that the signer holds >= 0.01 ETH on mainnet, without revealing the address
3. Frontend submits the proof + public inputs + nullifier to `POST /claim`
4. Server verifies the ZK proof, checks the nullifier hasn't been spent, and dispatches testnet ETH
5. Nullifier is recorded (SQLite locally, optionally on-chain via NullifierRegistry)

## Environment Variables

All variables are loaded in `packages/server/src/util/env.ts`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ETH_RPC_URL` | **Yes** | — | Ethereum mainnet RPC URL (for state root verification). Alchemy, Infura, or any L1 RPC. |
| `FAUCET_PRIVATE_KEY` | **Yes** | — | Private key (hex, `0x`-prefixed) of the wallet holding testnet funds to dispense. |
| `PORT` | No | `3000` | HTTP server port. |
| `HOST` | No | `0.0.0.0` | HTTP server bind address. |
| `LOG_LEVEL` | No | `info` | Pino log level (`debug`, `info`, `warn`, `error`). |
| `RATE_LIMIT_MAX` | No | `10` | Max requests per IP per window. |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in milliseconds (default: 1 minute). |
| `DISPENSATION_AMOUNT` | No | `0.1` | Amount of testnet ETH to send per claim (in ETH, not wei). |
| `EPOCH_DURATION` | No | `604800` | Epoch duration in seconds (default: 1 week). Each epoch resets nullifiers. |
| `MIN_BALANCE_WEI` | No | `10000000000000000` | Minimum ETH balance required on mainnet (in wei; default: 0.01 ETH). |
| `DB_PATH` | No | `./data/nullifiers.db` | Path to the SQLite database for nullifier storage. |

For contract deployment (optional):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEPOLIA_RPC_URL` | No | — | Sepolia RPC URL for deploying NullifierRegistry. |
| `DEPLOYER_PRIVATE_KEY` | No | — | Deployer wallet private key for contract deployment. |

## Running Tests

145 tests total across all packages.

```bash
# Run everything from the root
bun run test

# Or run per-package:

# Server (61 tests) — bun:test
cd packages/server && bun test

# Client (35 tests) — bun:test
cd packages/client && bun test

# Contracts (11 tests) — Hardhat/Mocha
cd packages/contracts && npx hardhat test

# E2E (38 tests) — bun:test
cd packages/e2e && bun test

# Circuits (5 nargo tests) — requires nargo
cd packages/circuits/eth_balance && nargo test
```

## Development

### Server (watch mode)

```bash
# From root — builds frontend then starts server with --watch
bun run dev

# Or directly:
cd packages/server && bun --watch src/index.ts
```

The server serves the frontend from `packages/frontend/public/` on `/` and `/public/*`.

### Frontend

```bash
# One-time build
cd packages/frontend && bun run build

# Watch mode (rebuilds on file changes)
cd packages/frontend && bun run dev
```

The frontend is a vanilla TS/CSS SPA built with `Bun.build()`. Output goes to `packages/frontend/public/`.

### Adding a new proof module

Proof modules implement the `ProofModule` interface in `packages/server/src/lib/modules/types.ts`:

```typescript
interface ProofModule {
  id: string;
  name: string;
  description: string;
  validatePublicInputs(inputs: PublicInputs): Promise<ValidationResult>;
  verifyProof(proof: Uint8Array, publicInputs: PublicInputs): Promise<boolean>;
  currentEpoch(): number;
  epochDurationSeconds: number;
}
```

Steps:

1. Create a new directory under `packages/server/src/lib/modules/<your-module>/`
2. Implement the `ProofModule` interface (see `eth-balance/module.ts` for reference)
3. Register it in `packages/server/src/index.ts`:
   ```typescript
   registry.register(new YourModule(/* deps */));
   ```
4. If it uses a Noir circuit, add the circuit under `packages/circuits/` and compile it

### Adding a new target network

Edit `networks.json` at the project root:

```json
{
  "networks": [
    {
      "id": "your-network",
      "name": "Your Network",
      "chainId": 12345,
      "rpcUrl": "https://rpc.your-network.io",
      "explorerUrl": "https://explorer.your-network.io",
      "enabled": true,
      "dispensationWei": "100000000000000000"
    }
  ]
}
```

The server reads this file at startup. The `dispensationWei` field overrides the default dispensation amount for that network. Make sure the faucet wallet is funded on the target network.

## Project Design

### Nullifier design

The nullifier is computed as `poseidon2(pubkey_x, pubkey_y, epoch)` using the **recovered public key** from the ECDSA signature — not from the signature components (r, s, v) directly.

Why recovered pubkey?
- ECDSA signatures are non-deterministic: the same key + message can produce different (r, s) values depending on the nonce
- The recovered public key is always the same for a given signer, making the nullifier deterministic per identity + epoch
- This avoids needing PLUME (verifiably deterministic signatures) which isn't widely supported

One nullifier per epoch per identity means each mainnet holder can claim testnet ETH once per epoch (default: weekly).

### Privacy model

**Private (hidden by ZK proof):**
- The mainnet address of the claimer
- The exact ETH balance
- The link between mainnet identity and testnet address

**Public (visible):**
- That the claimer holds >= 0.01 ETH on mainnet
- The epoch number
- The nullifier (unlinkable to identity without the private key)
- The testnet recipient address

**Known limitations:**
- IP address correlation: the server sees the IP of the requester. Use a VPN or Tor for stronger privacy.
- Timing correlation: claim times are visible. A sophisticated adversary could correlate claim timing with on-chain activity.
- The server operator can observe all claims (but cannot link them to mainnet addresses without breaking the ZK proof).

### Security

- **145 tests** across all packages including 62 dedicated security tests
- **QA audited**: SQL injection, XSS, race conditions, rate limiting all verified safe
- **Race-safe nullifier store**: concurrent claims with the same nullifier result in exactly one success (atomic `INSERT OR IGNORE` in SQLite)
- **Rate limiting**: per-IP, configurable window and max requests
- **Input validation**: all claim inputs validated with valibot schemas before proof verification

## Stack

| Technology | Usage |
|-----------|-------|
| [Bun](https://bun.sh) | Runtime, package manager, test runner, bundler |
| [Hono](https://hono.dev) | HTTP framework (server) |
| [Noir](https://noir-lang.org) | ZK circuit language |
| [Barretenberg](https://github.com/AztecProtocol/aztec-packages) | ZK proof backend (WASM verifier) |
| [viem](https://viem.sh) | Ethereum client library |
| [Hardhat](https://hardhat.org) | Solidity development framework |
| [OpenZeppelin v5](https://docs.openzeppelin.com/contracts/5.x/) | Smart contract libraries |
| [SQLite](https://www.sqlite.org) | Nullifier persistence |
| [pino](https://getpino.io) | Structured logging |
| [valibot](https://valibot.dev) | Schema validation |
| [vlayer](https://github.com/vlayer-xyz) | Noir MPT/storage proof library |

## License

MIT
