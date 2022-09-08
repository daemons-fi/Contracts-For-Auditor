// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**  CONDITIONS

    User can use multiple conditions in their scripts and all of them will be checked.
    All conditions will be added to all actions.

 */

struct Balance {
    bool enabled;
    address token;
    bytes1 comparison;
    uint256 amount;
}
string constant BALANCE_TYPE = "Balance(bool enabled,address token,bytes1 comparison,uint256 amount)";
bytes32 constant BALANCE_TYPEHASH = keccak256(abi.encodePacked(BALANCE_TYPE));

struct Frequency {
    bool enabled;
    uint256 delay;
    uint256 start;
}
string constant FREQUENCY_TYPE = "Frequency(bool enabled,uint256 delay,uint256 start)";
bytes32 constant FREQUENCY_TYPEHASH = keccak256(abi.encodePacked(FREQUENCY_TYPE));

struct Price {
    bool enabled;
    address tokenA;
    address tokenB;
    bytes1 comparison;
    uint256 value;
    address router;
}
string constant PRICE_TYPE = "Price(bool enabled,address tokenA,address tokenB,bytes1 comparison,uint256 value,address router)";
bytes32 constant PRICE_TYPEHASH = keccak256(abi.encodePacked(PRICE_TYPE));

struct Repetitions {
    bool enabled;
    uint32 amount;
}
string constant REPETITIONS_TYPE = "Repetitions(bool enabled,uint32 amount)";
bytes32 constant REPETITIONS_TYPEHASH = keccak256(abi.encodePacked(REPETITIONS_TYPE));

struct Follow {
    bool enabled;
    uint256 shift;
    bytes32 scriptId;
    address executor;
}
string constant FOLLOW_TYPE = "Follow(bool enabled,uint256 shift,bytes32 scriptId,address executor)";
bytes32 constant FOLLOW_TYPEHASH = keccak256(abi.encodePacked(FOLLOW_TYPE));

struct HealthFactor {
    bool enabled;
    address kontract;
    bytes1 comparison;
    uint256 amount;
}
string constant HEALTH_FACTOR_TYPE = "HealthFactor(bool enabled,address kontract,bytes1 comparison,uint256 amount)";
bytes32 constant HEALTH_FACTOR_TYPEHASH = keccak256(abi.encodePacked(HEALTH_FACTOR_TYPE));

/**  ACTIONS

    Each action type will be executed by a different contract, called 'executor'.
    All executors inherit from the same class so they are able to verify the conditions.

 */

struct Swap {
    bytes32 scriptId;
    address tokenFrom;
    address tokenTo;
    bytes1 typeAmt;
    uint256 amount;
    address user;
    address kontract;
    address executor;
    uint256 chainId;
    uint256 tip;
    Balance balance;
    Frequency frequency;
    Price price;
    Repetitions repetitions;
    Follow follow;
}
string constant SWAP_TYPE = "Swap(bytes32 scriptId,address tokenFrom,address tokenTo,bytes1 typeAmt,uint256 amount,address user,address kontract,address executor,uint256 chainId,uint256 tip,Balance balance,Frequency frequency,Price price,Repetitions repetitions,Follow follow)Balance(bool enabled,address token,bytes1 comparison,uint256 amount)Follow(bool enabled,uint256 shift,bytes32 scriptId,address executor)Frequency(bool enabled,uint256 delay,uint256 start)Price(bool enabled,address tokenA,address tokenB,bytes1 comparison,uint256 value,address router)Repetitions(bool enabled,uint32 amount)";
bytes32 constant SWAP_TYPEHASH = keccak256(abi.encodePacked(SWAP_TYPE));

