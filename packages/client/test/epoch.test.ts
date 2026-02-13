import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  getCurrentEpoch,
  getEpochBounds,
  isCurrentEpoch,
  EPOCH_DURATION_SECONDS,
} from "../src/epoch";

describe("epoch", () => {
  describe("EPOCH_DURATION_SECONDS", () => {
    test("equals one week in seconds", () => {
      expect(EPOCH_DURATION_SECONDS).toBe(7 * 24 * 60 * 60);
      expect(EPOCH_DURATION_SECONDS).toBe(604_800);
    });
  });

  describe("getCurrentEpoch", () => {
    let originalDateNow: () => number;

    beforeEach(() => {
      originalDateNow = Date.now;
    });

    afterEach(() => {
      Date.now = originalDateNow;
    });

    test("returns expected epoch for a known timestamp", () => {
      // 2024-01-01T00:00:00Z = 1704067200 seconds since epoch
      Date.now = () => 1704067200 * 1000;
      const epoch = getCurrentEpoch();
      expect(epoch).toBe(Math.floor(1704067200 / EPOCH_DURATION_SECONDS));
    });

    test("returns 0 for unix epoch", () => {
      Date.now = () => 0;
      expect(getCurrentEpoch()).toBe(0);
    });

    test("returns same epoch within one-week window", () => {
      // Start of some epoch
      const epochStart = 2822 * EPOCH_DURATION_SECONDS;
      Date.now = () => epochStart * 1000;
      const epoch1 = getCurrentEpoch();

      // 6 days later (still same epoch)
      Date.now = () => (epochStart + 6 * 24 * 60 * 60) * 1000;
      const epoch2 = getCurrentEpoch();

      expect(epoch1).toBe(epoch2);
    });

    test("transitions at epoch boundary", () => {
      const epochNum = 2822;
      const boundary = epochNum * EPOCH_DURATION_SECONDS;

      // One second before boundary
      Date.now = () => (boundary - 1) * 1000;
      expect(getCurrentEpoch()).toBe(epochNum - 1);

      // Exactly at boundary
      Date.now = () => boundary * 1000;
      expect(getCurrentEpoch()).toBe(epochNum);
    });
  });

  describe("getEpochBounds", () => {
    test("returns correct start and end for epoch 0", () => {
      const bounds = getEpochBounds(0);
      expect(bounds.start).toBe(0);
      expect(bounds.end).toBe(EPOCH_DURATION_SECONDS);
    });

    test("returns correct bounds for arbitrary epoch", () => {
      const epoch = 2822;
      const bounds = getEpochBounds(epoch);
      expect(bounds.start).toBe(epoch * EPOCH_DURATION_SECONDS);
      expect(bounds.end).toBe((epoch + 1) * EPOCH_DURATION_SECONDS);
    });

    test("end of one epoch equals start of next", () => {
      const epoch = 100;
      const bounds1 = getEpochBounds(epoch);
      const bounds2 = getEpochBounds(epoch + 1);
      expect(bounds1.end).toBe(bounds2.start);
    });

    test("epoch duration is exactly EPOCH_DURATION_SECONDS", () => {
      const bounds = getEpochBounds(42);
      expect(bounds.end - bounds.start).toBe(EPOCH_DURATION_SECONDS);
    });
  });

  describe("isCurrentEpoch", () => {
    let originalDateNow: () => number;

    beforeEach(() => {
      originalDateNow = Date.now;
    });

    afterEach(() => {
      Date.now = originalDateNow;
    });

    test("returns true for current epoch", () => {
      Date.now = () => 1704067200 * 1000;
      const current = getCurrentEpoch();
      expect(isCurrentEpoch(current)).toBe(true);
    });

    test("returns false for past epoch", () => {
      Date.now = () => 1704067200 * 1000;
      const current = getCurrentEpoch();
      expect(isCurrentEpoch(current - 1)).toBe(false);
    });

    test("returns false for future epoch", () => {
      Date.now = () => 1704067200 * 1000;
      const current = getCurrentEpoch();
      expect(isCurrentEpoch(current + 1)).toBe(false);
    });
  });
});
