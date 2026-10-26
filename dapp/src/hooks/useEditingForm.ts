import { useEffect, useRef, useState, type SetStateAction } from "react";
import {
  editingKey,
  hydrateEditingForm,
  serializeEditingForm,
  type EditingKind,
} from "../markets/editingDrafts.mjs";
export function useEditingForm<T extends object>(
  kind: EditingKind,
  defaults: T,
) {
  const key = editingKey(kind),
    initial = useRef(defaults);
  const [loaded] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return {
        form:
          raw === null ? { ...defaults } : (hydrateEditingForm(raw, kind) as T),
        restored: raw !== null,
        issue: "",
      };
    } catch {
      return {
        form: { ...defaults },
        restored: false,
        issue:
          "Saved form could not be read. The original is preserved; autosave is paused.",
      };
    }
  });
  const [form, setValue] = useState<T>(loaded.form),
    [issue, setIssue] = useState(loaded.issue),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty || issue) return;
    try {
      localStorage.setItem(key, serializeEditingForm(kind, form));
    } catch {
      setIssue(
        "Form autosave unavailable. Current inputs are kept in this session; the stored original is preserved.",
      );
    }
  }, [form, dirty, issue, key, kind]);
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === key || e.key === null)
        setIssue(
          "Another tab changed saved forms. Autosave is paused; current inputs are kept. Reload to review saved preferences.",
        );
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [key]);
  return {
    form,
    issue,
    restored: loaded.restored,
    setForm: (next: SetStateAction<T>) => {
      setDirty(true);
      setValue(next);
    },
    reset: () => {
      if (!issue) {
        setDirty(true);
        setValue({ ...initial.current });
      }
    },
  };
}
