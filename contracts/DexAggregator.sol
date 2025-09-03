// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAMM {
    function getAmountOut(uint256 amountIn, bool zeroForOne) external view returns (uint256);
    function swap(uint256 amountIn, address tokenIn) external returns (bool);
}

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract DexAggregator is Ownable, Pausable, ReentrancyGuard {
    // existing errors
    error BadAMM();
    error SameAMM();

    // hardening & router errors
    error NotContract();
    error ZeroAmount();
    error ZeroAddress();
    error Expired();
    error Slippage();
    error SwapFailed();

    IAMM public immutable ammA;
    IAMM public immutable ammB;

    event Quoted(uint256 amountIn, bool zeroForOne, uint256 outA, uint256 outB, uint8 best);
    event SwapRouted(
        address indexed caller,
        address indexed amm,
        uint256 amountIn,
        bool zeroForOne,
        uint256 out,
        uint8 best
    );

    constructor(address _a, address _b) Ownable(msg.sender) {
        if (_a == address(0) || _b == address(0)) revert BadAMM();
        if (_a == _b) revert SameAMM();
        // ensure both are real contracts (not EOAs/destroyed)
        if (_a.code.length == 0 || _b.code.length == 0) revert NotContract();

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
        try ammA.getAmountOut(amountIn, zeroForOne) returns (uint256 a) { outA = a; } catch {}
        // AMM B
        try ammB.getAmountOut(amountIn, zeroForOne) returns (uint256 b) { outB = b; } catch {}
    }

    /// @notice Returns both quotes and which AMM is best (1 = A, 2 = B, 0 = tie/none)
    function bestQuote(uint256 amountIn, bool zeroForOne)
        external
        view
        returns (uint256 outA, uint256 outB, uint8 best)
    {
        (outA, outB) = quoteBoth(amountIn, zeroForOne);
        if (outA == 0 && outB == 0) best = 0;
        else if (outA > outB) best = 1;
        else if (outB > outA) best = 2;
        else best = 0;
    }

    /// @notice Securely route a swap to the best AMM with slippage & deadline checks.
    /// @dev Works with your current mock AMMs (no ERC20 transfers). When you move to
    ///      real tokens, we’ll add SafeERC20 pulls/approvals around this call.
    /// @return out best quoted output, best (1=A, 2=B)
    function swapBest(
        uint256 amountIn,
        bool zeroForOne,
        address tokenIn,
        uint256 minOut,
        uint256 deadline
    )
        external
        whenNotPaused
        nonReentrant
        returns (uint256 out, uint8 best)
    {
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn == address(0)) revert ZeroAddress();
        if (block.timestamp > deadline) revert Expired();

        (uint256 outA, uint256 outB) = quoteBoth(amountIn, zeroForOne);
        if (outA == 0 && outB == 0) revert Slippage();

        if (outA >= outB) { out = outA; best = 1; } else { out = outB; best = 2; }
        if (out < minOut) revert Slippage();

        bool ok = (best == 1)
            ? ammA.swap(amountIn, tokenIn)
            : ammB.swap(amountIn, tokenIn);
        if (!ok) revert SwapFailed();

        emit SwapRouted(msg.sender, best == 1 ? address(ammA) : address(ammB), amountIn, zeroForOne, out, best);
    }

    // Admin controls
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}

 