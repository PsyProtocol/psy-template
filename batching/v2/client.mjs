import{nativeName}from'../mainnet-beta/native.mjs';
// Ordinary user wallet calls. Serialize with losslessJson; the wallet adds its
// own automatic fee. These are not signed by the public vault SD-key.
import {call,encodeAmount,integer,user,losslessJson,FEE_ESCROW} from '../../amm/u124/client.mjs';
export {losslessJson};
const native=(recipient,amount,profile)=>({contract_id:0n,method_name:nativeName(profile,'transfer'),inputs:[recipient,amount]});
export function sponsorCalls({marketId,abi,vaultId,nonce,purpose=1n,amount=2n*FEE_ESCROW,nativeProtocol='legacy-v1'}){for(const n of[marketId,vaultId])user(n);integer(nonce,(1n<<62n)-1n);if(![1n,2n].includes(purpose)||amount<FEE_ESCROW||amount>2n*FEE_ESCROW||(purpose===1n&&amount!==2n*FEE_ESCROW))throw Error('sponsorship purpose or budget');return [call(marketId,abi,'authorize_sponsor',[vaultId,amount,nonce,purpose]),native(vaultId,amount,nativeProtocol)];}
export function activationFunding({market,config,tokenAbi,vaultId,nativeProtocol='legacy-v1'}){user(vaultId);const assets=market==='nftmarket'?[config.tokenId]:[config.assetA,config.assetB];return [native(vaultId,FEE_ESCROW,nativeProtocol),...assets.map(id=>call(BigInt(id),tokenAbi,'transfer',[vaultId,encodeAmount(1n)]))];}
export function nftBuyCalls({marketId,marketAbi,config,nftAbi,tokenAbi,vaultId,seller,listingNonce,price,deadline,nonce,nativeProtocol='legacy-v1'}){for(const n of[marketId,vaultId,seller])user(n);if(price<=0n)throw Error('positive NFT price');
 return [call(BigInt(config.nftId),nftAbi,'acknowledge',[vaultId]),call(marketId,marketAbi,'open_buy',[vaultId,seller,listingNonce,encodeAmount(price),deadline,nonce]),native(vaultId,FEE_ESCROW,nativeProtocol),call(BigInt(config.tokenId),tokenAbi,'transfer',[vaultId,encodeAmount(price)])];
}
export function recoveryEnrollment({marketId,abi,vaultId}){user(marketId);user(vaultId);return call(marketId,abi,'request_recovery',[vaultId]);}

// A consenting funder sends one smallest unit of each missing FT to the user;
// the user claims it before funding an order. No minting or policy changes.
export function assetSeedTransfers({market,config,tokenAbi,userId}){user(userId);return (market==='nftmarket'?[config.tokenId]:[config.assetA,config.assetB]).map(id=>call(BigInt(id),tokenAbi,'transfer',[userId,encodeAmount(1n)]));}
export function assetSeedClaims({market,config,tokenAbi,funderId}){user(funderId);return (market==='nftmarket'?[config.tokenId]:[config.assetA,config.assetB]).map(id=>call(BigInt(id),tokenAbi,'claim',[funderId]));}

// Limit-mode orders intentionally do not commit a stale sold_lots quote. The
// contract computes the progressive price and returns buy-side quote change.
export function curveLimitCalls({buy,marketId,marketAbi,config,tokenAbi,vaultId,lots,quoteLimit,deadline,nonce,nativeProtocol='legacy-v1'}){if(typeof buy!=='boolean')throw Error('buy must be boolean');user(marketId);user(vaultId);integer(lots,BigInt(config.cap));if(lots===0n||quoteLimit<=0n)throw Error('positive lots and quote limit');const token=BigInt(config.unit)*lots;return [call(marketId,marketAbi,buy?'open_limit_buy':'open_limit_sell',[vaultId,lots,0n,encodeAmount(quoteLimit),deadline,nonce]),native(vaultId,FEE_ESCROW,nativeProtocol),call(BigInt(buy?config.assetB:config.assetA),tokenAbi,'transfer',[vaultId,encodeAmount(buy?quoteLimit:token)])];}
