// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./ConditionsChecker.sol";
import "../interfaces/aave/IMoneyMarket.sol";

abstract contract ConditionsCheckerForMoneyMarket {


    /* ========== HASH FUNCTIONS ========== */

    /// @notice  Returns the hashed version of the balance
    function hashHealthFactor(HealthFactor calldata healthFactor)
        internal
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encode(
                    HEALTH_FACTOR_TYPEHASH,
                    healthFactor.enabled,
                    healthFactor.kontract,
                    healthFactor.comparison,
                    healthFactor.amount
                )
            );
    }

    /* ========== VERIFICATION FUNCTIONS ========== */

    /// @notice If the healthFactor condition is enabled, it checks the user HF for the given MM contract
    function verifyHealthFactor(HealthFactor calldata healthFactor, address user)
        internal
        view
    {
        if (!healthFactor.enabled) return;
        (,,,,,uint256 currentHF) = IMoneyMarket(healthFactor.kontract).getUserAccountData(user);

        if (healthFactor.comparison == 0x00)
            // greater than
            require(
                currentHF > healthFactor.amount,
                "[HEALTH_FACTOR_LOW][TMP]"
            );
        else if (healthFactor.comparison == 0x01)
            // less than
            require(
                currentHF < healthFactor.amount,
                "[HEALTH_FACTOR_HIGH][TMP]"
            );
    }
}
