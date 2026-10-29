import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { testJevConnection } from "@/lib/server/jev-connection-fn";

export function JevConnectionTest({
  configured,
  unsaved,
}: {
  configured: boolean;
  unsaved: boolean;
}) {
  const test = useMutation({ mutationFn: () => testJevConnection(), retry: false });
  return (
    <div className="grid gap-2">
      <div>
        <Button
          variant="outline"
          disabled={!configured || unsaved || test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending ? "Testing JEV…" : "Test JEV connection"}
        </Button>
      </div>
      <p className="text-xs text-muted" role="status" aria-live="polite">
        {unsaved
          ? "Save your changes before testing."
          : test.isPending
            ? "Checking the saved key…"
            : test.isError
              ? "Connection test failed. Try again."
              : test.data
                ? `${test.data.message} · ${new Date(test.data.checkedAt).toLocaleTimeString()}`
                : "Tests the saved connection."}
      </p>
    </div>
  );
}
