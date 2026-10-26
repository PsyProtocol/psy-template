// Editing preferences only. Never persist observations, executable plans or keys.
const common = ["userId", "feeCap", "deadlineMinutes"];
export const EDITING_FIELDS = Object.freeze({
  swap: [
    "mode",
    "sell",
    "amount",
    "receiver",
    "slippageBps",
    "deadlineMinutes",
    "feeCap",
  ],
  add: ["pool", "amountA", "amountB", "receiver", "slippageBps", "feeCap"],
  remove: ["pool", "receiver", "shares", "slippageBps", "feeCap"],
  liquidity: ["mode"],
  orderbook: [...common, "side", "amount", "limitPrice"],
  curve: [...common, "side", "lots", "slippageBps"],
  nft: [...common, "mode", "maxPrice", "price", "ownedId", "query", "sort"],
});
export const editingKey = (kind) => {
  if (!Object.hasOwn(EDITING_FIELDS, kind)) throw Error("Unknown editing form");
  return "psy.markets.editing.v1." + kind;
};
const exact = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");
export function validateEditingForm(kind, form) {
  editingKey(kind);
  if (
    !exact(form, EDITING_FIELDS[kind]) ||
    Object.values(form).some((v) => typeof v !== "string" || v.length > 128)
  )
    throw Error("Invalid editing preferences");
  const enums = {
    pool: ["2485", "2486"],
    sell: ["A", "B"],
    side: ["buy", "sell"],
    slippageBps: ["10", "50", "100"],
    deadlineMinutes: ["15", "30", "60"],
    sort: ["low", "high"],
  };
  if (kind === "swap") enums.mode = ["single", "double"];
  if (kind === "liquidity") enums.mode = ["add", "remove"];
  if (kind === "nft") enums.mode = ["browse", "list"];
  for (const [name, allowed] of Object.entries(enums))
    if (Object.hasOwn(form, name) && !allowed.includes(form[name]))
      throw Error("Invalid editing selection");
  return { ...form };
}
export function serializeEditingForm(kind, form) {
  return JSON.stringify({
    schema: 1,
    source: "local-editing-preference",
    kind,
    financialAuthorization: false,
    form: validateEditingForm(kind, form),
  });
}
export function hydrateEditingForm(raw, kind) {
  if (typeof raw !== "string" || raw.length > 8192)
    throw Error("Editing record size limit");
  const value = JSON.parse(raw);
  if (
    !exact(value, [
      "schema",
      "source",
      "kind",
      "financialAuthorization",
      "form",
    ]) ||
    value.schema !== 1 ||
    value.source !== "local-editing-preference" ||
    value.kind !== kind ||
    value.financialAuthorization !== false
  )
    throw Error("Invalid editing record");
  return validateEditingForm(kind, value.form);
}
