// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IAMM.sol";

contract SimpleCPAMM is IAMM {
    address public immutable token0;
    address public immutable token1;

    uint256 public reserve0; // token0 reserve
    uint256 public reserve1; // token1 reserve

    constructor(address _token0, address _token1, uint256 _r0, uint256 _r1) {
        require(_token0 != address(0) && _token1 != address(0) && _token0 != _token1, "bad tokens");
        require(_r0 > 0 && _r1 > 0, "bad reserves");
        token0 = _token0;
        token1 = _token1;
        reserve0 = _r0;
        reserve1 = _r1;
    }

    function getAmountOut(uint256 amountIn, bool zeroForOne) external view override returns (uint256) {
        if (amountIn == 0) return 0;
        if (zeroForOne) {
            // x -> y: out = (amountIn * y) / (x + amountIn)
            uint256 x = reserve0;
            uint256 y = reserve1;
            return (amountIn * y) / (x + amountIn);
        } else {
            // y -> x
            uint256 x = reserve1;
            uint256 y = reserve0;
            return (amountIn * y) / (x + amountIn);
        }
    }

    function swap(uint256 amountIn, address tokenIn) external override returns (bool) {
        require(amountIn > 0, "zero in");
        if (tokenIn == token0) {
            // token0 -> token1
            uint256 out = (amountIn * reserve1) / (reserve0 + amountIn);
            reserve0 += amountIn;
            require(out <= reserve1, "insufficient liq");
            reserve1 -= out;
            return true;
        } else if (tokenIn == token1) {
            // token1 -> token0
            uint256 out = (amountIn * reserve0) / (reserve1 + amountIn);
            reserve1 += amountIn;
            require(out <= reserve0, "insufficient liq");
            reserve0 -= out;
            return true;
        } else {
            revert("bad token");
        }
    }
}
