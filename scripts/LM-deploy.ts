import { contracts, getContract, getContractAddress, printContracts } from "./daemons-contracts";
import { deployInfoFetcher } from "./utils-deployment/a1-info-fetcher";
import { verifyInfoFetcher } from "./utils-deployment/a1b-verify-info-fetcher";
import { deployUniswapV2LiquidityManager } from "./single-deployments/a3.1-uniswap-liquidity-manager";
import { verifyLiquidityManager } from "./single-deployments/a3.1b-verify-liquidity-manager";
import { getContracts } from "./shared";


async function deployDaemons() {
    let currentContracts = await getContracts()

    // deploy and swap LM
    currentContracts = await deployUniswapV2LiquidityManager(currentContracts);
    const LP = getContractAddress(currentContracts, "wethDaemLp");
    const LM = await getContract(currentContracts, "ILiquidityManager");
    const treasury = await getContract(currentContracts, "Treasury");
    await LM.setPolLP(LP);
    await treasury.setLiquidityManager(LM.address);
    // await verifyLiquidityManager(currentContracts);
}

deployDaemons().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
