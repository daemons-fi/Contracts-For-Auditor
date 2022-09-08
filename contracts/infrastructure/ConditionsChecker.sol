// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./Messages.sol";
import "../interfaces/IGasTank.sol";
import "../core/GasPriceFeed.sol";
import "../interfaces/uniswapV2/IUniswapV2Router.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract ConditionsChecker is Ownable {
    mapping(bytes32 => uint256) internal lastExecutions;
    mapping(bytes32 => uint32) internal repetitionsCount;
    mapping(address => mapping(bytes32 => bool)) private revocations;

    uint256 internal immutable chainId;
    IGasTank internal gasTank;
    GasPriceFeed internal gasPriceFeed;
    uint256 internal immutable GAS_LIMIT;

    // domain definition
    string private constant EIP712_DOMAIN = "EIP712Domain(string name)";
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(EIP712_DOMAIN));

    // events
    event Executed(bytes32 id, uint256 cost);

    /* ========== CONSTRUCTOR ========== */

    constructor(uint256 _gas_limit) {
        uint256 id;
        assembly {
            id := chainid()
        }
        chainId = id;
        GAS_LIMIT = _gas_limit;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    /// @notice Set the address of a new GasTank
    /// @param _gasTank the new GasTank address
    function setGasTank(address _gasTank) external onlyOwner {
        require(_gasTank != address(0));
        gasTank = IGasTank(_gasTank);
    }

    /// @notice Set the address of a new GasPriceFeed
    /// @param _gasPriceFeed the new GasPriceFeed address
    function setGasFeed(address _gasPriceFeed) external onlyOwner {
        require(_gasPriceFeed != address(0));
        gasPriceFeed = GasPriceFeed(_gasPriceFeed);
    }

    /// @notice Checks whether the contract is ready to operate
    function preliminaryCheck() external view {
        require(address(gasTank) != address(0), "GasTank");
        require(address(gasPriceFeed) != address(0), "GasPriceFeed");
    }

    /* ========== PUBLIC FUNCTIONS ========== */

    /// @notice Revokes the script with the given ID.
    /// After revoking, it won't be possible to execute the specified script.
    /// @param _id the id of the script to revoke.
    function revoke(bytes32 _id) external {
        revocations[msg.sender][_id] = true;
    }

    /// @notice The number of times the specified script has been executed.
    /// @param _id the id of the script to check.
    function getRepetitions(bytes32 _id) external view returns (uint32) {
        return repetitionsCount[_id];
    }

    /* ========== HASH FUNCTIONS ========== */

    /// @notice Returns the hashed version of the balance
    function hashBalance(Balance calldata balance) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BALANCE_TYPEHASH,
                    balance.enabled,
                    balance.token,
                    balance.comparison,
                    balance.amount
                )
            );
    }

    /// @notice Returns the hashed version of the price condition
    function hashPrice(Price calldata price) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    PRICE_TYPEHASH,
                    price.enabled,
                    price.tokenA,
                    price.tokenB,
                    price.comparison,
                    price.value,
                    price.router
                )
            );
    }

    /// @notice Returns the hashed version of the frequency
    function hashFrequency(Frequency calldata frequency) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(FREQUENCY_TYPEHASH, frequency.enabled, frequency.delay, frequency.start)
            );
    }

    /// @notice Returns the hashed version of the repetitions
    function hashRepetitions(Repetitions calldata repetitions) internal pure returns (bytes32) {
        return keccak256(abi.encode(REPETITIONS_TYPEHASH, repetitions.enabled, repetitions.amount));
    }

    /// @notice Returns the hashed version of the follow condition
    function hashFollow(Follow calldata follow) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    FOLLOW_TYPEHASH,
                    follow.enabled,
                    follow.shift,
                    follow.scriptId,
                    follow.executor
                )
            );
    }

    /* ========== VERIFICATION FUNCTIONS ========== */

    /// @notice Checks whether the user has revoked the script execution
    function verifyRevocation(address user, bytes32 id) internal view {
        require(!revocations[user][id], "[REVOKED][FINAL]");
    }

    /// @notice Checks whether the user has enough funds in the GasTank to cover a script execution
    function verifyGasTank(address user) internal view {
        require(gasTank.gasBalanceOf(user) > GAS_LIMIT * gasPriceFeed.lastGasPrice(), "[GAS][TMP]");
    }

    /// @notice Checks whether the user has enough funds to pay the tip to the executor
    function verifyTip(uint256 tip, address user) internal view {
        require(tip == 0 || gasTank.tipBalanceOf(user) >= tip, "[TIP][TMP]");
    }

    /// @notice If the balance condition is enabled, it checks the user balance for it
    function verifyBalance(Balance calldata balance, address user) internal view {
        if (!balance.enabled) return;

        IERC20 token = IERC20(balance.token);
        uint256 userBalance = token.balanceOf(user);

        if (balance.comparison == 0x00)
            // greater than
            require(userBalance > balance.amount, "[BALANCE_CONDITION_LOW][TMP]");
        else if (balance.comparison == 0x01)
            // less than
            require(userBalance < balance.amount, "[BALANCE_CONDITION_HIGH][TMP]");
    }

    /// @notice If the price condition is enabled, it checks the token price for it
    function verifyPrice(Price calldata price) internal view {
        if (!price.enabled) return;

        address[] memory path = new address[](2);
        path[0] = price.tokenA;
        path[1] = price.tokenB;
        uint256 one = 10**ERC20(price.tokenA).decimals();
        uint256 tokenPrice = IUniswapV2Router01(price.router).getAmountsOut(one, path)[1];

        if (price.comparison == 0x00)
            // greater than
            require(tokenPrice > price.value, "[PRICE_CONDITION_LOW][TMP]");
        else if (price.comparison == 0x01)
            // less than
            require(tokenPrice < price.value, "[PRICE_CONDITION_HIGH][TMP]");
    }

    /// @notice If the frequency condition is enabled, it checks whether enough blocks have been minted since the last execution
    function verifyFrequency(Frequency calldata frequency, bytes32 id) internal view {
        if (!frequency.enabled) return;

        if (lastExecutions[id] > 0) {
            // the message has already been executed at least once
            require(
                block.timestamp > lastExecutions[id] + frequency.delay,
                "[FREQUENCY_CONDITION][TMP]"
            );
            return;
        }

        // the message has never been executed before
        require(block.timestamp > frequency.start + frequency.delay, "[FREQUENCY_CONDITION][TMP]");
    }

    /// @notice If the repetitions condition is enabled, it checks whether the script has reached its maximum number of executions
    function verifyRepetitions(Repetitions calldata repetitions, bytes32 id) internal view {
        if (!repetitions.enabled) return;
        require(repetitionsCount[id] < repetitions.amount, "[REPETITIONS_CONDITION][FINAL]");
    }

    /// @notice If the follow condition is enabled, it checks whether the script it's supposed to follow has been executed
    function verifyFollow(Follow calldata follow, bytes32 id) internal view {
        if (!follow.enabled) return;
        uint32 parentCount = follow.executor == address(this)
            ? repetitionsCount[follow.scriptId]
            : ConditionsChecker(follow.executor).getRepetitions(follow.scriptId);
        require(parentCount + follow.shift == repetitionsCount[id] + 1, "[FOLLOW_CONDITION][TMP]");
    }

    /// @notice Verifies that the user gave the allowance to the contract to move their tokens
    function verifyAllowance(
        address user,
        address token,
        uint256 amount
    ) internal view {
        require(IERC20(token).allowance(user, address(this)) >= amount, "[ALLOWANCE][ACTION]");
    }
}
