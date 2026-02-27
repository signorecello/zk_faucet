# Stage 1: Build frontend + compile circuits
FROM oven/bun:1.3 AS builder

# Install curl + nargo for circuit compilation
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash \
    && ~/.nargo/bin/noirup -v 1.0.0-beta.18
ENV PATH="/root/.nargo/bin:$PATH"

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile

# Build args for VITE_* vars (baked into frontend at build time).
# Values come from docker-compose.yml args (sourced from .env).
ARG VITE_ORIGIN_CHAINID
ARG VITE_MIN_BALANCE_WEI
ARG VITE_EPOCH_DURATION
ARG VITE_REOWN_PROJECT_ID

# Write a temporary .env for Vite (reads from envDir: '../..')
RUN echo "VITE_ORIGIN_CHAINID=$VITE_ORIGIN_CHAINID" > .env \
    && echo "VITE_MIN_BALANCE_WEI=$VITE_MIN_BALANCE_WEI" >> .env \
    && echo "VITE_EPOCH_DURATION=$VITE_EPOCH_DURATION" >> .env \
    && echo "VITE_REOWN_PROJECT_ID=$VITE_REOWN_PROJECT_ID" >> .env

# Compile circuits (nargo) then build frontend (vite)
RUN bun run build

# Stage 2: Runtime (server only)
FROM oven/bun:1.3-slim
WORKDIR /app

COPY --from=builder /app/packages/server ./packages/server
COPY --from=builder /app/packages/frontend/dist ./packages/frontend/dist
COPY --from=builder /app/packages/circuits/bin/eth_balance/target ./packages/circuits/bin/eth_balance/target
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Data directory for SQLite (mount as volume for persistence)
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["bun", "run", "packages/server/src/index.ts"]
