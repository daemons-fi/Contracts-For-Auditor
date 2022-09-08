import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyBeefyExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying Beefy Executor");

    try {
        const executor = getContractAddress(contracts, "BeefyScriptExecutor");
        await hre.run("verify:verify", { address: executor });
    } catch (error) {
        console.log(`Beefy Executor VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`Beefy Executor verified`);
};
