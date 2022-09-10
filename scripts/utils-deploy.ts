import { deployInfoFetcher } from "./utils-deployment/a1-info-fetcher";
import { verifyInfoFetcher } from "./utils-deployment/a1b-verify-info-fetcher";
import { getContracts } from "./shared";


async function deployDaemons() {
    let currentContracts = await getContracts()

    // deploy utils
    currentContracts = await deployInfoFetcher(currentContracts);
    await verifyInfoFetcher(currentContracts);
}

deployDaemons().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
