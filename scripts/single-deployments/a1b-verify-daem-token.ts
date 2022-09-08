import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyDaemToken = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying DAEM token");

    try {
        const address = getContractAddress(contracts, "DaemonsToken");
        await hre.run("verify:verify", { address: address });
    } catch (error) {
        console.log(`DAEM token VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`DAEM token verified`);
};
