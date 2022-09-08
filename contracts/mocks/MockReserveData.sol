// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "../interfaces/aave/IMoneyMarket.sol";
import "./MockToken.sol";

contract MockMoneyMarketPool is IMoneyMarket {
    function deposit(
        address,
        uint256,
        address,
        uint16
    ) external pure override {
        revert("Not supported");
    }

    function withdraw(
        address,
        uint256,
        address
    ) external pure override returns (uint256) {
        revert("Not supported");
    }

    function borrow(
        address,
        uint256,
        uint256,
        uint16,
        address
    ) external pure override {
        revert("Not supported");
    }

    function repay(
        address,
        uint256,
        uint256,
        address
    ) external pure override returns (uint256) {
        revert("Not supported");
    }

    function getUserAccountData(address)
        external
        pure
        override
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        return (12e18, 10e18, 35e18, 555, 125, 2e18);
    }
}

contract MockReserveDataV2 is MockMoneyMarketPool, IGetReserveDataV2 {
    function getReserveData(address) external pure returns (IGetReserveDataV2.ReserveData memory) {
        return
            IGetReserveDataV2.ReserveData(
                ReserveConfigurationMap(0),
                0,
                0,
                123, // supply APY RAY
                456, // variable borrow APY RAY
                789, // fixed borrow APY RAY
                0,
                address(0),
                address(0),
                address(0),
                address(0),
                0
            );
    }
}

contract MockReserveDataV3 is MockMoneyMarketPool, IGetReserveDataV3 {
    function getReserveData(address) external pure returns (IGetReserveDataV3.ReserveData memory) {
        return
            IGetReserveDataV3.ReserveData(
                ReserveConfigurationMap(0),
                0,
                123, // supply APY RAY
                0,
                456, // variable borrow APY RAY
                789, // fixed borrow APY RAY
                0,
                0,
                address(0),
                address(0),
                address(0),
                address(0),
                0,
                0,
                0
            );
    }
}
