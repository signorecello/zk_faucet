import { Hono } from "hono";
import type { ClaimStore } from "../lib/claim-store";
import { AppError } from "../util/errors";

export interface StatusDeps {
  claimStore: ClaimStore;
}

export function createStatusRouter(deps: StatusDeps): Hono {
  const app = new Hono();

  app.get("/:claimId", (c) => {
    const claimId = c.req.param("claimId");
    const record = deps.claimStore.get(claimId);

    if (!record) {
      throw AppError.notFound(`Claim ${claimId}`);
    }

    return c.json({
      claimId: record.claimId,
      status: record.status,
      txHash: record.txHash,
      network: record.network,
    });
  });

  return app;
}
