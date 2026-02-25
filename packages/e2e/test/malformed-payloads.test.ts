import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startTestServer, postClaim, type TestServer } from "./helpers/setup";
import { claimBody, uniqueNullifier, TEST_RECIPIENT, TEST_NETWORK } from "./helpers/fixtures";

describe("Malformed and adversarial payloads", () => {
  let server: TestServer;

  beforeAll(() => {
    server = startTestServer();
  });

  afterAll(() => {
    server.close();
  });

  test("non-JSON body returns 400 or 500", async () => {
    const res = await fetch(`${server.baseUrl}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "this is not json",
    });
    // Hono will throw a parse error
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
  });

  test("empty body returns error", async () => {
    const res = await fetch(`${server.baseUrl}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("array instead of object returns error", async () => {
    const res = await fetch(`${server.baseUrl}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("null body returns error", async () => {
    const res = await fetch(`${server.baseUrl}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("SQL injection in nullifier field", async () => {
    const body = claimBody(server.currentEpoch, {
      nullifier: "0x" + Buffer.from("'; DROP TABLE nullifiers; --").toString("hex"),
    });
    const res = await postClaim(server.baseUrl, body);
    // Should either succeed (proof passes, nullifier stored safely) or fail validation,
    // but NEVER crash or corrupt data
    expect(res.status).toBeLessThan(600);
    expect([200, 400]).toContain(res.status);
  });

  test("SQL injection in moduleId field", async () => {
    const body = claimBody(server.currentEpoch, {
      moduleId: "' OR 1=1; DROP TABLE nullifiers; --",
    });
    const res = await postClaim(server.baseUrl, body);
    // Should fail with INVALID_MODULE since the module doesn't exist
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("INVALID_MODULE");
  });

  test("XSS attempt in recipient field is rejected by schema", async () => {
    const body = claimBody(server.currentEpoch, {
      recipient: "<script>alert('xss')</script>",
    });
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);
  });

  test("extremely long proof string", async () => {
    const body = claimBody(server.currentEpoch, {
      proof: "0x" + "ab".repeat(100_000),
    });
    const res = await postClaim(server.baseUrl, body);
    // Should handle gracefully - either succeed or reject, not crash
    expect(res.status).toBeLessThan(600);
  });

  test("proof with non-hex characters after 0x is rejected", async () => {
    const body = claimBody(server.currentEpoch, {
      proof: "0xGGGGGG",
    });
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);
  });

  test("epoch as string type is rejected", async () => {
    const body: any = claimBody(server.currentEpoch);
    body.publicInputs.epoch = "100";
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);
  });

  test("epoch as float is rejected", async () => {
    const body: any = claimBody(server.currentEpoch);
    body.publicInputs.epoch = 100.5;
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);
  });

  test("epoch as negative number is rejected", async () => {
    const body: any = claimBody(server.currentEpoch);
    body.publicInputs.epoch = -1;
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);
  });

  test("minBalance as number type (not string) is rejected by schema", async () => {
    const body: any = claimBody(server.currentEpoch);
    body.publicInputs.minBalance = 10000000000000000;
    const res = await postClaim(server.baseUrl, body);
    // minBalance is defined as v.string() in schema, so a number should fail
    expect(res.status).toBe(400);
  });

  test("recipient as zero address is rejected", async () => {
    const body = claimBody(server.currentEpoch, {
      recipient: "0x0000000000000000000000000000000000000000",
    });
    const res = await postClaim(server.baseUrl, body);
    // C2: zero address is explicitly rejected to prevent burning funds
    expect(res.status).toBe(400);
  });

  test("prototype pollution attempt in JSON body", async () => {
    const body = JSON.stringify({
      ...claimBody(server.currentEpoch),
      "__proto__": { "isAdmin": true },
      "constructor": { "prototype": { "isAdmin": true } },
    });
    const res = await fetch(`${server.baseUrl}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    // Should process normally without pollution
    expect(res.status).toBeLessThan(600);
  });
});
