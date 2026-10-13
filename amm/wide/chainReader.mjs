import {createAmmReader} from '../chainReader.mjs';
import {POOL_AMOUNT_CAP} from './operationCalls.mjs';
export const WIDE_AMM_CODE_ROOT = '566880556bf5e4dcc0322aa93ec6e443570365b043617309af0e9c4ac7dba87b';
export const WIDE_AMM_V2_CODE_ROOT = '4c959661f636981349452f346ea39e276d42c3f47dc427ee50a7aee9e864bfb6';
export const WIDE_AMM_CODE_ROOTS = Object.freeze([WIDE_AMM_CODE_ROOT, WIDE_AMM_V2_CODE_ROOT]);
export const {proposeAmmAction, scanAmm} = createAmmReader({amountCap: POOL_AMOUNT_CAP});
