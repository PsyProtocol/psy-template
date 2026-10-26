import { useEffect, useState } from "react";
import {
  PRODUCT_STORAGE,
  hydrateProductDrafts,
  serializeProductDrafts,
  addProductDraft,
  cancelProductDraft,
  type ProductPreview,
  type ProductRecord,
} from "../markets/productDrafts.mjs";
export function useProductDrafts() {
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(PRODUCT_STORAGE);
      return {
        records: raw === null ? [] : hydrateProductDrafts(raw),
        issue: "",
      };
    } catch {
      return {
        records: [] as ProductRecord[],
        issue:
          "Local market drafts could not be read. Originals are preserved; autosave is paused.",
      };
    }
  });
  const [records, setRecords] = useState<ProductRecord[]>(initial.records),
    [issue, setIssue] = useState(initial.issue);
  useEffect(() => {
    if (issue) return;
    try {
      localStorage.setItem(PRODUCT_STORAGE, serializeProductDrafts(records));
    } catch {
      setIssue("Draft storage unavailable. This session uses memory only.");
    }
  }, [records, issue]);
  return {
    records,
    issue,
    add: (preview: ProductPreview) => {
      const record = addProductDraft(preview, records);
      setRecords([record, ...records]);
      return record;
    },
    cancel: (id: string) => {
      setRecords(records.map((r) => (r.id === id ? cancelProductDraft(r) : r)));
    },
    exportText: () => serializeProductDrafts(records),
  };
}
