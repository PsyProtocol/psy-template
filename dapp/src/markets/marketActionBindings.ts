// Reviewed public ABI data only. No wallet, proof or financial credentials.
import book from "../../../market-client/reviewed/mainnet-beta-markets-20261027-v3/10-abi.json";
import curve from "../../../market-client/reviewed/mainnet-beta-markets-20261027-v3/11-abi.json";
import market from "../../../market-client/reviewed/mainnet-beta-markets-20261027-v3/12-abi.json";
import a from "../../../market-client/reviewed/mainnet-beta-markets-20261027-v3/10-asset-6-abi.json";
import b from "../../../market-client/reviewed/mainnet-beta-markets-20261027-v3/10-asset-7-abi.json";
import nft from "../../../market-client/reviewed/mainnet-beta-markets-20261027-v3/12-nft-abi.json";
export const marketActionAbis: Record<string, unknown> = {10:book,11:curve,12:market,6:a,7:b,8:nft};
