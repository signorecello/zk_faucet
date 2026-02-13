import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { formatInputsForCircuit, loadCircuitArtifact } from "../src/prove";
import type { ProofInputs } from "../src/types";

function makeTestInputs(): ProofInputs {
  return {
    address: new Uint8Array(20).fill(0xab),
    signature: {
      r: new Uint8Array(32).fill(0x01),
      s: new Uint8Array(32).fill(0x02),
      v: 27,
    },
    accountProofNodes: [
      new Uint8Array([0xf8, 0x51, 0xa0]),
      new Uint8Array([0xf8, 0x71, 0x80]),
    ],
    balance: 10000000000000000n, // 0.01 ETH
    nonce: 42n,
    codeHash: new Uint8Array(32).fill(0xc5),
    storageRoot: new Uint8Array(32).fill(0x56),
    stateRoot: new Uint8Array(32).fill(0xaa),
    epoch: 2822,
    minBalance: 10000000000000000n,
  };
}

describe("prove", () => {
  describe("formatInputsForCircuit", () => {
    test("formats address as hex string", () => {
      const inputs = makeTestInputs();
      const formatted = formatInputsForCircuit(inputs);
      expect(formatted.address).toMatch(/^0x[0-9a-f]+$/);
      // 20 bytes = 40 hex chars + 0x prefix
      expect(formatted.address).toBe(
        "0x" + "ab".repeat(20),
      );
    });

    test("formats signature components correctly", () => {
      const inputs = makeTestInputs();
      const formatted = formatInputsForCircuit(inputs);
      expect(formatted.signature_r).toBe("0x" + "01".repeat(32));
      expect(formatted.signature_s).toBe("0x" + "02".repeat(32));
      expect(formatted.signature_v).toBe("0x1b"); // 27 = 0x1b
    });

    test("formats balance as 32-byte field element", () => {
      const inputs = makeTestInputs();
      const formatted = formatInputsForCircuit(inputs);
      expect(formatted.balance).toMatch(/^0x[0-9a-f]{64}$/);
      // 0.01 ETH = 10000000000000000 = 0x2386F26FC10000
      expect(formatted.balance).toBe(
        "0x" + "2386f26fc10000".padStart(64, "0"),
      );
    });

    test("formats nonce as 32-byte field element", () => {
      const inputs = makeTestInputs();
      const formatted = formatInputsForCircuit(inputs);
      expect(formatted.nonce).toMatch(/^0x[0-9a-f]{64}$/);
      // 42 = 0x2a
      expect(formatted.nonce).toBe("0x" + "2a".padStart(64, "0"));
    });

    test("formats epoch as 4-byte value", () => {
      const inputs = makeTestInputs();
      const formatted = formatInputsForCircuit(inputs);
      // 2822 = 0xB06
      expect(formatted.epoch).toBe("0x00000b06");
    });

    test("formats state_root correctly", () => {
      const inputs = makeTestInputs();
      const formatted = formatInputsForCircuit(inputs);
      expect(formatted.state_root).toBe("0x" + "aa".repeat(32));
    });

    test("formats code_hash correctly", () => {
      const inputs = makeTestInputs();
      const formatted = formatInputsForCircuit(inputs);
      expect(formatted.code_hash).toBe("0x" + "c5".repeat(32));
    });

    test("formats storage_root correctly", () => {
      const inputs = makeTestInputs();
      const formatted = formatInputsForCircuit(inputs);
      expect(formatted.storage_root).toBe("0x" + "56".repeat(32));
    });

    test("formats account_proof_nodes as JSON array of hex strings", () => {
      const inputs = makeTestInputs();
      const formatted = formatInputsForCircuit(inputs);
      const parsed = JSON.parse(formatted.account_proof_nodes);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0]).toMatch(/^0x/);
      expect(parsed[1]).toMatch(/^0x/);
    });

    test("formats min_balance as 32-byte field element", () => {
      const inputs = makeTestInputs();
      const formatted = formatInputsForCircuit(inputs);
      expect(formatted.min_balance).toMatch(/^0x[0-9a-f]{64}$/);
      expect(formatted.min_balance).toBe(formatted.balance); // same value in test
    });

    test("includes all expected keys", () => {
      const inputs = makeTestInputs();
      const formatted = formatInputsForCircuit(inputs);
      const expectedKeys = [
        "address",
        "signature_r",
        "signature_s",
        "signature_v",
        "account_proof_nodes",
        "balance",
        "nonce",
        "code_hash",
        "storage_root",
        "state_root",
        "epoch",
        "min_balance",
      ];
      for (const key of expectedKeys) {
        expect(formatted).toHaveProperty(key);
      }
    });
  });

  describe("loadCircuitArtifact", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("fetches from correct URL", async () => {
      let calledUrl = "";
      globalThis.fetch = mock(async (input: string | URL | Request) => {
        calledUrl = typeof input === "string" ? input : input.toString();
        return new Response(JSON.stringify({ bytecode: "0xdead" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await loadCircuitArtifact("http://localhost:3000", "eth-balance");
      expect(calledUrl).toBe(
        "http://localhost:3000/circuits/eth-balance/artifact.json",
      );
    });

    test("returns parsed JSON artifact", async () => {
      const mockArtifact = { bytecode: "0xdead", abi: [] };
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify(mockArtifact), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const artifact = await loadCircuitArtifact(
        "http://localhost:3000",
        "eth-balance",
      );
      expect(artifact).toEqual(mockArtifact);
    });

    test("throws on non-OK response", async () => {
      globalThis.fetch = mock(async () => {
        return new Response("Not Found", { status: 404 });
      }) as typeof fetch;

      expect(
        loadCircuitArtifact("http://localhost:3000", "nonexistent"),
      ).rejects.toThrow("Failed to fetch circuit artifact");
    });
  });

  describe("generateProof", () => {
    test("throws with not-yet-available message", async () => {
      const { generateProof } = await import("../src/prove");
      const inputs = makeTestInputs();
      expect(generateProof({}, inputs)).rejects.toThrow(
        "Noir proof generation not yet available",
      );
    });
  });
});
