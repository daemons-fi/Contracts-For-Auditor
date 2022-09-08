// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../infrastructure/ConditionsChecker.sol";
import "../infrastructure/Messages.sol";
import "../interfaces/uniswapV2/IUniswapV2Router.sol";

contract SwapperScriptExecutor is ConditionsChecker {
    mapping(address => mapping(IERC20 => bool)) private allowances;

    constructor() ConditionsChecker(350000) {}

    /* ========== HASH FUNCTIONS ========== */

    function hash(Swap calldata swap) private pure returns (bytes32) {
        bytes32 eip712DomainHash = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes("Daemons-Swap-v01")))
        );

        bytes32 swapHash = keccak256(
            bytes.concat(
                abi.encode(
                    SWAP_TYPEHASH,
                    swap.scriptId,
                    swap.tokenFrom,
                    swap.tokenTo,
                    swap.typeAmt,
                    swap.amount,
                    swap.user,
                    swap.kontract,
                    swap.executor,
                    swap.chainId,
                    swap.tip
                ),
                abi.encodePacked(
                    hashBalance(swap.balance),
                    hashFrequency(swap.frequency),
                    hashPrice(swap.price),
                    hashRepetitions(swap.repetitions),
                    hashFollow(swap.follow)
                )
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", eip712DomainHash, swapHash));
    }

    /* ========== VERIFICATION FUNCTIONS ========== */

    function verifySignature(
        Swap calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) private view {
        require(message.chainId == chainId, "[CHAIN][ERROR]");
        require(message.user == ecrecover(hash(message), v, r, s), "[SIGNATURE][FINAL]");
    }

    /// @notice verifies if all conditions of the given message are true
    /// @param message the message to verify
    function verify(
        Swap calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) public view {
        verifyRevocation(message.user, message.scriptId);
        verifySignature(message, r, s, v);
        verifyRepetitions(message.repetitions, message.scriptId);

        verifyFollow(message.follow, message.scriptId);
        verifyGasTank(message.user);
        verifyTip(message.tip, message.user);
        // the minimum amount in order to have the transfer going through.
        // if typeAmt==Absolute -> it's the amount in the message,
        // otherwise it's enough if the user has more than 0 in the wallet.
        uint256 minAmount = message.typeAmt == 0 ? message.amount - 1 : 0;
        verifyAllowance(message.user, message.tokenFrom, minAmount);
        require(
            ERC20(message.tokenFrom).balanceOf(message.user) > minAmount,
            "[SCRIPT_BALANCE][TMP]"
        );

        verifyFrequency(message.frequency, message.scriptId);
        verifyBalance(message.balance, message.user);
        verifyPrice(message.price);
    }

    /* ========== EXECUTION FUNCTIONS ========== */

    /// @notice executes the given message, if the verification step passes
    /// @param message the message to execute
    function execute(
        Swap calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) external {
        verify(message, r, s, v);
        lastExecutions[message.scriptId] = block.timestamp;
        repetitionsCount[message.scriptId] += 1;

        // step 0 get the tokens from the user
        IERC20 tokenFrom = IERC20(message.tokenFrom);
        uint256 amount = message.typeAmt == 0 // absolute type: just return the given amount
            ? message.amount // percentage type: the amount represents a percentage on 10000
            : (tokenFrom.balanceOf(message.user) * message.amount) / 10000;
        tokenFrom.transferFrom(message.user, address(this), amount);

        // step 1: get the path
        address[] memory path = new address[](2);
        path[0] = message.tokenFrom;
        path[1] = message.tokenTo;

        // step 2: grant allowance to the router if it has not been given yet
        if (!allowances[message.kontract][tokenFrom]) giveAllowance(tokenFrom, message.kontract);

        // step 3: swap
        IUniswapV2Router01(message.kontract).swapExactTokensForTokens(
            amount,
            0,
            path,
            message.user,
            block.timestamp + 600000 // 10 minutes
        );

        // step 4: reward executor
        gasTank.addReward(
            message.scriptId,
            GAS_LIMIT * gasPriceFeed.lastGasPrice(),
            message.tip,
            message.user,
            _msgSender()
        );
    }

    function giveAllowance(IERC20 _token, address _exchange) private {
        IERC20(_token).approve(_exchange, type(uint256).max);
        allowances[_exchange][_token] = true;
    }
}
