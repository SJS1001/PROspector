import { useEffect, useId, useRef, useState } from "react";
import { Panel, ErrorNote } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { mutationMessage, useExportArchive, useRestoreArchive } from "@/lib/workspace";

export function WorkspaceArchivePanel() {
  const archive = useExportArchive();
  const restore = useRestoreArchive();
  const [selected, setSelected] = useState<{ name: string; json: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [fileError, setFileError] = useState("");
  const readGeneration = useRef(0);
  const errorId = useId();
  const feedback = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (fileError || archive.error || restore.error) feedback.current?.focus();
    else if (restore.isSuccess) status.current?.focus();
  }, [fileError, archive.error, restore.error, restore.isSuccess]);
  const busy = archive.isPending || restore.isPending;

  return (
    <Panel className="grid gap-4 p-5">
      <h2 className="text-sm font-medium">Workspace backup and restore</h2>
      <p className="text-sm text-muted">
        Back up workspace records, decisions, messages, history and suppressions. The JSON file is
        unencrypted: store it privately. Connection credentials, sign-in sessions, spending grants
        and active schedules are excluded.
      </p>
      <Button variant="outline" disabled={busy} onClick={() => archive.mutate()}>
        {archive.isPending ? "Building backup…" : "Download workspace backup"}
      </Button>
      <label className="grid gap-2 text-sm">
        Choose a version 1 workspace backup (JSON, up to 20 MiB)
        <input
          aria-invalid={Boolean(fileError)}
          aria-describedby={fileError ? errorId : undefined}
          type="file"
          accept="application/json,.json"
          disabled={busy}
          className="min-h-11 min-w-0 text-xs text-muted"
          onChange={async (event) => {
            const generation = ++readGeneration.current;
            const file = event.target.files?.[0];
            // Permit selecting the same file again after a read/validation failure.
            event.target.value = "";
            setSelected(null);
            setConfirmed(false);
            setFileError("");
            restore.reset();
            if (!file) return;
            if (file.size > 20 * 1024 * 1024) {
              setFileError("Choose a backup no larger than 20 MiB.");
              return;
            }
            try {
              const json = await file.text();
              if (generation !== readGeneration.current) return;
              setConfirmed(false);
              setSelected({ name: file.name, json });
            } catch {
              if (generation === readGeneration.current)
                setFileError("That file could not be read. Choose it again.");
            }
          }}
        />
      </label>
      {selected ? (
        <>
          <p className="break-words text-sm">Selected: {selected.name}</p>
          <p className="text-sm text-muted">
            Restore replaces this owner's workspace records. Existing suppressions are retained.
            Imported approvals remain history and must be approved again; schedules and spending
            grants stay disabled. Saved connection credentials on this machine stay in place. Back
            up the current workspace first.
          </p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I understand that this replaces my workspace records.
          </label>
          <Button
            disabled={!confirmed || busy}
            onClick={() =>
              restore.mutate(
                { json: selected.json },
                {
                  onSuccess: () => {
                    setSelected(null);
                    setConfirmed(false);
                  },
                },
              )
            }
          >
            {restore.isPending ? "Validating and restoring…" : "Restore selected backup"}
          </Button>
        </>
      ) : null}
      <div ref={feedback} tabIndex={-1} id={errorId}>
        {fileError ? <ErrorNote message={fileError} /> : null}
        {archive.error ? <ErrorNote message={mutationMessage(archive.error)} /> : null}
        {restore.error ? <ErrorNote message={mutationMessage(restore.error)} /> : null}
      </div>
      <p ref={status} tabIndex={-1} role="status" className="text-sm text-muted">
        {restore.isSuccess
          ? "Restore committed. Reload the app to view the recovered workspace. No provider work was requested by restore."
          : "The complete file is validated before an atomic restore. Validation failures leave the previous workspace in place. If the connection is interrupted, reload and check the workspace before trying again."}
      </p>
    </Panel>
  );
}
