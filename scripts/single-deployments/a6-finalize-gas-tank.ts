import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const finalizeGasTank = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Finalizing GasTank");

    const gasTank = await getContract(contracts, "GasTank");
    const treasuryAddress = getContractAddress(contracts, "Treasury");
    const tokenAddress = getContractAddress(contracts, "DaemonsToken");
    let tx = await gasTank.setTreasury(treasuryAddress);
    await tx.wait();
    tx = await gasTank.setDAEMToken(tokenAddress);
    await tx.wait();

    await gasTank.preliminaryCheck();

    console.log(`GasTank finalized`);
};
