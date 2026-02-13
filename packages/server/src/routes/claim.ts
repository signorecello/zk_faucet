import { Hono } from "hono";
import * as v from "valibot";
import { ClaimRequestSchema } from "../util/schemas";
import { AppError } from "../util/errors";
import type { ModuleRegistry } from "../lib/modules/registry";
import type { NullifierStore } from "../lib/nullifier-store";
import type { FundDispatcher } from "../lib/fund-dispatcher";
import type { Logger } from "../util/logger";
import type { PublicInputs } from "../lib/modules/types";

export interface ClaimDeps {
  registry: ModuleRegistry;
  nullifierStore: NullifierStore;
  dispatcher: FundDispatcher;
  logger: Logger;
}

/** In-memory claim status tracking */
export interface ClaimRecord {
  claimId: string;
  status: "pending" | "confirmed" | "failed";
  txHash?: string;
  network?: string;
  moduleId?: string;
  recipient?: string;
  createdAt: number;
}

export const claimRecords = new Map<string, ClaimRecord>();

export function createClaimRouter(deps: ClaimDeps): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    // Parse and validate the request body
    const body = await c.req.json();
    const parseResult = v.safeParse(ClaimRequestSchema, body);
    if (!parseResult.success) {
      const issues = parseResult.issues.map((i) => i.message).join("; ");
      throw AppError.invalidPublicInputs(issues);
    }

    const { moduleId, proof, publicInputs, recipient, targetNetwork } = parseResult.output;

    // Look up the proof module
    const module = deps.registry.get(moduleId);
    if (!module) {
      throw AppError.invalidModule(moduleId);
    }

    // Validate public inputs (state root freshness, epoch, min balance)
    const pi: PublicInputs = {
      stateRoot: publicInputs.stateRoot,
      epoch: publicInputs.epoch,
      minBalance: publicInputs.minBalance,
      nullifier: publicInputs.nullifier,
    };

    const validation = await module.validatePublicInputs(pi);
    if (!validation.valid) {
      throw AppError.invalidPublicInputs(validation.error ?? "Unknown validation error");
    }

    // Decode proof from hex
    const proofHex = proof.startsWith("0x") ? proof.slice(2) : proof;
    if (proofHex.length === 0) {
      throw AppError.invalidProof("Proof is empty");
    }
    const proofBytes = new Uint8Array(
      proofHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );

    // Verify the ZK proof
    const isValid = await module.verifyProof(proofBytes, pi);
    if (!isValid) {
      throw AppError.invalidProof();
    }

    // Check and record nullifier
    const spent = deps.nullifierStore.spend(moduleId, publicInputs.nullifier, publicInputs.epoch, recipient);
    if (!spent) {
      throw AppError.alreadyClaimed();
    }

    // Dispatch funds
    let result: { txHash: string; claimId: string };
    try {
      result = await deps.dispatcher.dispatch(
        targetNetwork,
        recipient as `0x${string}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.logger.error({ err, recipient, targetNetwork }, "Fund dispatch failed");
      throw AppError.dispatchFailed(message);
    }

    // Record claim status
    claimRecords.set(result.claimId, {
      claimId: result.claimId,
      status: "confirmed",
      txHash: result.txHash,
      network: targetNetwork,
      moduleId,
      recipient,
      createdAt: Date.now(),
    });

    const network = deps.dispatcher.getNetwork(targetNetwork);

    deps.logger.info(
      { claimId: result.claimId, txHash: result.txHash, network: targetNetwork },
      "Claim successful",
    );

    return c.json({
      claimId: result.claimId,
      txHash: result.txHash,
      network: targetNetwork,
      amount: network?.dispensationWei ?? "0",
    });
  });

  return app;
}
