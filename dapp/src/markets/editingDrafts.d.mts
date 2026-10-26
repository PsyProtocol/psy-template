export type EditingKind =
  | "swap"
  | "add"
  | "remove"
  | "liquidity"
  | "add-options"
  | "orderbook"
  | "curve"
  | "nft";
export const EDITING_FIELDS: Readonly<Record<EditingKind, string[]>>;
export function editingKey(kind: EditingKind): string;
export function serializeEditingForm(kind: EditingKind, form: object): string;
export function hydrateEditingForm(
  raw: string,
  kind: EditingKind,
): Record<string, string>;
