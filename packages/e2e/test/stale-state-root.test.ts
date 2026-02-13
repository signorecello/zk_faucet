import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startTestServer, postClaim, type TestServer } from "./helpers/setup";
import { claimBody, STALE_STATE_ROOT } from "./helpers/fixtures";

describe("Stale state root and wrong epoch", () => {
  let server: TestServer;

  beforeAll(() => {
    server = startTestServer();
  });

  afterAll(() => {
    server.close();
  });

  test("stale state root returns 400 INVALID_PUBLIC_INPUTS", async () => {
    const body = claimBody(server.currentEpoch, {
      stateRoot: STALE_STATE_ROOT,
    });
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("INVALID_PUBLIC_INPUTS");
    expect(json.error.message).toContain("State root");
  });

  test("wrong epoch (past) returns 400 INVALID_PUBLIC_INPUTS", async () => {
    // Use an epoch from 2 weeks ago (2 * 604800 seconds / 604800 = 2 epochs back)
    const staleEpoch = server.currentEpoch - 2;
    const body = claimBody(staleEpoch);
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("INVALID_PUBLIC_INPUTS");
    expect(json.error.message).toContain("Epoch mismatch");
  });

  test("wrong epoch (future) returns 400 INVALID_PUBLIC_INPUTS", async () => {
    const futureEpoch = server.currentEpoch + 1;
    const body = claimBody(futureEpoch);
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("INVALID_PUBLIC_INPUTS");
    expect(json.error.message).toContain("Epoch mismatch");
  });

  test("minimum balance below required returns 400 INVALID_PUBLIC_INPUTS", async () => {
    // Set minBalance lower than the required 0.01 ETH (10^16 wei)
    const body = claimBody(server.currentEpoch, {
      minBalance: "1000000000000000", // 0.001 ETH - below threshold
    });
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("INVALID_PUBLIC_INPUTS");
    expect(json.error.message).toContain("Minimum balance too low");
  });
});
