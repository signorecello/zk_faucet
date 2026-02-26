import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { NullifierStore } from "../src/lib/nullifier-store";

describe("NullifierStore", () => {
  let store: NullifierStore;

  beforeEach(() => {
    store = new NullifierStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  test("spend returns true for new nullifier", () => {
    const result = store.spend("eth-balance", "0xabc123", 100, "0xRecipient");
    expect(result).toBe(true);
  });

  test("spend returns false for duplicate nullifier", () => {
    store.spend("eth-balance", "0xabc123", 100, "0xRecipient");
    const result = store.spend("eth-balance", "0xabc123", 100, "0xRecipient2");
    expect(result).toBe(false);
  });

  test("isSpent returns false for unknown nullifier", () => {
    expect(store.isSpent("eth-balance", "0xunknown")).toBe(false);
  });

  test("isSpent returns true after spending", () => {
    store.spend("eth-balance", "0xabc123", 100, "0xRecipient");
    expect(store.isSpent("eth-balance", "0xabc123")).toBe(true);
  });

  test("different modules have separate nullifier spaces", () => {
    const result1 = store.spend("eth-balance", "0xabc123", 100, "0xR1");
    const result2 = store.spend("other-module", "0xabc123", 100, "0xR2");
    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });

  test("same module same nullifier different epoch still rejected (nullifier is unique per module)", () => {
    store.spend("eth-balance", "0xabc123", 100, "0xR1");
    // The PK is (module_id, nullifier), so same nullifier even in different epoch is rejected
    const result = store.spend("eth-balance", "0xabc123", 101, "0xR2");
    expect(result).toBe(false);
  });

  test("different nullifiers in same module both succeed", () => {
    const r1 = store.spend("eth-balance", "0xaaa", 100, "0xR1");
    const r2 = store.spend("eth-balance", "0xbbb", 100, "0xR2");
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });

  // --- Security-critical edge cases ---

  test("SQL injection in nullifier value is safely handled", () => {
    const malicious = "'; DROP TABLE nullifiers; --";
    const result = store.spend("eth-balance", malicious, 100, "0xR1");
    expect(result).toBe(true);
    // Verify it was stored, not executed as SQL
    expect(store.isSpent("eth-balance", malicious)).toBe(true);
    // Verify table still works
    const r2 = store.spend("eth-balance", "0xnormal", 100, "0xR2");
    expect(r2).toBe(true);
  });

  test("SQL injection in moduleId is safely handled", () => {
    const malicious = "' OR 1=1; --";
    const result = store.spend(malicious, "0xnull1", 100, "0xR1");
    expect(result).toBe(true);
    expect(store.isSpent(malicious, "0xnull1")).toBe(true);
    // Should NOT affect other modules
    expect(store.isSpent("eth-balance", "0xnull1")).toBe(false);
  });

  test("SQL injection in recipient is safely handled", () => {
    const result = store.spend("eth-balance", "0xn1", 100, "'; DROP TABLE nullifiers; --");
    expect(result).toBe(true);
    expect(store.isSpent("eth-balance", "0xn1")).toBe(true);
  });

  test("empty string nullifier is handled", () => {
    const r1 = store.spend("eth-balance", "", 100, "0xR1");
    expect(r1).toBe(true);
    // Second attempt with empty string is rejected
    const r2 = store.spend("eth-balance", "", 100, "0xR2");
    expect(r2).toBe(false);
  });

  test("very long nullifier value is handled", () => {
    const longNull = "0x" + "ab".repeat(1000);
    const result = store.spend("eth-balance", longNull, 100, "0xR1");
    expect(result).toBe(true);
    expect(store.isSpent("eth-balance", longNull)).toBe(true);
  });

  test("nullifier with unicode characters is handled", () => {
    const unicodeNull = "0x\u0000\u0001\uFFFF";
    const result = store.spend("eth-balance", unicodeNull, 100, "0xR1");
    expect(result).toBe(true);
    expect(store.isSpent("eth-balance", unicodeNull)).toBe(true);
  });

  test("concurrent spends of same nullifier - only one succeeds", () => {
    // SQLite serializes writes, so concurrent calls are sequenced
    // This verifies INSERT OR IGNORE atomicity
    const results: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(store.spend("eth-balance", "0xrace", 100, `0xR${i}`));
    }
    const successes = results.filter(Boolean);
    expect(successes).toHaveLength(1);
    expect(results[0]).toBe(true);
  });

  test("cross-module isolation: same nullifier in different modules", () => {
    store.spend("module-a", "0xshared", 100, "0xR1");
    store.spend("module-b", "0xshared", 100, "0xR2");

    expect(store.isSpent("module-a", "0xshared")).toBe(true);
    expect(store.isSpent("module-b", "0xshared")).toBe(true);
    // Module C should not see it
    expect(store.isSpent("module-c", "0xshared")).toBe(false);
  });

  test("epoch value does not affect uniqueness (PK is module_id + nullifier)", () => {
    // The nullifier includes epoch in its derivation (poseidon2(pubkey_x, pubkey_y, epoch)),
    // so different epochs produce different nullifier values.
    // But if someone replays the SAME nullifier value with a different epoch, it's still rejected.
    const r1 = store.spend("eth-balance", "0xsame", 100, "0xR1");
    const r2 = store.spend("eth-balance", "0xsame", 200, "0xR2");
    expect(r1).toBe(true);
    expect(r2).toBe(false);
  });

  test("negative epoch value is stored without error", () => {
    // Edge case: negative epoch shouldn't crash SQLite
    const result = store.spend("eth-balance", "0xneg", -1, "0xR1");
    expect(result).toBe(true);
  });

  test("MAX_SAFE_INTEGER epoch is handled", () => {
    const result = store.spend("eth-balance", "0xmax", Number.MAX_SAFE_INTEGER, "0xR1");
    expect(result).toBe(true);
  });

  // --- Pruning tests (H3) ---

  test("prune deletes nullifiers with epoch < threshold", () => {
    store.spend("eth-balance", "0xold1", 10, "0xR1");
    store.spend("eth-balance", "0xold2", 11, "0xR2");
    store.spend("eth-balance", "0xcurrent", 12, "0xR3");
    store.spend("eth-balance", "0xfuture", 13, "0xR4");

    const deleted = store.prune(12);
    expect(deleted).toBe(2); // epoch 10 and 11

    expect(store.isSpent("eth-balance", "0xold1")).toBe(false);
    expect(store.isSpent("eth-balance", "0xold2")).toBe(false);
    expect(store.isSpent("eth-balance", "0xcurrent")).toBe(true);
    expect(store.isSpent("eth-balance", "0xfuture")).toBe(true);
  });

  test("prune returns 0 when nothing to prune", () => {
    store.spend("eth-balance", "0xn1", 100, "0xR1");
    const deleted = store.prune(50);
    expect(deleted).toBe(0);
  });

  test("prune with no data returns 0", () => {
    const deleted = store.prune(100);
    expect(deleted).toBe(0);
  });

  test("prune across modules", () => {
    store.spend("module-a", "0xn1", 5, "0xR1");
    store.spend("module-b", "0xn2", 5, "0xR2");
    store.spend("module-a", "0xn3", 10, "0xR3");

    const deleted = store.prune(8);
    expect(deleted).toBe(2); // both epoch-5 entries
    expect(store.isSpent("module-a", "0xn1")).toBe(false);
    expect(store.isSpent("module-b", "0xn2")).toBe(false);
    expect(store.isSpent("module-a", "0xn3")).toBe(true);
  });
});
