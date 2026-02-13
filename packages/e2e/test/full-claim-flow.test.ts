import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startTestServer, postClaim, type TestServer } from "./helpers/setup";
import { claimBody } from "./helpers/fixtures";

describe("Full claim flow (happy path)", () => {
  let server: TestServer;

  beforeAll(() => {
    server = startTestServer();
  });

  afterAll(() => {
    server.close();
  });

  test("POST /claim with valid proof returns 200 with claimId and txHash", async () => {
    const body = claimBody(server.currentEpoch);
    const res = await postClaim(server.baseUrl, body);

    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      claimId: string;
      txHash: string;
      network: string;
      amount: string;
    };

    // Verify response shape
    expect(json).toHaveProperty("claimId");
    expect(json).toHaveProperty("txHash");
    expect(json).toHaveProperty("network");
    expect(json).toHaveProperty("amount");

    // claimId and txHash should be hex strings
    expect(json.claimId).toMatch(/^0x[0-9a-f]+$/);
    expect(json.txHash).toMatch(/^0x[0-9a-f]+$/);

    // Network should match the requested target
    expect(json.network).toBe("sepolia");

    // Amount should be the dispensation amount for sepolia
    expect(json.amount).toBe("100000000000000000");
  });

  test("GET /status/:claimId returns the claim after successful submission", async () => {
    const body = claimBody(server.currentEpoch);
    const claimRes = await postClaim(server.baseUrl, body);
    expect(claimRes.status).toBe(200);

    const claimJson = (await claimRes.json()) as { claimId: string };

    // Fetch the status
    const statusRes = await fetch(
      `${server.baseUrl}/status/${claimJson.claimId}`,
    );
    expect(statusRes.status).toBe(200);

    const statusJson = (await statusRes.json()) as {
      claimId: string;
      status: string;
      txHash: string;
      network: string;
    };

    expect(statusJson.claimId).toBe(claimJson.claimId);
    expect(statusJson.status).toBe("confirmed");
    expect(statusJson.txHash).toMatch(/^0x[0-9a-f]+$/);
    expect(statusJson.network).toBe("sepolia");
  });

  test("GET /status/:unknownId returns 404", async () => {
    const res = await fetch(`${server.baseUrl}/status/0xnonexistent`);
    expect(res.status).toBe(404);

    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("NOT_FOUND");
  });
});
