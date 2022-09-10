import { ethers } from "hardhat";
import { deployGasTank } from "./single-deployments/a2-gas-tank";
import { deployTreasury } from "./single-deployments/a3.2-treasury";
import { deployVesting } from "./single-deployments/a4-vesting";
import { deployGasPriceFeed } from "./single-deployments/a5-gas-price-feed";
import { finalizeGasTank } from "./single-deployments/a6-finalize-gas-tank";
import { deploySwapperExecutor } from "./single-deployments/b1-swapper-executor";
import { initializeSwapperExecutor } from "./single-deployments/b2-initialize-swapper-executor";
import { registerSwapperExecutor } from "./single-deployments/b3-register-swapper-in-gas-tank";
import { deployTransferExecutor } from "./single-deployments/c1-transfer-executor";
import { initializeTransferExecutor } from "./single-deployments/c2-initialize-transfer-executor";
import { registerTransferExecutor } from "./single-deployments/c3-register-transfer-in-gas-tank";
import { registerMmBaseExecutor } from "./single-deployments/d3-register-mmbase-in-gas-tank";
import { initializeMmBaseExecutor } from "./single-deployments/d2-initialize-mmbase-executor";
import { deployMmBaseExecutor } from "./single-deployments/d1-mmbase-executor";
import { registerMmAdvancedExecutor } from "./single-deployments/e3-register-mmadvanced-in-gas-tank";
import { initializeMmAdvancedExecutor } from "./single-deployments/e2-initialize-mmadvanced-executor";
import { deployMmAdvancedExecutor } from "./single-deployments/e1-mmadvanced-executor";
import { vestTokens } from "./single-deployments/a10-vesting";
import { createLP } from "./single-deployments/a8-create-LP";
import { deployZapOutExecutor } from "./single-deployments/g1-zapout-executor";
import { initializeZapOutExecutor } from "./single-deployments/g2-initialize-zapout-executor";
import { registerZapOutExecutor } from "./single-deployments/g3-register-zapout-in-gas-tank";
import { registerZapInExecutor } from "./single-deployments/f3-register-zapin-in-gas-tank";
import { initializeZapInExecutor } from "./single-deployments/f2-initialize-zapin-executor";
import { deployZapInExecutor } from "./single-deployments/f1-zapin-executor";
import { deployBeefyExecutor } from "./single-deployments/h1-beefy-executor";
import { initializeBeefyExecutor } from "./single-deployments/h2-initialize-beefy-executor";
import { registerBeefyExecutor } from "./single-deployments/h3-register-beefy-in-gas-tank";
import { retrieveLPAddress } from "./single-deployments/a9-retrieve-LP-address";
import { deployPassExecutor } from "./single-deployments/i1-pass-executor";
import { verifyPassExecutor } from "./single-deployments/i1b-verify-pass-executor";
import { initializePassExecutor } from "./single-deployments/i2-initialize-pass-executor";
import { registerPassExecutor } from "./single-deployments/i3-register-pass-in-gas-tank";
import { verifyDaemToken } from "./single-deployments/a1b-verify-daem-token";
import { verifyGasTank } from "./single-deployments/a2b-verify-gas-tank";
import { verifyTreasury } from "./single-deployments/a3b-verify-treasury";
import { verifyGasPriceFeed } from "./single-deployments/a5b-verify-gas-price-feed";
import { verifyBeefyExecutor } from "./single-deployments/h1b-verify-beefy-executor";
import { verifyZapOutExecutor } from "./single-deployments/g1b-verify-zapout-executor";
import { verifyZapInExecutor } from "./single-deployments/f1b-verify-zapin-executor";
import { verifyMmAdvancedExecutor } from "./single-deployments/e1b-verify-mmadvanced-executor";
import { verifyMmBaseExecutor } from "./single-deployments/d1b-verify-mmbase-executor";
import { verifyTransferExecutor } from "./single-deployments/c1b-verify-transfer-executor";
import { verifySwapperExecutor } from "./single-deployments/b1b-verify-swapper-executor";
import { deployUniswapV2LiquidityManager } from "./single-deployments/a3.1-uniswap-liquidity-manager";
import { verifyVesting } from "./single-deployments/a4b-verify-vesting";
import { verifyLiquidityManager } from "./single-deployments/a3.1b-verify-liquidity-manager";
import { getContracts } from "./shared";
import { initializeToken } from "./single-deployments/a7-initialize-token";