struct Transfer {
    bytes32 scriptId;
    address token;
    address destination;
    bytes1 typeAmt;
    uint256 amount;
    address user;
    address executor;
    uint256 chainId;
    uint256 tip;
    Balance balance;
    Follow follow;
    Frequency frequency;
    Price price;
    Repetitions repetitions;
}
string constant TRANSFER_TYPE = "Transfer(bytes32 scriptId,address token,address destination,bytes1 typeAmt,uint256 amount,address user,address executor,uint256 chainId,uint256 tip,Balance balance,Frequency frequency,Price price,Repetitions repetitions,Follow follow)Balance(bool enabled,address token,bytes1 comparison,uint256 amount)Follow(bool enabled,uint256 shift,bytes32 scriptId,address executor)Frequency(bool enabled,uint256 delay,uint256 start)Price(bool enabled,address tokenA,address tokenB,bytes1 comparison,uint256 value,address router)Repetitions(bool enabled,uint32 amount)";
bytes32 constant TRANSFER_TYPEHASH = keccak256(abi.encodePacked(TRANSFER_TYPE));

struct MmBase {
    bytes32 scriptId;
    address token;
    address aToken;
    bytes1 action;
    bytes1 typeAmt;
    uint256 amount;
    address user;
    address kontract;
    address executor;
    uint256 chainId;
    uint256 tip;
    Balance balance;
    Frequency frequency;
    Price price;
    Repetitions repetitions;
    Follow follow;
    HealthFactor healthFactor;
}
string constant MM_BASE_TYPE = "MmBase(bytes32 scriptId,address token,address aToken,bytes1 action,bytes1 typeAmt,uint256 amount,address user,address kontract,address executor,uint256 chainId,uint256 tip,Balance balance,Frequency frequency,Price price,Repetitions repetitions,Follow follow,HealthFactor healthFactor)Balance(bool enabled,address token,bytes1 comparison,uint256 amount)Follow(bool enabled,uint256 shift,bytes32 scriptId,address executor)Frequency(bool enabled,uint256 delay,uint256 start)HealthFactor(bool enabled,address kontract,bytes1 comparison,uint256 amount)Price(bool enabled,address tokenA,address tokenB,bytes1 comparison,uint256 value,address router)Repetitions(bool enabled,uint32 amount)";
bytes32 constant MM_BASE_TYPEHASH = keccak256(abi.encodePacked(MM_BASE_TYPE));

struct MmAdvanced {
    bytes32 scriptId;
    address token;
    address debtToken;
    bytes1 action;
    bytes1 typeAmt;
    bytes1 rateMode;
    uint256 amount;
    address user;
    address kontract;
    address executor;
    uint256 chainId;
    uint256 tip;
    Balance balance;
    Frequency frequency;
    Price price;
    Repetitions repetitions;
    Follow follow;
    HealthFactor healthFactor;
}
string constant MM_ADVANCED_TYPE = "MmAdvanced(bytes32 scriptId,address token,address debtToken,bytes1 action,bytes1 typeAmt,bytes1 rateMode,uint256 amount,address user,address kontract,address executor,uint256 chainId,uint256 tip,Balance balance,Frequency frequency,Price price,Repetitions repetitions,Follow follow,HealthFactor healthFactor)Balance(bool enabled,address token,bytes1 comparison,uint256 amount)Follow(bool enabled,uint256 shift,bytes32 scriptId,address executor)Frequency(bool enabled,uint256 delay,uint256 start)HealthFactor(bool enabled,address kontract,bytes1 comparison,uint256 amount)Price(bool enabled,address tokenA,address tokenB,bytes1 comparison,uint256 value,address router)Repetitions(bool enabled,uint32 amount)";
bytes32 constant MM_ADVANCED_TYPEHASH = keccak256(abi.encodePacked(MM_ADVANCED_TYPE));

struct ZapIn {
    bytes32 scriptId;
    address pair;
    uint256 amountA;
    uint256 amountB;
    bytes1 typeAmtA;
    bytes1 typeAmtB;
    address user;
    address kontract;
    address executor;
    uint256 chainId;
    uint256 tip;
    Balance balance;
    Frequency frequency;
    Price price;
    Repetitions repetitions;
    Follow follow;
}
string constant ZAP_IN_TYPE = "ZapIn(bytes32 scriptId,address pair,uint256 amountA,uint256 amountB,bytes1 typeAmtA,bytes1 typeAmtB,address user,address kontract,address executor,uint256 chainId,uint256 tip,Balance balance,Frequency frequency,Price price,Repetitions repetitions,Follow follow)Balance(bool enabled,address token,bytes1 comparison,uint256 amount)Follow(bool enabled,uint256 shift,bytes32 scriptId,address executor)Frequency(bool enabled,uint256 delay,uint256 start)Price(bool enabled,address tokenA,address tokenB,bytes1 comparison,uint256 value,address router)Repetitions(bool enabled,uint32 amount)";
bytes32 constant ZAP_IN_TYPEHASH = keccak256(abi.encodePacked(ZAP_IN_TYPE));

