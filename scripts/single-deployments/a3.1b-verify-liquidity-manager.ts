import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyLiquidityManager = async (
    contracts: DaemonsContracts
): Promise<void> => {
    console.log("Verifying LiquidityManager");

    try {
        const routerAddress = getContractAddress(contracts, "IUniswapV2Router01");
        const tokenAddress = getContractAddress(contracts, "DaemonsToken");
        const address = getContractAddress(contracts, "ILiquidityManager");
        await hre.run("verify:verify", {
            address: address,
            constructorArguments: [tokenAddress, routerAddress]
        });
    } catch (error) {
        console.log(`Treasury VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`LiquidityManager verified`);
};
