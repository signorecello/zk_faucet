import { Hono } from "hono";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import type { ModuleRegistry } from "../lib/modules/registry";
import type { FundDispatcher } from "../lib/fund-dispatcher";
import { AppError } from "../util/errors";

export interface CircuitsDeps {
  registry: ModuleRegistry;
  dispatcher: FundDispatcher;
  startTime: number;
}

export function createModulesRouter(deps: CircuitsDeps): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const modules = deps.registry.list().map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      currentEpoch: m.currentEpoch(),
      epochDurationSeconds: m.epochDurationSeconds,
    }));
    return c.json({ modules });
  });

  return app;
}

export function createCircuitsRouter(deps: CircuitsDeps): Hono {
  const app = new Hono();

  // H8: Cache parsed artifact and ETag in closure
  let cachedArtifact: string | null = null;
  let cachedEtag: string | null = null;

  app.get("/:moduleId/artifact.json", (c) => {
    const moduleId = c.req.param("moduleId");
    const module = deps.registry.get(moduleId);
    if (!module) {
      throw AppError.notFound(`Module ${moduleId}`);
    }

    if (moduleId !== "eth-balance") {
      throw AppError.notFound(`Circuit artifact for ${moduleId}`);
    }

    if (!cachedArtifact) {
      const artifactPath =
        process.env.CIRCUIT_ARTIFACT_PATH ??
        resolve(
          import.meta.dir,
          "../../../circuits/bin/eth_balance/target/eth_balance.json",
        );

      if (!existsSync(artifactPath)) {
        throw AppError.notFound(
          `Circuit artifact not found at ${artifactPath}. Run 'nargo compile' to generate it.`,
        );
      }

      cachedArtifact = readFileSync(artifactPath, "utf-8");
      cachedEtag = `"${createHash("sha256").update(cachedArtifact).digest("hex").slice(0, 16)}"`;
    }

    // Check If-None-Match for conditional request
    const ifNoneMatch = c.req.header("if-none-match");
    if (ifNoneMatch && ifNoneMatch === cachedEtag) {
      return c.body(null, 304);
    }

    c.header("Cache-Control", "public, max-age=86400, immutable");
    c.header("ETag", cachedEtag!);
    return c.json(JSON.parse(cachedArtifact));
  });

  return app;
}

export function createNetworksRouter(deps: CircuitsDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const networks = deps.dispatcher.getNetworks().map((n) => ({
      id: n.id,
      name: n.name,
      chainId: n.chainId,
      explorerUrl: n.explorerUrl,
      enabled: n.enabled,
      dispensationWei: n.dispensationWei,
    }));
    return c.json({ networks });
  });

  return app;
}

export function createHealthRouter(deps: CircuitsDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const uptimeMs = Date.now() - deps.startTime;
    const networks = deps.dispatcher.getNetworks().filter((n) => n.enabled);

    let status: "ok" | "degraded" = "ok";
    const balances: Record<string, string> = {};

    await Promise.all(
      networks.map(async (n) => {
        try {
          const bal = await deps.dispatcher.getBalance(n.id);
          balances[n.id] = bal.toString();
          if (bal < BigInt(n.dispensationWei) * 10n) {
            status = "degraded";
          }
        } catch {
          balances[n.id] = "error";
          status = "degraded";
        }
      }),
    );

    return c.json({
      status,
      uptime: uptimeMs,
      version: "0.1.0",
      faucetAddress: deps.dispatcher.getAddress(),
      balances,
    });
  });

  return app;
}
