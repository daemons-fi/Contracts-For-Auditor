//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../interfaces/ITreasury.sol";
import "../interfaces/ILiquidityManager.sol";
import "../utils/WithOperators.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@layerzerolabs/solidity-examples/contracts/token/oft/OFT.sol";

/// @title Treasury Contract
/// @notice Contract taking care of:
/// - rewarding users for the executions of scripts
/// - taking care of rewards distributions to users that staked DAEM
/// - holds the commissions money, until it's withdrawn by the owner
/// - buy and hold the DAEM-ETH LP
contract Treasury is ITreasury, Ownable, WithOperators {
    IERC20 private token;
    address private gasTank;
    ILiquidityManager private liquidityManager;

    uint16 public PERCENTAGE_COMMISSION = 100;
    uint16 public PERCENTAGE_POL = 4900;
    // the remaining percentage will be redistributed

    uint16 public PERCENTAGE_POL_TO_ENABLE_BUYBACK = 1000;

    uint16 public override TIPS_AFTER_TAXES_PERCENTAGE = 8000;

    uint256 public redistributionPool;
    uint256 public commissionsPool;
    uint256 public polPool;

    // staking vars
    uint256 public redistributionInterval = 180 days;
    uint256 public stakedAmount;
    uint256 public distributed;
    uint256 private lastUpdateTime;
    uint256 private rewardPerTokenStored;
    mapping(address => uint256) private balances;
    mapping(address => uint256) private userRewardPerTokenPaid;
    mapping(address => uint256) private rewards;

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _token,
        address _gasTank,
        address _liquidityManager
    ) {
        require(_token != address(0));
        token = IERC20(_token);
        gasTank = _gasTank;
        liquidityManager = ILiquidityManager(_liquidityManager);
        token.approve(_liquidityManager, type(uint256).max);
    }

    /* ========== VIEWS STAKING ========== */

    /// @inheritdoc ITreasury
    function tokensForDistribution() external view override returns (uint256) {
        return token.balanceOf(address(this)) - stakedAmount;
    }

    /// @notice The staked balance of a user
    /// @param user the user that should be checked
    function balanceOf(address user) external view returns (uint256) {
        return balances[user];
    }

    /// @notice The amount of DAEM earned by a user
    /// @param user the user that should be checked
    function earned(address user) public view returns (uint256) {
        return
            ((balances[user] * (rewardPerToken() - userRewardPerTokenPaid[user])) / 1e18) +
            rewards[user];
    }

    function rewardPerToken() private view returns (uint256) {
        if (stakedAmount == 0) return 0;
        return
            rewardPerTokenStored +
            (((block.timestamp - lastUpdateTime) * getRewardRate() * 1e18) / stakedAmount);
    }

    /// @notice Number of ETH that will be distributed each second
    /// @dev This depends on the amount in the redistributionPool and
    /// the time we intend to distribute this amount in.
    function getRewardRate() public view returns (uint256) {
        return redistributionPool / redistributionInterval;
    }

    /* ========== OTHER VIEWS ========== */

    /// @inheritdoc ITreasury
    function ethToDAEM(uint256 ethAmount) public view override returns (uint256) {
        return liquidityManager.ETHToDAEM(ethAmount);
    }

    /// @notice defines whether the daily treasury operation should buy back DAEM or fund the LP
    /// @dev returns true if the treasury-owned LP contains less than
    /// PERCENTAGE_POL_TO_ENABLE_BUYBACK of the total supply of DAEM on this chain.
    function shouldFundLP() public view returns (bool) {
        require(address(liquidityManager) != address(0), "LiquidityManager not set");
        return
            liquidityManager.percentageOfDAEMInLP(address(this)) < PERCENTAGE_POL_TO_ENABLE_BUYBACK;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// @notice Stake a certain amount of DAEM tokens in the treasury
    /// @param amount the amount of tokens to stake
    function stake(uint256 amount) external updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        token.transferFrom(msg.sender, address(this), amount);
        stakedAmount += amount;
        balances[msg.sender] += amount;
    }

    function stakeFor(address user, uint256 amount) private {
        require(amount > 0, "Cannot stake 0");
        // no need to move funds as the tokens are already in the treasury
        stakedAmount += amount;
        balances[user] += amount;
    }

    /// @notice Withdraw a certain amount of DAEM tokens from the treasury
    /// @param amount the amount of tokens to withdraw
    function withdraw(uint256 amount) public updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        require(balances[msg.sender] >= amount, "Insufficient staked funds");
        require(stakedAmount > amount, "Cannot withdraw all funds");
        stakedAmount -= amount;
        balances[msg.sender] -= amount;
        token.transfer(msg.sender, amount);
    }

    /// @notice Claims the earned ETH
    function getReward() public updateReward(msg.sender) {
        require(rewards[msg.sender] > 0, "Nothing to claim");
        uint256 reward = rewards[msg.sender];
        rewards[msg.sender] = 0;
        payable(msg.sender).transfer(reward);
        distributed = distributed + reward;
    }

    /// @notice Claims the earned DAEM tokens
    /// @param amountOutMin the minimum amount of DAEM token that should be received in the swap
    function compoundReward(uint256 amountOutMin) public updateReward(msg.sender) {
        require(rewards[msg.sender] > 0, "Nothing to claim");
        uint256 reward = rewards[msg.sender];
        rewards[msg.sender] = 0;

        uint256 swappedAmount = liquidityManager.swapETHforDAEM{value: reward}(
            amountOutMin,
            address(this),
            block.timestamp
        );

        stakeFor(msg.sender, swappedAmount);
        distributed = distributed + reward;
    }

    /// @notice Withdraw all staked DAEM tokens and claim the due ETH reward
    function exit() external {
        getReward();
        withdraw(balances[msg.sender]);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    /// @notice Set the address of a new GasTank
    /// @param _gasTank the new GasTank address
    function setGasTank(address _gasTank) external onlyOwner {
        require(address(_gasTank) != address(0), "Invalid address");
        gasTank = _gasTank;
    }

    /// @notice Set the address of a new LiquidityManager
    /// @param _liquidityManager the new LiquidityManager address
    function setLiquidityManager(address _liquidityManager) external onlyOwner {
        require(address(_liquidityManager) != address(0), "Invalid address");
        token.approve(address(liquidityManager), 0);
        liquidityManager = ILiquidityManager(_liquidityManager);
        token.approve(address(liquidityManager), type(uint256).max);
    }

    /// @notice Checks whether the contract is ready to operate
    function preliminaryCheck() external view {
        require(address(gasTank) != address(0), "GasTank");
        require(token.balanceOf(address(this)) > 0, "Treasury is empty");
        require(address(liquidityManager) != address(0), "LiquidityManager not set");

        uint256 lMAllowance = token.allowance(address(this), address(liquidityManager));
        require(lMAllowance > 0, "LiquidityManager needs allowance to operate");
    }

    /// @notice Set the commission percentage value
    /// @dev this value can be at most 5%
    /// @param value the new commission percentage
    function setCommissionPercentage(uint16 value) external onlyOwner {
        require(value <= 500, "Commission must be at most 5%");
        PERCENTAGE_COMMISSION = value;
    }

    /// @notice Set the PoL percentage value
    /// @dev this value can be at most 50% and at least 5%
    /// @param value the new PoL percentage
    function setPolPercentage(uint16 value) external onlyOwner {
        require(value >= 500, "POL must be at least 5%");
        require(value <= 5000, "POL must be at most 50%");
        PERCENTAGE_POL = value;
    }

    /// @notice Defines how fast the ETH in the redistribution pool will be given out to DAEM stakers
    /// @dev this value must be between 30 and 730 days
    /// @param newInterval the new PoL percentage
    function setRedistributionInterval(uint256 newInterval) external onlyOwner {
        require(newInterval >= 30 days, "RI must be at least 30 days");
        require(newInterval <= 730 days, "RI must be at most 730 days");
        redistributionInterval = newInterval;
    }

    /// @notice Defines the threshold that will cause buybacks instead of LP funding
    /// @dev this value must be between 2.5% and 60%
    /// @param value the new percentage threshold
    function setPercentageToEnableBuyback(uint16 value) external onlyOwner {
        require(value >= 250, "POL must be at least 2.5%");
        require(value <= 6000, "POL must be at most 60%");
        PERCENTAGE_POL_TO_ENABLE_BUYBACK = value;
    }

    /// @notice Adds funds to the Protocol-owned-Liquidity LP
    /// @dev Funds in the PoL pool will be used. 50% of it to buyback DAEM and then funding the LP.
    /// @param amountOutMin the minimum amount of DAEM tokens to receive during buyback
    function fundLP(uint256 amountOutMin) external onlyOwnerOrOperators {
        require(shouldFundLP(), "Funding forbidden. Should buyback");
        // First we buy back some DAEM at market price using half of the polPool
        uint256 amountToSwap = polPool / 2;
        liquidityManager.swapETHforDAEM{value: amountToSwap}(
            amountOutMin,
            address(this),
            block.timestamp
        );
        polPool -= amountToSwap;

        // we send all the polPool ETH to the LP + an abundant amount of DAEM
        // the reminder will be sent back
        uint256 amountDAEM = liquidityManager.ETHToDAEM(polPool);
        liquidityManager.addLiquidityETH{value: polPool}(
            (amountDAEM * 110) / 100,
            address(this),
            block.timestamp
        );
        polPool = 0;
    }

    /// @notice Buybacks DAEM tokens using the PoL funds and keeps them in the treasury
    /// @dev 100% of funds in the PoL pool will be used to buyback DAEM.
    /// @param amountOutMin the minimum amount of DAEM tokens to receive during buyback
    function buybackDAEM(uint256 amountOutMin) external onlyOwnerOrOperators {
        require(!shouldFundLP(), "Buyback forbidden. Should fund");
        // We buy back some DAEM at market price using all the polPool
        liquidityManager.swapETHforDAEM{value: polPool}(
            amountOutMin,
            address(this),
            block.timestamp
        );

        polPool = 0;
    }

    /// @notice Claims the commissions and send them to the contract owner wallet
    function claimCommission() external onlyOwnerOrOperators {
        uint256 amount = commissionsPool;
        commissionsPool = 0;
        payable(_msgSender()).transfer(amount);
    }

    /// @notice Send a specified amount of DAEM tokens to a treasury on another chain
    /// @param lzChainId the LayerZero chain identifier of the chain we are targeting
    /// @param amount the amount of DAEM tokens to send to the treasury on the target chain
    /// @param _adapterParams extra information that might be needed by LayerZero
    function sendDAEMToTreasuryOnOtherChain(
        uint16 lzChainId,
        bytes calldata treasuryAddress,
        uint256 amount,
        bytes memory _adapterParams
    ) external payable onlyOwner {
        OFT DAEM = OFT(address(token));
        (uint256 fee, ) = DAEM.estimateSendFee(
            lzChainId,
            treasuryAddress,
            amount,
            false,
            _adapterParams
        );
        require(msg.value >= fee, "Fee not covered");

        DAEM.sendFrom{value: msg.value}(
            address(this),
            lzChainId,
            treasuryAddress,
            amount,
            payable(msg.sender),
            msg.sender,
            _adapterParams
        );
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    /// @inheritdoc ITreasury
    function requestPayout(address user, uint256 dueFromTips) external payable override {
        require(gasTank == _msgSender(), "Unauthorized. Only GasTank");
        uint256 payoutFromGas = calculatePayout();
        uint256 payoutFromTips = (dueFromTips * TIPS_AFTER_TAXES_PERCENTAGE) / 10000;
        token.transfer(user, payoutFromGas + payoutFromTips);
    }

    /// @inheritdoc ITreasury
    function stakePayout(address user, uint256 dueFromTips)
        external
        payable
        override
        updateReward(user)
    {
        require(gasTank == _msgSender(), "Unauthorized. Only GasTank");
        uint256 payoutFromGas = calculatePayout();
        uint256 payoutFromTips = (dueFromTips * TIPS_AFTER_TAXES_PERCENTAGE) / 10000;
        stakeFor(user, payoutFromGas + payoutFromTips);
    }

    /* ========== PRIVATE FUNCTIONS ========== */

    function calculatePayout() private returns (uint256) {
        // split funds
        commissionsPool += (msg.value * PERCENTAGE_COMMISSION) / 10000;
        polPool += (msg.value * PERCENTAGE_POL) / 10000;
        redistributionPool +=
            (msg.value * (10000 - PERCENTAGE_COMMISSION - PERCENTAGE_POL)) /
            10000;

        // calculate payout
        return liquidityManager.ETHToDAEM(msg.value);
    }

    /* ========== MODIFIERS ========== */

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;

        rewards[account] = earned(account);
        userRewardPerTokenPaid[account] = rewardPerTokenStored;
        _;
    }
}
