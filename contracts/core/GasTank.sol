//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "../interfaces/IGasTank.sol";
import "../interfaces/ITreasury.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


/// @title GasTank Contract
/// @notice Contract in which the user will deposit ETH (to pay gas costs) and DAEM (to pay tips).
/// Executors will inform the GasTank each time a script is run and this will subtract the due amounts.
contract GasTank is IGasTank, Ownable {
    ITreasury public treasury;
    IERC20 internal DAEMToken;
    mapping(address => uint256) gasBalances;
    mapping(address => uint256) tipBalances;
    mapping(address => uint256) rewardFromGas;
    mapping(address => uint256) rewardFromTips;
    mapping(address => bool) executors;

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0));
        treasury = ITreasury(_treasury);
    }

    function setDAEMToken(address _token) external onlyOwner {
        require(_token != address(0));
        DAEMToken = IERC20(_token);
    }

    function addExecutor(address executor) external onlyOwner {
        executors[executor] = true;
    }

    function removeExecutor(address executor) external onlyOwner {
        executors[executor] = false;
    }

    /** Checks whether the contract is ready to operate */
    function preliminaryCheck() external view {
        require(address(treasury) != address(0), "Treasury");
        require(address(DAEMToken) != address(0), "DAEMToken");
    }

    /* ========== VIEWS ========== */

    /// @inheritdoc IGasTank
    function gasBalanceOf(address user) external view override returns (uint256) {
        return gasBalances[user];
    }

    /// @inheritdoc IGasTank
    function tipBalanceOf(address user) external view override returns (uint256) {
        return tipBalances[user];
    }

    /// @inheritdoc IGasTank
    function claimable(address user) external view override returns (uint256) {
        uint256 dueFromGas = rewardFromGas[user];
        uint256 dueFromTips = rewardFromTips[user];

        uint256 gasConvertedToDAEM = dueFromGas > 0 ? treasury.ethToDAEM(dueFromGas) : 0;
        uint256 tipsMinusTaxes = (dueFromTips * treasury.TIPS_AFTER_TAXES_PERCENTAGE()) / 10000;

        return gasConvertedToDAEM + tipsMinusTaxes;
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    /// @inheritdoc IGasTank
    function depositGas() external payable override {
        gasBalances[msg.sender] = gasBalances[msg.sender] + msg.value;
    }

    /// @inheritdoc IGasTank
    function withdrawGas(uint256 amount) external override {
        require(gasBalances[msg.sender] >= amount);
        gasBalances[msg.sender] = gasBalances[msg.sender] - amount;
        payable(msg.sender).transfer(amount);
    }

    /// @inheritdoc IGasTank
    function withdrawAllGas() external override {
        uint256 amount = gasBalances[msg.sender];
        gasBalances[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
    }

    /// @inheritdoc IGasTank
    function depositTip(uint256 amount) external override {
        require(amount > 0, "Cannot deposit 0");
        DAEMToken.transferFrom(msg.sender, address(this), amount);
        tipBalances[msg.sender] += amount;
    }

    /// @inheritdoc IGasTank
    function withdrawTip(uint256 amount) external override {
        require(amount > 0, "Cannot withdraw 0");
        require(tipBalances[msg.sender] >= amount, "Insufficient tip balance");
        tipBalances[msg.sender] -= amount;
        DAEMToken.transfer(msg.sender, amount);
    }

    /// @inheritdoc IGasTank
    function withdrawAllTip() external override {
        require(tipBalances[msg.sender] >= 0, "Insufficient tip balance");
        DAEMToken.transfer(msg.sender, tipBalances[msg.sender]);
        tipBalances[msg.sender] = 0;
    }

    /// @inheritdoc IGasTank
    function addReward(
        bytes32 scriptId,
        uint256 ethAmount,
        uint256 tipAmount,
        address user,
        address executor
    ) external override {
        require(executors[_msgSender()], "Unauthorized. Only Executors");
        gasBalances[user] -= ethAmount;
        rewardFromGas[executor] += ethAmount;

        if (tipAmount > 0) {
            // if any tip is specified, we immediately send the funds to the treasury
            // and we increase the tips balance of the executor. The treasury will
            // apply the tax itself.
            tipBalances[user] -= tipAmount;
            rewardFromTips[executor] += tipAmount;
            DAEMToken.transferFrom(user, address(treasury), tipAmount);
        }

        emit ScriptExecuted(scriptId, user, executor);
    }

    /// @inheritdoc IGasTank
    function claimReward() external override {
        uint256 dueFromGas = rewardFromGas[msg.sender];
        require(dueFromGas > 0, "Nothing to claim");
        uint256 dueFromTips = rewardFromTips[msg.sender];

        rewardFromGas[msg.sender] = 0;
        rewardFromTips[msg.sender] = 0;
        treasury.requestPayout{value: dueFromGas}(msg.sender, dueFromTips);
    }

    /// @inheritdoc IGasTank
    function claimAndStakeReward() external override {
        uint256 dueFromGas = rewardFromGas[msg.sender];
        require(dueFromGas > 0, "Nothing to claim");
        uint256 dueFromTips = rewardFromTips[msg.sender];

        rewardFromGas[msg.sender] = 0;
        rewardFromTips[msg.sender] = 0;
        treasury.stakePayout{value: dueFromGas}(msg.sender, dueFromTips);
    }
}
