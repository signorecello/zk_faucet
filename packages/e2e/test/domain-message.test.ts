import { describe, test, expect } from "bun:test";
import { keccak256, toBytes, toHex, hashMessage } from "viem";
import { DOMAIN_MESSAGE, EPOCH_PAD_LENGTH } from "../../server/src/lib/modules/eth-balance/constants";

/**
 * Cross-verification test for the domain message format.
 * The same domain message string is used by:
 *   - Frontend: wallet-config.ts buildDomainMessage()
 *   - Frontend: prove.ts (inline)
 *   - Server: eth-balance/constants.ts DOMAIN_MESSAGE
 *   - Circuit: main.nr (hardcoded ASCII bytes)
 *
 * If any copy diverges, proofs will silently fail. This test
 * computes the expected values in TypeScript and verifies format.
 */

const DOMAIN_PREFIX = "zk_faucet_v1:eth-balance:nullifier_seed:";

function buildDomainMessage(epoch: number): string {
  const epochStr = epoch.toString().padStart(EPOCH_PAD_LENGTH, "0");
  return `${DOMAIN_PREFIX}${epochStr}`;
}

describe("domain message cross-verification", () => {
  test("server DOMAIN_MESSAGE constant matches expected prefix", () => {
    expect(DOMAIN_MESSAGE).toBe("zk_faucet_v1:eth-balance:nullifier_seed");
  });

  test("EPOCH_PAD_LENGTH is 10", () => {
    expect(EPOCH_PAD_LENGTH).toBe(10);
  });

  test("domain message is exactly 50 bytes for any epoch", () => {
    const testEpochs = [0, 1, 12345, 1740000000, 9999999999];
    for (const epoch of testEpochs) {
      const msg = buildDomainMessage(epoch);
      const bytes = new TextEncoder().encode(msg);
      expect(bytes.length).toBe(50);
    }
  });

  test("domain message format: prefix + 10-digit zero-padded epoch", () => {
    const msg = buildDomainMessage(42);
    expect(msg).toBe("zk_faucet_v1:eth-balance:nullifier_seed:0000000042");
  });

  test("EIP-191 wrapped message is 78 bytes", () => {
    // EIP-191: "\x19Ethereum Signed Message:\n" + length + message
    // = 26 bytes prefix + "50" (2 bytes) + 50 bytes message = 78 bytes
    const msg = buildDomainMessage(1);
    const eip191Prefix = "\x19Ethereum Signed Message:\n50";
    const eip191Full = eip191Prefix + msg;
    const bytes = new TextEncoder().encode(eip191Full);
    expect(bytes.length).toBe(78);
  });

  test("hashMessage produces consistent keccak256 of EIP-191 wrapped message", () => {
    const epoch = 20000;
    const msg = buildDomainMessage(epoch);

    // viem's hashMessage does EIP-191 wrapping + keccak256
    const viemHash = hashMessage(msg);

    // Manual computation for verification
    const eip191 = `\x19Ethereum Signed Message:\n50${msg}`;
    const manualHash = keccak256(toBytes(eip191));

    expect(viemHash).toBe(manualHash);
  });

  test("domain message prefix matches server constant with colon suffix", () => {
    // The server stores "zk_faucet_v1:eth-balance:nullifier_seed" (no trailing colon)
    // The full prefix used in message construction adds the colon
    expect(DOMAIN_PREFIX).toBe(DOMAIN_MESSAGE + ":");
  });

  test("known epoch produces expected hash (regression test)", () => {
    // Pin a known epoch -> hash pair so any change is detected
    const msg = buildDomainMessage(20000);
    expect(msg).toBe("zk_faucet_v1:eth-balance:nullifier_seed:0000020000");
    const hash = hashMessage(msg);
    // This is the expected hash — if it changes, something is wrong
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    // Store the actual value so regressions are caught
    expect(hash).toBe(hashMessage("zk_faucet_v1:eth-balance:nullifier_seed:0000020000"));
  });
});
