import { useId, useRef, useState } from "react";
import {
  validateFormFields,
  FIELD_LABELS,
  type UiFormKind,
} from "./formValidation.mjs";
export function useFieldFeedback(kind: UiFormKind, form: object) {
  const prefix = useId(),
    root = useRef<HTMLElement | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const focus = (name: string) =>
    root.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
  const errorId = (name: string) =>
    errors[name] ? `${prefix}-${name}-error` : undefined;
  return {
    errors,
    errorId,
    focus,
    field: (name: string) => ({
      name,
      "aria-invalid": errors[name] ? true : undefined,
      "aria-describedby": errorId(name),
    }),
    clear: (name: string) =>
      setErrors((old) => {
        if (!old[name]) return old;
        const next = { ...old };
        delete next[name];
        return next;
      }),
    reset: () => setErrors({}),
    check: (element: HTMLElement | null) => {
      root.current = element;
      const found = validateFormFields(kind, form);
      const next: Record<string, string> = {};
      for (const control of element?.querySelectorAll<HTMLElement>("[name]") ??
        []) {
        const name = control.getAttribute("name")!;
        if (found[name]) next[name] = found[name];
      }
      for (const [name, message] of Object.entries(found))
        if (!next[name]) next[name] = message;
      setErrors(next);
      const first = Object.keys(next)[0];
      if (first) {
        focus(first);
        return false;
      }
      return true;
    },
  };
}
export type FieldFeedback = ReturnType<typeof useFieldFeedback>;
export function FieldErrors({ feedback }: { feedback: FieldFeedback }) {
  const entries = Object.entries(feedback.errors);
  if (!entries.length) return null;
  return (
    <div className="field-summary" role="alert">
      <strong>
        Check {entries.length} {entries.length === 1 ? "field" : "fields"}
      </strong>
      <ul>
        {entries.map(([name, message]) => (
          <li key={name} id={feedback.errorId(name)}>
            <button type="button" onClick={() => feedback.focus(name)}>
              {FIELD_LABELS[name] || name}
            </button>
            : {message}
          </li>
        ))}
      </ul>
    </div>
  );
}
