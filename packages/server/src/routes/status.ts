import { Hono } from "hono";
import { claimRecords } from "./claim";
import { AppError } from "../util/errors";

export function createStatusRouter(): Hono {
  const app = new Hono();

  app.get("/:claimId", (c) => {
    const claimId = c.req.param("claimId");
    const record = claimRecords.get(claimId);

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
