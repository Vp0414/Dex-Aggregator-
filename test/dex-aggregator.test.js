const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DexAggregator", function () {
  let token0, token1;

  before(async function () {
    const [, s1, s2] = await ethers.getSigners();
    token0 = s1.address;
    token1 = s2.address;
  });

  it("quotes both and picks the best", async function () {
    const AMM = await ethers.getContractFactory("SimpleCPAMM");
    const ammA = await AMM.deploy(token0, token1, 1000n, 1000n);
    await ammA.waitForDeployment();

    // Make B strictly better by giving it more of the output-side reserve
    const ammB = await AMM.deploy(token0, token1, 1000n, 1500n);
    await ammB.waitForDeployment();

    const Agg = await ethers.getContractFactory("DexAggregator");
    const agg = await Agg.deploy(await ammA.getAddress(), await ammB.getAddress());
    await agg.waitForDeployment();

    // returns (outA, outB, best)  with best: 1=A, 2=B, 0=tie
    const res   = await agg.bestQuote.staticCall(100n, true);
    const outA  = res[0];
    const outB  = res[1];
    const best  = Number(res[2]);

    expect(outA).to.be.gt(0n);
    expect(outB).to.be.gt(0n);
    expect(outB).to.be.gt(outA);   // B should be better with these reserves
    expect(best).to.equal(2);      // 2 = B (your contract's convention)
  });

  it("reverts on bad AMM addresses", async function () {
    const Agg = await ethers.getContractFactory("DexAggregator");
    await expect(
      Agg.deploy(ethers.ZeroAddress, ethers.Wallet.createRandom().address)
    ).to.be.revertedWithCustomError(Agg, "BadAMM");
  });

  it("reverts on same AMM", async function () {
    const AMM = await ethers.getContractFactory("SimpleCPAMM");
    const amm = await AMM.deploy(token0, token1, 1000n, 1000n);
    await amm.waitForDeployment();

    const Agg = await ethers.getContractFactory("DexAggregator");
    await expect(
      Agg.deploy(await amm.getAddress(), await amm.getAddress())
    ).to.be.revertedWithCustomError(Agg, "SameAMM");
  });
});