async function deployDaemons() {
    let currentContracts = await getContracts()

    const oneMonth = () => 60 * 60 * 24 * 30;
    const now = () => Math.floor(new Date().getTime() / 1000);
    const vestingStart = now() + oneMonth(); // vesting starts one month from today
    const vestingDuration = oneMonth() * 48; // vesting lasts 4 years

    // NOTE:
    // DAEM token should already have been deployed and initialized.

    // deploy side contracts
    currentContracts = await deployGasTank(currentContracts);
    currentContracts = await deployGasPriceFeed(currentContracts);
    currentContracts = await deployVesting(currentContracts, vestingStart, vestingDuration);
    currentContracts = await deployUniswapV2LiquidityManager(currentContracts);
    currentContracts = await deployTreasury(currentContracts);
    await finalizeGasTank(currentContracts);

    // Initialize & vest
    /** NOTE: only to be called on BASE chains! */
    // await initializeToken(currentContracts);
    //await vestTokens(currentContracts, owner);

    /** NOTE: LP proportions must be manually set!! */
    const amountETH = ethers.utils.parseEther("0.1");
    const amountDAEM = ethers.utils.parseEther("150");
    await createLP(currentContracts, amountETH, amountDAEM);
    currentContracts = await retrieveLPAddress(currentContracts);

    // verify side contracts
    await verifyGasTank(currentContracts);
    await verifyLiquidityManager(currentContracts);
    await verifyTreasury(currentContracts);
    await verifyGasPriceFeed(currentContracts);
    await verifyVesting(currentContracts, vestingStart, vestingDuration);

    // deploy swapper executor
    currentContracts = await deploySwapperExecutor(currentContracts);
    await initializeSwapperExecutor(currentContracts);
    await registerSwapperExecutor(currentContracts);

    // deploy transfer executor
    currentContracts = await deployTransferExecutor(currentContracts);
    await initializeTransferExecutor(currentContracts);
    await registerTransferExecutor(currentContracts);

    // deploy mmBase executor
    currentContracts = await deployMmBaseExecutor(currentContracts);
    await initializeMmBaseExecutor(currentContracts);
    await registerMmBaseExecutor(currentContracts);

    // deploy MmAdvanced executor
    currentContracts = await deployMmAdvancedExecutor(currentContracts);
    await initializeMmAdvancedExecutor(currentContracts);
    await registerMmAdvancedExecutor(currentContracts);

    // deploy ZapIn executor
    currentContracts = await deployZapInExecutor(currentContracts);
    await initializeZapInExecutor(currentContracts);
    await registerZapInExecutor(currentContracts);

    // deploy ZapOut executor
    currentContracts = await deployZapOutExecutor(currentContracts);
    await initializeZapOutExecutor(currentContracts);
    await registerZapOutExecutor(currentContracts);

    // deploy Beefy executor
    currentContracts = await deployBeefyExecutor(currentContracts);
    await initializeBeefyExecutor(currentContracts);
    await registerBeefyExecutor(currentContracts);

    // deploy Pass executor
    currentContracts = await deployPassExecutor(currentContracts);
    await initializePassExecutor(currentContracts);
    await registerPassExecutor(currentContracts);

    // verify executors
    // await verifySwapperExecutor(currentContracts);
    // await verifyTransferExecutor(currentContracts);
    // await verifyMmBaseExecutor(currentContracts);
    // await verifyMmAdvancedExecutor(currentContracts);
    // await verifyZapInExecutor(currentContracts);
    // await verifyZapOutExecutor(currentContracts);
    // await verifyBeefyExecutor(currentContracts);
    // await verifyPassExecutor(currentContracts);
}

deployDaemons().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
