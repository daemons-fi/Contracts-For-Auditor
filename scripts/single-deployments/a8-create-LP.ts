import { BigNumber } from "ethers";
import { DaemonsContracts, getContract } from "../daemons-contracts";

export const createLP = async (
    contracts: DaemonsContracts,
    amountETH: BigNumber,
    amountDAEM: BigNumber
): Promise<void> => {
    const treasury = await getContract(contracts, "Treasury");
    await treasury.preliminaryCheck();

    const token = await getContract(contracts, "DaemonsToken");
    const liquidityManager = await getContract(contracts, "ILiquidityManager");

    console.log(`Approving LiquidityManager for ${amountDAEM.toString()} DAEM`);
    await(await token.approve(liquidityManager.address, amountDAEM)).wait();

    console.log("Creating LP");
    let tx = await liquidityManager.createLP(amountDAEM, treasury.address, { value: amountETH });
    await tx.wait();
    console.log(`LP created`);
};
