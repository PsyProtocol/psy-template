// Shared, dependency-free browser/server codec. Digests bind application data;
// neither a digest nor an RPC reply authenticates a chain state transition.
export function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value))
    return String(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (
    value &&
    typeof value === "object" &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  throw Error("Canonical data requires exact integers or decimal strings");
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function requireThat(ok, reason) {
  if (!ok) throw Error(reason);
}
export function id(n) {
  requireThat(
    Number.isSafeInteger(n) && n > 0 && n < 16777216,
    "Invalid user or market ID",
  );
  return n;
}
export const hashPattern = /^[0-9a-f]{64}$/;
export function exactFields(value, names) {
  requireThat(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join(",") === [...names].sort().join(","),
    "Unexpected request fields",
  );
}
export const WRITE_BOUNDARY =
  "Wallet exact-prepare, independent full-UPS verification and durable original-identity submit/reconcile are not connected. No financial submission is enabled.";
