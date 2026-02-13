import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startTestServer, postClaim, type TestServer } from "./helpers/setup";
import { claimBody, uniqueNullifier } from "./helpers/fixtures";

describe("Concurrent claim race conditions", () => {
  let server: TestServer;

  beforeAll(() => {
    server = startTestServer();
  });

  afterAll(() => {
    server.close();
  });

  test("concurrent claims with same nullifier: exactly one succeeds, rest get 409", async () => {
    const sharedNullifier = uniqueNullifier();
    const CONCURRENCY = 10;

    // Fire all claims simultaneously
    const promises = Array.from({ length: CONCURRENCY }, () => {
      const body = claimBody(server.currentEpoch, { nullifier: sharedNullifier });
      return postClaim(server.baseUrl, body);
    });

    const responses = await Promise.all(promises);
    const statuses = responses.map((r) => r.status);

    const successes = statuses.filter((s) => s === 200);
    const conflicts = statuses.filter((s) => s === 409);

    // Exactly one should succeed (the first one to hit the database)
    expect(successes).toHaveLength(1);
    // All others should be 409 ALREADY_CLAIMED
    expect(conflicts).toHaveLength(CONCURRENCY - 1);
  });

  test("concurrent claims with different nullifiers all succeed", async () => {
    const CONCURRENCY = 10;

    const promises = Array.from({ length: CONCURRENCY }, () => {
      const body = claimBody(server.currentEpoch, { nullifier: uniqueNullifier() });
      return postClaim(server.baseUrl, body);
    });

    const responses = await Promise.all(promises);
    const statuses = responses.map((r) => r.status);

    // All should succeed since each has a unique nullifier
    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});
