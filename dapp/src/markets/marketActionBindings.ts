// Reviewed public ABI data only. No wallet, proof or financial credentials.
import book from "../../../market-client/reviewed/staging-position-readers-20261027-v2/2497-abi.json";
import curve from "../../../market-client/reviewed/staging-position-readers-20261027-v2/2498-abi.json";
import market from "../../../market-client/reviewed/staging-position-readers-20261027-v2/2499-abi.json";
import a from "../../../market-client/reviewed/staging-position-readers-20261027-v2/2497-asset-2483-abi.json";
import b from "../../../market-client/reviewed/staging-position-readers-20261027-v2/2497-asset-2484-abi.json";
import nft from "../../../market-client/reviewed/staging-position-readers-20261027-v2/2499-nft-abi.json";
export const marketActionAbis: Record<string, unknown> = {
  2497: book,
  2498: curve,
  2499: market,
  2483: a,
  2484: b,
  2496: nft,
};
