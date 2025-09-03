# Dex Aggregator
[![Tests](https://github.com/Vp0414/Dex-Aggregator-/actions/workflows/test.yml/badge.svg)](https://github.com/Vp0414/Dex-Aggregator-/actions)
![Solidity](https://img.shields.io/badge/Solidity-0.8.20-black)
![Hardhat](https://img.shields.io/badge/Hardhat-2.26.x-yellow)
![ethers](https://img.shields.io/badge/ethers-v6-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

Minimal DEX quote + secure router demo.

## Quick Start
    npm install
    npx hardhat compile
    npx hardhat test

## Contracts
- contracts/DexAggregator.sol — quotes (view) + secure swapBest (slippage, deadline, pause, reentrancy guard).
- contracts/amm/SimpleCPAMM.sol — tiny AMM used for tests.
- contracts/interfaces/IAMM.sol — AMM interface.

## Tests
Run all:
    npx hardhat test

Includes success and failure cases (custom errors like ZeroAmount, Expired, Slippage, EnforcedPause).

## Frontend
Basic React UI with navbar (Upp University AMM). Start dev server:
    npm start

## Notes
You may see a Node 18 warning from Hardhat; it still works. To silence it later, upgrade to Node 22 + Hardhat 3 (ESM).
