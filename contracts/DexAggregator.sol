// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAMM {
    function getAmountOut(uint256 amountIn, bool zeroForOne) external view returns (uint256);
    function swap(uint256 amountIn, address tokenIn) external returns (bool);
}

contract DexAggregator {
    error BadAMM();
    error SameAMM();

    IAMM public immutable ammA;
    IAMM public immutable ammB;

    event Quoted(uint256 amountIn, bool zeroForOne, uint256 outA, uint256 outB, uint8 best);

    constructor(address _a, address _b) {
        if (_a == address(0) || _b == address(0)) revert BadAMM();
        if (_a == _b) revert SameAMM();
        ammA = IAMM(_a);
        ammB = IAMM(_b);
    }

    /// @notice Safe quote: if an AMM reverts, its quote is treated as 0
    function quoteBoth(uint256 amountIn, bool zeroForOne)
        public
        view
        returns (uint256 outA, uint256 outB)
    {
        // AMM A
        try ammA.getAmountOut(amountIn, zeroForOne) returns (uint256 a) {
            outA = a;
        } catch {
            outA = 0;
        }

        // AMM B
        try ammB.getAmountOut(amountIn, zeroForOne) returns (uint256 b) {
            outB = b;
        } catch {
            outB = 0;
        }
    }

    /// @notice Returns both quotes and which AMM is best (1 = A, 2 = B, 0 = tie/none)
    function bestQuote(uint256 amountIn, bool zeroForOne)
        external
        view
        returns (uint256 outA, uint256 outB, uint8 best)
    {
        (outA, outB) = quoteBoth(amountIn, zeroForOne);
        if (outA == 0 && outB == 0) {
            best = 0; // nothing available
        } else if (outA > outB) {
            best = 1;
        } else if (outB > outA) {
            best = 2;
        } else {
            best = 0; // equal
        }
    }

    // MVP note:
    // We intentionally do NOT route swaps here because most AMMs expect msg.sender to be the trader.
    // Have the UI call bestQuote(), then directly call the chosen AMM with the user as msg.sender.
    // If you later want to route via this contract, add a swapBest() that:
    //  - pulls tokenIn via transferFrom
    //  - approves the chosen AMM
    //  - calls amm.swap(...)
    //  - takes (minOut, to) params for safety
}
