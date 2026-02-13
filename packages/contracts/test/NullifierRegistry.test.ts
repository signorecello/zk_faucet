import { expect } from "chai";
import { ethers } from "hardhat";
import { NullifierRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("NullifierRegistry", function () {
  let registry: NullifierRegistry;
  let owner: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const nullifier = ethers.id("test-nullifier-0");
  const epoch = 1n;
  const recipient = "0x000000000000000000000000000000000000dEaD";

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("NullifierRegistry");
    registry = await factory.deploy(owner.address);
  });

  it("should record a nullifier successfully", async function () {
    await registry.recordNullifier(nullifier, epoch, recipient);
    expect(await registry.spentNullifiers(nullifier)).to.equal(true);
  });

  it("should revert on double-record with 'Already spent'", async function () {
    await registry.recordNullifier(nullifier, epoch, recipient);
    await expect(
      registry.recordNullifier(nullifier, epoch, recipient)
    ).to.be.revertedWith("Already spent");
  });

  it("should return correct isSpent values", async function () {
    const unusedNullifier = ethers.id("unused-nullifier");
    expect(await registry.isSpent(nullifier)).to.equal(false);
    expect(await registry.isSpent(unusedNullifier)).to.equal(false);

    await registry.recordNullifier(nullifier, epoch, recipient);

    expect(await registry.isSpent(nullifier)).to.equal(true);
    expect(await registry.isSpent(unusedNullifier)).to.equal(false);
  });

  it("should only allow owner to record nullifiers", async function () {
    await expect(
      registry.connect(other).recordNullifier(nullifier, epoch, recipient)
    ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
  });

  it("should emit NullifierSpent event with correct args", async function () {
    await expect(registry.recordNullifier(nullifier, epoch, recipient))
      .to.emit(registry, "NullifierSpent")
      .withArgs(nullifier, epoch, recipient);
  });

  // --- Security edge cases ---

  it("should handle zero-value nullifier (bytes32(0))", async function () {
    const zeroNullifier = ethers.ZeroHash;
    await registry.recordNullifier(zeroNullifier, epoch, recipient);
    expect(await registry.isSpent(zeroNullifier)).to.equal(true);
    // Double-record of zero should also revert
    await expect(
      registry.recordNullifier(zeroNullifier, epoch, recipient)
    ).to.be.revertedWith("Already spent");
  });

  it("should allow different nullifiers in same epoch", async function () {
    const nullifier2 = ethers.id("test-nullifier-1");
    await registry.recordNullifier(nullifier, epoch, recipient);
    await registry.recordNullifier(nullifier2, epoch, recipient);
    expect(await registry.isSpent(nullifier)).to.equal(true);
    expect(await registry.isSpent(nullifier2)).to.equal(true);
  });

  it("should allow same nullifier-like value across different epochs (nullifier itself is unique)", async function () {
    // In this contract, the nullifier bytes32 IS the unique key, not (nullifier, epoch).
    // The epoch-binding happens in the nullifier derivation (poseidon2(pubkey_x, pubkey_y, epoch)).
    // So two different epoch nullifiers will have different bytes32 values.
    const null1 = ethers.id("epoch-100-nullifier");
    const null2 = ethers.id("epoch-101-nullifier");
    await registry.recordNullifier(null1, 100n, recipient);
    await registry.recordNullifier(null2, 101n, recipient);
    expect(await registry.isSpent(null1)).to.equal(true);
    expect(await registry.isSpent(null2)).to.equal(true);
  });

  it("should handle max uint256 epoch", async function () {
    const maxEpoch = 2n ** 256n - 1n;
    await registry.recordNullifier(nullifier, maxEpoch, recipient);
    expect(await registry.isSpent(nullifier)).to.equal(true);
  });

  it("should handle zero address as recipient", async function () {
    const zeroAddr = ethers.ZeroAddress;
    const null3 = ethers.id("zero-addr-nullifier");
    await registry.recordNullifier(null3, epoch, zeroAddr);
    expect(await registry.isSpent(null3)).to.equal(true);
  });

  it("should reject non-owner even with valid nullifier", async function () {
    await expect(
      registry.connect(other).recordNullifier(
        ethers.id("attacker-nullifier"),
        epoch,
        other.address,
      )
    ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
  });
});
