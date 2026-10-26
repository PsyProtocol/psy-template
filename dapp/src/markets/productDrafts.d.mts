export type ProductMarket = "orderbook" | "curve" | "nft";
export interface CommonProductForm {
  userId: string;
  feeCap: string;
  deadlineMinutes: string;
}
export interface BookForm extends CommonProductForm {
  side: "buy" | "sell";
  amount: string;
  limitPrice: string;
}
export interface CurveForm extends CommonProductForm {
  side: "buy" | "sell";
  lots: string;
  slippageBps: string;
}
export interface NftBuyForm extends CommonProductForm {
  listingId: string;
  maxPrice: string;
}
export interface NftListingForm extends CommonProductForm {
  ownedId: string;
  price: string;
}
export interface ProductPreview {
  schema: 1;
  market: ProductMarket;
  action: "buy" | "sell" | "list";
  source: "local-fixture";
  financialAuthorization: false;
  network: "unverified-demo";
  fixtureVersion: string;
  sdkReference: string;
  inputForm: CommonProductForm;
  owner: string;
  feeCap: string;
  createdAt: number;
  expiresAt: number;
  spend: { asset: string; units: string };
  receive: { asset: string; units: string };
  terms: Record<string, unknown>;
  note: string;
}
export interface ProductRecord {
  id: string;
  status: "draft" | "cancelled";
  preview: ProductPreview;
}
export interface BookRow {
  id: string;
  side: "ask" | "bid";
  base: string;
  quote: string;
  owner: string;
  checkpoint: string;
}
export interface DemoNft {
  id: string;
  title: string;
  collection: string;
  collectionRef: string;
  tokenWords: readonly string[];
  metadataWords: readonly string[];
  seller?: string;
  listingNonce?: string;
  price?: string;
  owner?: string;
  slot: string;
  art: number;
}
export const PRODUCT_STORAGE: string;
export const FIXTURE_VERSION: string;
export const BOOK_ROWS: readonly BookRow[];
export const CURVE: Readonly<{
  cap: number;
  threshold: number;
  sold: number;
  ownedLots: number;
  base: string;
  step: string;
  unit: string;
}>;
export const NFT_LISTINGS: readonly (DemoNft & {
  seller: string;
  listingNonce: string;
  price: string;
})[];
export const NFT_OWNED: readonly (DemoNft & { owner: string })[];
export function decimalPrice(
  quote: string,
  base: string,
  digits?: number,
): string;
export function rankBookRows(rows: readonly BookRow[]): BookRow[];
export function previewBook(form: BookForm, now?: number): ProductPreview;
export function previewCurve(form: CurveForm, now?: number): ProductPreview;
export function curvePoints(): { sold: number; price: string }[];
export function previewNftBuy(form: NftBuyForm, now?: number): ProductPreview;
export function previewNftListing(
  form: NftListingForm,
  now?: number,
): ProductPreview;
export function hydrateProductDrafts(text: string): ProductRecord[];
export function serializeProductDrafts(records: ProductRecord[]): string;
export function addProductDraft(
  preview: ProductPreview,
  records: ProductRecord[],
): ProductRecord;
export function cancelProductDraft(record: ProductRecord): ProductRecord;
