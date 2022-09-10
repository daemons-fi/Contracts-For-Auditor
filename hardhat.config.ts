import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";

require("dotenv").config();
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not defined!");

const config: HardhatUserConfig = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {},
        kovan_testnet: {
            url: process.env.KOVAN_RPC!,
            chainId: 42,
            accounts: [PRIVATE_KEY]
        },
        ftm_testnet: {
            url: process.env.FANTOM_TESTNET_RPC!,
            chainId: 4002,
            accounts: [PRIVATE_KEY]
        },
        mumbai_testnet: {
            url: process.env.MUMBAI_RPC!,
            chainId: 80001,
            accounts: [PRIVATE_KEY]
        }
    },
    solidity: {
        version: "0.8.9",
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000
            }
        }
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    },
    etherscan: {
        // To list all supported networks:
        // npx hardhat verify --list-networks
        apiKey: {
            mainnet: process.env.ETH_ETHERSCAN_KEY!,
            kovan: process.env.ETH_ETHERSCAN_KEY!,
            arbitrumOne: process.env.ARBITRUM_ETHERSCAN_KEY!,
            polygonMumbai: process.env.MUMBAI_ETHERSCAN_KEY!,
            fantom: process.env.FANTOM_ETHERSCAN_KEY!,
            ftmTestnet: process.env.FANTOM_ETHERSCAN_KEY!
        }
    },
    mocha: {
        timeout: 30000
    }
};

export default config;
