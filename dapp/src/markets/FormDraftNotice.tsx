export function FormDraftNotice({
  issue,
  restored,
  onReset,
}: {
  issue: string;
  restored: boolean;
  onReset: () => void;
}) {
  return (
    <div className="editing-notice">
      <p
        className={issue ? "storage-note" : "small-note"}
        role={issue ? "status" : undefined}
      >
        {issue ||
          (restored
            ? "Saved inputs restored. Fresh quotes, state and wallet authorization are still required."
            : "Inputs stay in this browser when you leave or reload. No order is submitted automatically.")}
      </p>
      <button
        type="button"
        className="text-button"
        disabled={!!issue}
        onClick={onReset}
      >
        Reset form inputs
      </button>
    </div>
  );
}
