export type UiFormKind =
  | "swap"
  | "add"
  | "remove"
  | "orderbook"
  | "curve"
  | "nft-buy"
  | "nft-list";
export const FIELD_LABELS: Record<string, string>;
export function validateFormFields(
  kind: UiFormKind,
  form: object,
): Record<string, string>;
