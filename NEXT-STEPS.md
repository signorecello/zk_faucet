# Next Steps: Production Readiness

Last updated: 2026-02-26

This document outlines what remains before zk_faucet can be deployed to production. Items are ordered by priority within each section. Each item references specific files and lines where changes are needed.

---

## 1. Critical -- Must-Fix Before Any Deployment

### ~~C1. Nullifier is burned when fund dispatch fails~~ FIXED

**Fixed in:** `packages/server/src/routes/claim.ts`, `packages/server/src/lib/nullifier-store.ts`

Nullifier is now recorded atomically via `spend()` (preserving concurrent duplicate rejection), then rolled back via `unspend()` if `dispatch()` throws. Users can retry after a dispatch failure.

### ~~C2. Zero-address recipient accepted~~ FIXED

**Fixed in:** `packages/server/src/util/schemas.ts`

`AddressSchema` now includes a `v.check()` pipe step rejecting the zero address.

### ~~C3. Claim records stored only in memory~~ FIXED

**Fixed in:** `packages/server/src/lib/claim-store.ts` (new), `packages/server/src/routes/claim.ts`, `packages/server/src/routes/status.ts`, `packages/server/src/index.ts`

Claim records are now stored in a `claims` SQLite table via `ClaimStore`, sharing the same database as `NullifierStore`. The in-memory `claimRecords` Map and `ClaimRecord` type were removed from `claim.ts`. The `NullifierStore.database` property is exposed as `readonly` so `ClaimStore` can share the connection.

### ~~C4. Rate limiter stored only in memory and not cleaned up~~ FIXED (cleanup added)

**Fixed in:** `packages/server/src/index.ts`

A 60-second cleanup interval now evicts expired rate limit entries. Uses `.unref()` so it won't prevent process exit. The rate limiter is still in-memory (acceptable for single-instance deployments; Redis is a future enhancement for multi-instance).

### C5. Server hardcodes `mainnet` chain for L1 client

**File:** `packages/server/src/index.ts`, lines 48-51

The L1 public client always imports and uses `mainnet` from `viem/chains`. If `VITE_ORIGIN_CHAINID` is set to Sepolia (11155111) or Holesky (17000), the state root oracle queries mainnet blocks while the frontend submits proofs against a testnet state root. The state root will never match.

**Fix:** Derive the chain from `VITE_ORIGIN_CHAINID` (or a server-side equivalent) instead of hardcoding `mainnet`:

```typescript
import { mainnet, sepolia, holesky } from "viem/chains";
const chainMap = { 1: mainnet, 11155111: sepolia, 17000: holesky };
const originChain = chainMap[config.originChainId];
```

### ~~C6. No CORS configuration~~ FIXED

**Fixed in:** `packages/server/src/index.ts`, `packages/server/src/util/env.ts`

CORS middleware added via `hono/cors`. Origins configured via `ALLOWED_ORIGINS` env var (comma-separated), defaulting to `"*"` for dev.

---

## 2. High Priority -- Important for Production Readiness

### ~~H1. StateRootOracle has zero test coverage~~ DONE

**Fixed in:** `packages/server/test/state-root-oracle.test.ts`

15 unit tests covering start/stop lifecycle, refresh deduplication, missing stateRoot handling, cache pruning, gap backfill (including 10-block cap), getLatestStateRoot, isValidStateRoot (case-insensitive, empty cache refresh), and RPC error handling.

### ~~H2. Frontend test coverage~~ DONE

**Fixed in:** `packages/frontend/src/lib/__tests__/prove-utils.test.ts` (new), plus 47 existing vitest tests.

Exported `padRight`, `padLeft`, `bigintToMinimalBytes`, `bytesToInputArray`, `bytesToHex` from `prove.ts` and added 21 unit tests for these pure utility functions. Total frontend tests: 68.

### ~~H3. No nullifier pruning for old epochs~~ DONE

