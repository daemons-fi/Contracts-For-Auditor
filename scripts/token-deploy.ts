import { getContracts } from "./shared";
import hre, { ethers } from "hardhat";
import { getContract, getContractAddress, updateContracts } from "./daemons-contracts";
import { initializeToken } from "./single-deployments/a7-initialize-token";

// TESTNETS
/**
 MUMBAI TESTNET
 chainId: 80001
 lzChainId: 10009,
 lzEndpoint: "0xf69186dfBa60DdB133E91E9A4B5673624293d8F8"
 */
/**
 FANTOM TESTNET
 chainId: 4002
 lzChainId: 10012,
 lzEndpoint: "0x7dcAD72640F835B0FA36EFD3D6d3ec902C7E5acf"
 */

async function deployDAEM() {
    const currentChain = hre.network.config.chainId;
    switch (currentChain) {
        // Testnets
        case 80001:
            return await deployDAEMOnMumbai();
        case 4002:
            return await deployDAEMOnFtmTestnet();
    }
}

async function deployDAEMOnMumbai() {
    console.log(`Deploying DAEM on MUMBAI TESTNET`);
    let currentContracts = await getContracts();
    const lzEndpoint = "0xf69186dfBa60DdB133E91E9A4B5673624293d8F8";

    // deploy BASE token
    const DAEMAddress = await deploy(lzEndpoint, true);
    currentContracts = updateContracts(currentContracts, "DaemonsToken", DAEMAddress);

    // Initialize
    await initializeToken(currentContracts);

    // add all the other tokens as trusted remotes
    const DAEM = await getContract(currentContracts, "DaemonsToken");
    await DAEM.setTrustedRemote(10012, "0x38b29255994a57Ce80E52d95301ed1A980A3c5f9"); // FTM Testnet
    console.log(`Trusted remotes set`);

    // verify
    const daemAddress = getContractAddress(currentContracts, "DaemonsToken");
    await verify(daemAddress, lzEndpoint);
}

async function deployDAEMOnFtmTestnet() {
    console.log(`Deploying DAEM on FANTOM TESTNET`);
    let currentContracts = await getContracts();
    const lzEndpoint = "0x7dcAD72640F835B0FA36EFD3D6d3ec902C7E5acf";

    // deploy PERIPHERY token
    const DAEMAddress = await deploy(lzEndpoint, false);
    currentContracts = updateContracts(currentContracts, "DaemonsToken", DAEMAddress);

    // add all the other tokens as trusted remotes
    const DAEM = await getContract(currentContracts, "DaemonsToken");
    await DAEM.setTrustedRemote(10009, "0xD29dC02B97640E57F1a90e5B4C105294c3b67406"); // MUMBAI Testnet
    console.log(`Trusted remotes set`);

    // verify
    const daemAddress = getContractAddress(currentContracts, "DaemonsToken");
    await verify(daemAddress, lzEndpoint);
}

/** SHARED FUNCTIONS */

async function deploy(lzEndpoint: string, isBaseToken: boolean) {
    console.log("Deploying DAEM token");
    const TokenContract = await ethers.getContractFactory(
        isBaseToken ? "DaemonsToken" : "DaemonsTokenPeriphery"
    );
    const DAEM = await TokenContract.deploy(lzEndpoint);
    await DAEM.deployed();
    console.log("DAEM deployed");
    return DAEM.address;
}

async function verify(daemAddress: string, lzEndpointAddress: string) {
    console.log("Verifying DAEM token");
    try {
        await hre.run("verify:verify", {
            address: daemAddress,
            constructorArguments: [lzEndpointAddress]
        });
        console.log(`DAEM token verified`);
    } catch (error) {
        console.log(`DAEM token VERIFICATION FAILED`);
        console.log(error);
        return;
    }
}

/** CALLER */

deployDAEM().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
