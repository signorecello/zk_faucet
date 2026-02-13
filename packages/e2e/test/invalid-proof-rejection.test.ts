import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startTestServer, postClaim, type TestServer } from "./helpers/setup";
import {
  claimBody,
  INVALID_PROOF,
  TEST_RECIPIENT,
  TEST_NETWORK,
} from "./helpers/fixtures";

describe("Invalid proof rejection", () => {
  let server: TestServer;

  beforeAll(() => {
    server = startTestServer();
  });

  afterAll(() => {
    server.close();
  });

  test("empty proof (0x) returns 400 INVALID_PROOF", async () => {
    const body = claimBody(server.currentEpoch, { proof: INVALID_PROOF });
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("INVALID_PROOF");
  });

  test("proof not starting with 0x is rejected by schema validation", async () => {
    const body = claimBody(server.currentEpoch, { proof: "deadbeef" });
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("INVALID_PUBLIC_INPUTS");
  });

  test("nonexistent moduleId returns 400 INVALID_MODULE", async () => {
    const body = claimBody(server.currentEpoch, {
      moduleId: "nonexistent-module",
    });
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("INVALID_MODULE");
    expect(json.error.message).toContain("nonexistent-module");
  });

  test("missing required fields returns 400 INVALID_PUBLIC_INPUTS", async () => {
    // Send a body missing the publicInputs field entirely
    const body = {
      moduleId: "eth-balance",
      proof: "0xdeadbeef",
      recipient: TEST_RECIPIENT,
      targetNetwork: TEST_NETWORK,
    };
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("INVALID_PUBLIC_INPUTS");
  });

  test("invalid recipient address returns 400", async () => {
    const body = claimBody(server.currentEpoch, {
      recipient: "not-an-address",
    });
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("INVALID_PUBLIC_INPUTS");
  });

  test("missing proof field returns 400", async () => {
    const body = {
      moduleId: "eth-balance",
      publicInputs: {
        stateRoot: "0x0000000000000000000000000000000000000000000000000000000000000001",
        epoch: server.currentEpoch,
        minBalance: "10000000000000000",
        nullifier: "0x0000000000000000000000000000000000000000000000000000000099999999",
      },
      recipient: TEST_RECIPIENT,
      targetNetwork: TEST_NETWORK,
    };
    const res = await postClaim(server.baseUrl, body);
    expect(res.status).toBe(400);
  });
});
