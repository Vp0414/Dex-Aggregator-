// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAMM {
    function getAmountOut(uint256 amountIn, bool zeroForOne) external view returns (uint256);
    function swap(uint256 amountIn, address tokenIn) external returns (bool);
}
