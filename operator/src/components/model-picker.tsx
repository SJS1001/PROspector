import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getModelCatalog } from "@/lib/server/model-catalog-fn";
import { mutationMessage } from "@/lib/workspace";

export function ModelPicker({ provider, value, onChange, enabled, revision }: {
  provider: string;
  value: string;
  onChange: (value: string) => void;
  enabled: boolean;
  revision: number;
}) {
  const catalog = useQuery({
    queryKey: ["model-catalog", provider, revision],
    queryFn: () => getModelCatalog(),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const models = enabled && catalog.data?.provider === provider ? catalog.data.models : [];
  const listed = models.some((model) => model.id === value);
  return (
    <div className="grid min-w-0 gap-2">
      <label className="grid min-w-0 gap-1 text-xs text-muted">
        Model
        <select className="field min-w-0 w-full" value={value} onChange={(event) => onChange(event.target.value)} disabled={!enabled || !models.length}>
          <option value="" disabled>Choose a model</option>
          {value && !listed ? <option value={value}>{value} · current</option> : null}
          {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={!enabled || catalog.isFetching} onClick={() => void catalog.refetch()}>
          {catalog.isFetching ? "Loading models…" : "Refresh models"}
        </Button>
        <span className="text-xs text-muted" role="status">
          {!enabled ? "Save your connection to load models." : catalog.isError ? mutationMessage(catalog.error) : models.length ? `${models.length} models available` : ""}
        </span>
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Advanced</summary>
        <label className="mt-2 grid gap-1">Model ID
          <input className="field" autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
      </details>
    </div>
  );
}