**Fixed in:** `packages/server/src/lib/nullifier-store.ts`, `packages/server/src/index.ts`, `packages/server/test/nullifier-store.test.ts`

Added `prune(beforeEpoch)` method to NullifierStore. Server runs hourly pruning via `setInterval` (removes nullifiers from epochs older than `currentEpoch - 2`). Added 4 prune tests.

### ~~H4. No faucet balance monitoring~~ DONE

**Fixed in:** `packages/server/src/routes/circuits.ts`

`/health` endpoint now fetches faucet wallet balance for each enabled network. Returns `status: "degraded"` if any balance is below `dispensationWei * 10`. Balances included in response as `balances` object keyed by network ID.

### ~~H5. Missing domain message cross-verification test~~ DONE

**Fixed in:** `packages/e2e/test/domain-message.test.ts`

Added 8 E2E tests verifying: server DOMAIN_MESSAGE constant matches expected prefix, EPOCH_PAD_LENGTH is 10, domain message is exactly 50 bytes, EIP-191 wrapped message is 78 bytes, hashMessage consistency, prefix matches server constant, and regression test for known epoch hash.

### ~~H6. `formatBalance()` precision loss for large balances~~ DONE

**Fixed in:** `01-ConnectStep.tsx`, `ResultCard.tsx`, `03-ClaimStep.tsx`

Replaced `Number(wei) / 1e18` with `viem`'s `formatEther()` which uses BigInt internally. Applied `Number(formatEther(wei)).toFixed(4)` — safe since the formatted string represents a small decimal.

### ~~H7. No graceful shutdown~~ DONE

**Fixed in:** `packages/server/src/index.ts`

Replaced `export default` with `Bun.serve()` to capture server handle. Added `SIGTERM`/`SIGINT` handlers that call `oracle.stop()`, clear intervals (rate limit cleanup + nullifier pruning), `nullifierStore.close()`, `server.stop()`.

### ~~H8. Circuit artifact served without caching headers~~ DONE

**Fixed in:** `packages/server/src/routes/circuits.ts`

Cached parsed artifact and SHA-256 ETag in closure-scoped variables. Added `Cache-Control: public, max-age=86400, immutable` and `ETag` headers. Returns 304 on `If-None-Match` match.

---

## 3. Medium Priority -- Nice-to-Have Improvements

### M1. No request logging middleware

**File:** `packages/server/src/index.ts`

There is no request logging. Failed claims, slow responses, and suspicious activity are invisible unless they hit the error handler.

**Action:** Add a Hono middleware that logs method, path, status code, and response time for every request using the existing pino logger.

### M2. Proof generation progress has no time estimate

**File:** `packages/frontend/src/prove.ts`, lines 264-267

The "Computing ZK proof..." step says "60-90 seconds" as static text. There is no elapsed time counter.

**Action:** Add a timer that updates every second showing elapsed time (e.g., "Computing ZK proof... (47s elapsed)").

### M3. No network availability check before claim

**File:** `packages/frontend/src/main.ts`, `handleClaim()` (line 410)

The user can start the full proof generation flow (~85s) and only discover at the end that the target network is unavailable or the faucet is drained.

**Action:** Add a pre-flight check before proof generation that calls `/health` or a network-specific status endpoint.

### M4. Static file serving is minimal

**File:** `packages/server/src/index.ts`, lines 133-142

Only `/assets/*` and `/` are served. No 404 fallback for SPA routing, no `favicon.ico` handler, no `robots.txt`.

**Action:**
- Add a catch-all route that serves `index.html` for any unmatched GET request (SPA fallback)
- Add `favicon.ico` and `robots.txt` static serving

### M5. `networks.json` RPC URL exposed in frontend API response

**File:** `packages/server/src/routes/circuits.ts` (networks route) and `networks.json`

The `/networks` endpoint returns the full `NetworkConfig` including `rpcUrl`. While these are public RPCs, exposing them is unnecessary and could be used for abuse.

