const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Failure", function () {
  let token0, token1, ammA, ammB, agg;

  beforeEach(async function () {
    const [, s1, s2] = await ethers.getSigners();
    token0 = s1.address;
    token1 = s2.address;

    // Deploy two AMMs (B is better due to higher reserve1)
    const AMM = await ethers.getContractFactory("SimpleCPAMM");
    ammA = await AMM.deploy(token0, token1, 1000n, 1000n);
    await ammA.waitForDeployment();
    ammB = await AMM.deploy(token0, token1, 1000n, 1500n);
    await ammB.waitForDeployment();

    const Agg = await ethers.getContractFactory("DexAggregator");
    agg = await Agg.deploy(await ammA.getAddress(), await ammB.getAddress());
    await agg.waitForDeployment();
  });

  it("rejects zero amount", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      agg.swapBest(0n, true, token0, 1n, now + 60)
    ).to.be.revertedWithCustomError(agg, "ZeroAmount");
  });

  it("rejects zero token address", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      agg.swapBest(100n, true, ethers.ZeroAddress, 1n, now + 60)
    ).to.be.revertedWithCustomError(agg, "ZeroAddress");
  });

  it("rejects past deadline", async () => {
    const past = Math.floor(Date.now() / 1000) - 1;
    await expect(
      agg.swapBest(100n, true, token0, 1n, past)
    ).to.be.revertedWithCustomError(agg, "Expired");
  });

  it("rejects on slippage when minOut is too high", async () => {
    const now = Math.floor(Date.now() / 1000);
    // set minOut impossibly high to force Slippage
    await expect(
      agg.swapBest(100n, true, token0, 10_000n, now + 60)
    ).to.be.revertedWithCustomError(agg, "Slippage");
  });

  it("rejects while paused", async () => {
    await (await agg.pause()).wait();
    const now = Math.floor(Date.now() / 1000);
    await expect(
      agg.swapBest(100n, true, token0, 1n, now + 60)
    ).to.be.revertedWithCustomError(agg, "EnforcedPause"); // OZ Pausable v5
  });
});
