import { DaemonsContracts, getContract, updateContracts } from "../daemons-contracts";

export const retrieveLPAddress = async (contracts: DaemonsContracts): Promise<DaemonsContracts> => {
    console.log(`Retrieving LP address`);
    const liquidityManager = await getContract(contracts, "ILiquidityManager");
    const LPaddress = await liquidityManager.polLp();
    return updateContracts(contracts, "wethDaemLp", LPaddress);
};
