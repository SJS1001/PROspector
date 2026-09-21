import { cn } from "@/lib/utils";

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "ok" | "warn" | "danger" | "lime";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-max items-center rounded-sm border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide",
        tone === "ok" && "border-line bg-ok-bg text-teal",
        tone === "warn" && "border-line bg-warn-bg text-amber",
        tone === "danger" && "border-line bg-danger-bg text-red",
        tone === "lime" && "border-line bg-lime text-paper",
        tone === "neutral" && "border-line bg-cream text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