struct ZapOut {
    bytes32 scriptId;
    address tokenA;
    address tokenB;
    uint256 amount;
    bytes1 typeAmt;
    uint8 outputChoice;
    address user;
    address kontract;
    address executor;
    uint256 chainId;
    uint256 tip;
    Balance balance;
    Frequency frequency;
    Price price;
    Repetitions repetitions;
    Follow follow;
}
string constant ZAP_OUT_TYPE = "ZapOut(bytes32 scriptId,address tokenA,address tokenB,uint256 amount,bytes1 typeAmt,uint8 outputChoice,address user,address kontract,address executor,uint256 chainId,uint256 tip,Balance balance,Frequency frequency,Price price,Repetitions repetitions,Follow follow)Balance(bool enabled,address token,bytes1 comparison,uint256 amount)Follow(bool enabled,uint256 shift,bytes32 scriptId,address executor)Frequency(bool enabled,uint256 delay,uint256 start)Price(bool enabled,address tokenA,address tokenB,bytes1 comparison,uint256 value,address router)Repetitions(bool enabled,uint32 amount)";
bytes32 constant ZAP_OUT_TYPEHASH = keccak256(abi.encodePacked(ZAP_OUT_TYPE));

struct Beefy {
    bytes32 scriptId;
    address lpAddress;
    address mooAddress;
    bytes1 action;
    bytes1 typeAmt;
    uint256 amount;
    address user;
    address executor;
    uint256 chainId;
    uint256 tip;
    Balance balance;
    Frequency frequency;
    Price price;
    Repetitions repetitions;
    Follow follow;
}
string constant BEEFY_TYPE = "Beefy(bytes32 scriptId,address lpAddress,address mooAddress,bytes1 action,bytes1 typeAmt,uint256 amount,address user,address executor,uint256 chainId,uint256 tip,Balance balance,Frequency frequency,Price price,Repetitions repetitions,Follow follow)Balance(bool enabled,address token,bytes1 comparison,uint256 amount)Follow(bool enabled,uint256 shift,bytes32 scriptId,address executor)Frequency(bool enabled,uint256 delay,uint256 start)Price(bool enabled,address tokenA,address tokenB,bytes1 comparison,uint256 value,address router)Repetitions(bool enabled,uint32 amount)";
bytes32 constant BEEFY_TYPEHASH = keccak256(abi.encodePacked(BEEFY_TYPE));

struct Pass {
    bytes32 scriptId;
    address user;
    address executor;
    uint256 chainId;
    uint256 tip;
    Balance balance;
    Frequency frequency;
    Price price;
    Repetitions repetitions;
    Follow follow;
    HealthFactor healthFactor;
}
string constant PASS_TYPE = "Pass(bytes32 scriptId,address user,address executor,uint256 chainId,uint256 tip,Balance balance,Frequency frequency,Price price,Repetitions repetitions,Follow follow,HealthFactor healthFactor)Balance(bool enabled,address token,bytes1 comparison,uint256 amount)Follow(bool enabled,uint256 shift,bytes32 scriptId,address executor)Frequency(bool enabled,uint256 delay,uint256 start)HealthFactor(bool enabled,address kontract,bytes1 comparison,uint256 amount)Price(bool enabled,address tokenA,address tokenB,bytes1 comparison,uint256 value,address router)Repetitions(bool enabled,uint32 amount)";
bytes32 constant PASS_TYPEHASH = keccak256(abi.encodePacked(PASS_TYPE));