**Action:** Strip `rpcUrl` from the `/networks` response before sending to the client.

### M6. No structured error logging for proof verification failures

**File:** `packages/server/src/routes/claim.ts`, line 76

When `module.verifyProof()` returns `false`, the server throws `AppError.invalidProof()` but does not log any details about the failure (e.g., which public inputs were used). This makes debugging legitimate user failures difficult.

**Action:** Log the public inputs (excluding the proof bytes) on verification failure.

### M7. Frontend wallet module supports only injected connector

**File:** `packages/frontend/src/wallet.ts`, line 82

Only `injected()` connector is configured. WalletConnect, Coinbase Wallet, and other connectors are not supported.

**Action:** Add WalletConnect as an alternative connector for mobile users and hardware wallet users.

### M8. No Content-Security-Policy header

**File:** `packages/server/src/index.ts`

COOP/COEP headers are set for SharedArrayBuffer support, but there is no CSP header. This leaves the frontend vulnerable to XSS if an injection vector is found.

**Action:** Add a restrictive CSP:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'
```

---

## 4. Low Priority -- Future Enhancements

### L1. Support for multiple proof modules (ERC-20, NFT ownership)

The `ProofModule` interface and `ModuleRegistry` are designed for extensibility but only `eth-balance` is implemented. Future modules could prove ERC-20 token balances or NFT ownership.

### L2. Delayed/batched proof submission for privacy

Submitting proofs immediately after signing creates a timing correlation. A submission queue that batches claims every N minutes would improve privacy.

### L3. Transaction confirmation tracking

**File:** `packages/server/src/routes/claim.ts`, line 101

Claims are immediately marked as `"confirmed"` after `sendTransaction()` returns a tx hash. The transaction may still be pending or could fail on-chain. True confirmation requires waiting for a receipt.

**Action:** Implement a background worker that polls for transaction receipts and updates claim status from `"pending"` to `"confirmed"` or `"failed"`.

### L4. Multi-network target selection in frontend

**File:** `networks.json`

Only Sepolia is configured. Adding Holesky and other testnets requires:
- Adding entries to `networks.json`
- Funding the faucet wallet on each network
- Testing dispatch to each network

### L5. Circuit artifact compression

The circuit artifact is ~5 MB uncompressed JSON. Serving it with gzip/brotli compression would reduce download time significantly.

**Action:** Add compression middleware to Hono or pre-compress the artifact at build time.

### L6. Admin dashboard

No admin UI exists. Useful additions:
- Faucet wallet balance per network
- Claims per epoch statistics
- Nullifier count and storage size
- Rate limit hit count

### L7. Nullifier store migration to a persistent external database

For high-availability deployments, the SQLite database should be replaced with PostgreSQL or a similar external database to support multiple server instances.

### L8. u64 balance truncation fix in circuit

**File:** `packages/circuits/bin/eth_balance/src/main.nr` (balance comparison)

The balance check uses `u64` which overflows for balances above ~18.4 ETH, causing false negatives. A future circuit version should use `u128` or field-level comparison.

---

## 5. Deployment Checklist

### Infrastructure

- [ ] **Provision a server** -- Bun runtime required (not Node.js). Minimum 2 vCPU / 4 GB RAM for WASM proof verification.
- [ ] **Reverse proxy** -- Deploy behind nginx or Cloudflare. Required for trusted `X-Forwarded-For` headers (rate limiting depends on it, see `packages/server/src/index.ts` line 37).
- [ ] **SSL/TLS** -- The frontend uses `window.ethereum` and `navigator.clipboard`, both of which require HTTPS in production.
- [ ] **Domain name** -- Needed for SSL certificate and frontend serving.
- [ ] **COOP/COEP headers** -- Already set in `packages/server/src/index.ts` lines 81-85. Verify they pass through the reverse proxy. Required for `SharedArrayBuffer` (multi-threaded WASM proving).

### Circuit Compilation

- [ ] **Compile the circuit** -- Run `cd packages/circuits/bin/eth_balance && nargo compile`. This produces `target/eth_balance.json` (~5 MB), required by the server for proof verification and by the frontend for in-browser proof generation.
- [ ] **Verify the artifact path** -- Server loads the artifact from `packages/circuits/bin/eth_balance/target/eth_balance.json`. Confirm this path is correct in the deployed file layout (see `packages/server/src/routes/circuits.ts`).

### Environment Variables

- [ ] **`ORIGIN_RPC_URL`** -- Production Ethereum L1 RPC URL (Alchemy/Infura). Must support `eth_getBlockByNumber` for state root verification. Rate limits should accommodate 1 call per 12 seconds.
- [ ] **`FAUCET_PRIVATE_KEY`** -- Generate a dedicated wallet. Fund it with testnet ETH on all target networks. **Never reuse a mainnet private key.**
- [ ] **`VITE_ORIGIN_CHAINID`** -- Set to `1` for mainnet balance proofs (production), or `11155111`/`17000` for testnet-to-testnet (staging).
- [ ] **`VITE_MIN_BALANCE_WEI`** -- Choose the minimum balance threshold. `10000000000000000` = 0.01 ETH.
- [ ] **`DB_PATH`** -- Set to a persistent directory (not `/tmp`). Ensure the directory exists and is writable. Back up the SQLite file.
- [ ] **`EPOCH_DURATION`** -- Default is 604800 (1 week). Adjust if needed.
- [ ] **`RATE_LIMIT_MAX`** / **`RATE_LIMIT_WINDOW_MS`** -- Tune based on expected traffic. Default is 10 requests per minute per IP.
- [ ] **`LOG_LEVEL`** -- Set to `info` for production. Use `debug` only for troubleshooting.

### Build Steps

```bash
# 1. Install dependencies
bun install

