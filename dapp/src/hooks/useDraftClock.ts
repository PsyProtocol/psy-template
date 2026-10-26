import { useEffect, useState } from "react";
import type { ProductRecord } from "../markets/productDrafts.mjs";
export function useDraftClock(records: ProductRecord[]) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const due = records
      .filter((r) => r.status === "draft" && r.preview.expiresAt > now)
      .map((r) => r.preview.expiresAt);
    const timer = due.length
      ? window.setTimeout(update, Math.max(1, Math.min(...due) - Date.now()))
      : undefined;
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [records, now]);
  return now;
}
