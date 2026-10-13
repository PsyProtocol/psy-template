// Staging profile: unchanged 0 PSY / 4 pUSDT calls, escrow and amount limit.
import { createPoolCallBuilder } from './callBuilder.mjs';
export const PSY_CONTRACT_ID = 0;
export const PUSDT_CONTRACT_ID = 4;
export const POOL_FEE_ESCROW = 1_000_100_000;
export const POOL_AMOUNT_CAP = 10_000_000;
export const { openSwapCalls, settleSwapCalls, refundSwapCalls, openAddCalls, settleAddCalls, refundAddCalls, openRemoveCalls, closeOrderCalls, settleRemoveCalls, cancelRemoveCalls, withPoolSignInputs } = createPoolCallBuilder({ amountCap: POOL_AMOUNT_CAP });
