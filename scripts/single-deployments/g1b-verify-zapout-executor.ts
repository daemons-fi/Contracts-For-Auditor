import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyZapOutExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying ZapOut Executor");

    try {
        const executor = getContractAddress(contracts, "ZapOutScriptExecutor");
        await hre.run("verify:verify", { address: executor });
    } catch (error) {
        console.log(`ZapOut Executor VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`ZapOut Executor verified`);
};
