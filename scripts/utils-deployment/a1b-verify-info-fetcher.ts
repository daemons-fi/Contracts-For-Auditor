import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifyInfoFetcher = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying InfoFetcher");

    try {
        const address = getContractAddress(contracts, "InfoFetcher");
        await hre.run("verify:verify", { address: address });
    } catch (error) {
        console.log(`InfoFetcher VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`InfoFetcher verified`);
};
