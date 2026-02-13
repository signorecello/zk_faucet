import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startTestServer, postClaim, type TestServer } from "./helpers/setup";
import { claimBody, uniqueNullifier } from "./helpers/fixtures";

describe("Double-claim rejection", () => {
  let server: TestServer;

  beforeAll(() => {
    server = startTestServer();
  });

  afterAll(() => {
    server.close();
  });

  test("second claim with the same nullifier returns 409 ALREADY_CLAIMED", async () => {
    const nullifier = uniqueNullifier();

    // First claim should succeed
    const body1 = claimBody(server.currentEpoch, { nullifier });
    const res1 = await postClaim(server.baseUrl, body1);
    expect(res1.status).toBe(200);

    // Second claim with the SAME nullifier should be rejected
    const body2 = claimBody(server.currentEpoch, { nullifier });
    const res2 = await postClaim(server.baseUrl, body2);
    expect(res2.status).toBe(409);

    const json = (await res2.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("ALREADY_CLAIMED");
    expect(json.error.message).toContain("Nullifier already spent");
  });

  test("claims with different nullifiers both succeed", async () => {
    const body1 = claimBody(server.currentEpoch, {
      nullifier: uniqueNullifier(),
    });
    const body2 = claimBody(server.currentEpoch, {
      nullifier: uniqueNullifier(),
    });

    const res1 = await postClaim(server.baseUrl, body1);
    const res2 = await postClaim(server.baseUrl, body2);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});
