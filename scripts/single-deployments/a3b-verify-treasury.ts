import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyTreasury = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying Treasury");

    try {
        const routerAddress = getContractAddress(contracts, "IUniswapV2Router01");
        const tokenAddress = getContractAddress(contracts, "DaemonsToken");
        const gasTankAddress = getContractAddress(contracts, "GasTank");
        const address = getContractAddress(contracts, "Treasury");
        await hre.run("verify:verify", {
            address: address,
            constructorArguments: [tokenAddress, gasTankAddress, routerAddress]
        });
    } catch (error) {
        console.log(`Treasury VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`Treasury verified`);
};
