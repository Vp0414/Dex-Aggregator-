// test/dex-aggregator.router.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("DexAggregator - router success", function () {
  let token0, token1, ammA, ammB, agg, signer;

  beforeEach(async function () {
    const [s0, s1, s2] = await ethers.getSigners();
    signer = s0;
    token0 = s1.address;
    token1 = s2.address;

    const AMM = await ethers.getContractFactory("SimpleCPAMM");
    ammA = await AMM.deploy(token0, token1, 1000n, 1000n);
    await ammA.waitForDeployment();
    ammB = await AMM.deploy(token0, token1, 1000n, 1500n);
    await ammB.waitForDeployment();

    const Agg = await ethers.getContractFactory("DexAggregator");
    agg = await Agg.deploy(await ammA.getAddress(), await ammB.getAddress());
    await agg.waitForDeployment();
  });

  it("routes to the better AMM (B) and emits SwapRouted", async function () {
    const now = Math.floor(Date.now() / 1000);

    // Preview expected out & best using a static call
    const preview = await agg.bestQuote.staticCall(100n, true);
    const outB   = preview[1];
    const best   = Number(preview[2]);
    expect(best).to.equal(2);

    // Route with minOut = previewed outB
    const tx = await agg.swapBest(100n, true, token0, outB, now + 600);

    await expect(tx)
      .to.emit(agg, "SwapRouted")
      .withArgs(
        await signer.getAddress(),
        await ammB.getAddress(),
        100n,
        true,
        anyValue, // out
        2         // best = B
      );
  });
});
