import { Check, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PIIEntity } from "@/lib/mock-data";

interface EntityDetailPanelProps {
    entity: PIIEntity | null;
    onUpdateStatus: (id: string, status: boolean | null) => void;
}

export function EntityDetailPanel({ entity, onUpdateStatus }: EntityDetailPanelProps) {
    if (!entity) return null;

    return (
        <div className="border-t p-3 flex items-center gap-4 bg-muted/30 absolute bottom-0 w-full left-0 right-0 z-30 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
            <div className="flex-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {entity.type}
                </span>
                <p className="text-sm truncate max-w-xl">
                    "<strong>{entity.original}</strong>" →{" "}
                    <code className="bg-muted px-1 rounded text-xs">{entity.replacement}</code>
                </p>
            </div>
            <div className="flex gap-1 shrink-0">
                <Button
                    size="sm"
                    variant={entity.accepted === true ? "default" : "outline"}
                    onClick={() => onUpdateStatus(entity.id, true)}
                >
                    <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                    size="sm"
                    variant={entity.accepted === false ? "destructive" : "outline"}
                    onClick={() => onUpdateStatus(entity.id, false)}
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onUpdateStatus(entity.id, null)}
                >
                    <RotateCcw className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}
