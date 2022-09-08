import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyPassExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying Pass Executor");

    try {
        const executor = getContractAddress(contracts, "PassScriptExecutor");
        await hre.run("verify:verify", { address: executor });
    } catch (error) {
        console.log(`Pass Executor VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`Pass Executor verified`);
};
