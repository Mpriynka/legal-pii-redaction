import { PII_COLORS, PII_LABELS, type PIIType } from "@/lib/mock-data";

export function PIILegend() {
  return (
    <div className="flex flex-wrap gap-3">
      {(Object.keys(PII_COLORS) as PIIType[]).map((type) => (
        <div key={type} className="flex items-center gap-1.5 text-xs">
          <div
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: `hsl(var(--${PII_COLORS[type].replace("pii-", "pii-")}))` }}
          />
          <span className="text-muted-foreground">{PII_LABELS[type]}</span>
        </div>
      ))}
    </div>
  );
}