# 2. Set environment variables
cp .env.example .env
# Edit .env with production values

# 3. Compile the ZK circuit (requires nargo >= 1.0.0)
cd packages/circuits/bin/eth_balance && nargo compile

# 4. Build the frontend (inlines VITE_* env vars at build time)
cd packages/frontend && bun run build

# 5. Start the server
cd packages/server && bun --env-file=../../.env src/index.ts
```

### Pre-Launch Verification

- [ ] **Faucet wallet balance** -- Verify the faucet wallet has sufficient funds on all enabled networks in `networks.json`.
- [ ] **State root oracle** -- After server start, check logs for `"State root oracle started"`. If it fails, the server will reject all claims.
- [ ] **Circuit artifact serving** -- Verify `GET /circuits/eth-balance/artifact.json` returns the compiled circuit (HTTP 200, ~5 MB JSON).
- [ ] **End-to-end test** -- Connect a wallet, generate a proof, submit a claim, and verify the transaction on a block explorer.
- [ ] **Rate limiting** -- Verify rate limiting works behind the reverse proxy (test with `curl` using different `X-Forwarded-For` values).
- [ ] **COOP/COEP headers** -- Verify `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` are present in responses. Without these, `SharedArrayBuffer` is unavailable and proof generation fails.
- [ ] **RPC URL not exposed** -- Verify `ORIGIN_RPC_URL` does not appear in any frontend response, HTML, or JavaScript bundle.

### Monitoring (Post-Launch)

- [ ] **Set up log aggregation** -- Collect pino JSON logs. Alert on `"Fund dispatch failed"` and `"Unhandled error"` log messages.
- [ ] **Monitor faucet wallet balances** -- Alert when balance drops below a threshold (e.g., 1 ETH on Sepolia).
- [ ] **Monitor SQLite database size** -- Alert if `nullifiers.db` grows beyond expected bounds (implement pruning from H3).
- [ ] **Uptime monitoring** -- Poll `GET /health` and alert on non-200 responses.
