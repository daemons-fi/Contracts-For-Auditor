// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../utils/AllowedExecutors.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@layerzerolabs/solidity-examples/contracts/token/oft/extension/GlobalCappedOFT.sol";
import "@layerzerolabs/solidity-examples/contracts/token/oft/OFT.sol";

/// @title Daemons Token (Base)
/// @notice Contracts representing DAEM tokens in the base chain.
/// Whenever tokens are transferred away from this chain, they are locked in this contract and minted
/// at the destination. Whenever tokens are sent back, they are burned at the source and unlocked on the base chain.
contract DaemonsToken is Ownable, GlobalCappedOFT, AllowedExecutors {
    uint256 public constant MAX_SUPPLY = 1e9 * 1e18; // 1 Billion

    /// @notice Instantiates a new DAEM token on the base chain.
    constructor(address _lzEndpoint) GlobalCappedOFT("Daemons", "DAEM", MAX_SUPPLY, _lzEndpoint) {}

    /// @notice Mint the whole supply of tokens.
    /// @dev A part will go to the owner, that will deposit it in the vesting contract,
    /// the remaining part will go to the treasury, that will slowly release to the public.
    function initialize(address _treasury) public onlyOwner {
        require(totalSupply() == 0, "Can only initialize once");
        require(_treasury != address(0), "Invalid treasury address");

        uint256 distributionAmount = (MAX_SUPPLY * 75) / 100;
        _mint(_treasury, distributionAmount);

        uint256 vestingAmount = (MAX_SUPPLY * 25) / 100;
        _mint(_msgSender(), vestingAmount);
    }

    /// @notice Send DAEM token across chains.
    /// @dev simply adds the modifier to only allow the contract owner or the
    /// allowed executors (from `AllowedExecutors`) to call this function.
    function sendFrom(
        address _from,
        uint16 _dstChainId,
        bytes memory _toAddress,
        uint256 _amount,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes memory _adapterParams
    ) public payable virtual override onlyOwnerOrAllowedExecutors {
        (uint256 fee, ) = estimateSendFee(_dstChainId, _toAddress, _amount, false, _adapterParams);
        require(msg.value >= fee, "Not enough to cover fee");

        _send(
            _from,
            _dstChainId,
            _toAddress,
            _amount,
            _refundAddress,
            _zroPaymentAddress,
            _adapterParams
        );
    }
}

/// @title Daemons Token (Periphery)
/// @notice Contracts representing DAEM tokens in all chains that are not the base one.
/// Whenever tokens are transferred to this chain, they are minted to the destination address.
/// Whenever tokens are sent away from this chain, they are burned.
contract DaemonsTokenPeriphery is Ownable, OFT, AllowedExecutors {
    uint256 public constant MAX_SUPPLY = 1e9 * 1e18; // 1 Billion

    /// @notice Instantiates a new DAEM token on a chain different from the base one.
    constructor(address _lzEndpoint) OFT("Daemons", "DAEM", _lzEndpoint) {}

    /// @notice Send DAEM token across chains.
    /// @dev simply adds the modifier to only allow the contract owner or the
    /// allowed executors (from `AllowedExecutors`) to call this function.
    function sendFrom(
        address _from,
        uint16 _dstChainId,
        bytes memory _toAddress,
        uint256 _amount,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes memory _adapterParams
    ) public payable virtual override onlyOwnerOrAllowedExecutors {
        (uint256 fee, ) = estimateSendFee(_dstChainId, _toAddress, _amount, false, _adapterParams);
        require(msg.value >= fee, "Not enough to cover fee");

        _send(
            _from,
            _dstChainId,
            _toAddress,
            _amount,
            _refundAddress,
            _zroPaymentAddress,
            _adapterParams
        );
    }
}
