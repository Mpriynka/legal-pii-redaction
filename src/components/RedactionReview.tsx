import { useState, useMemo } from "react";
import { Check, X, RotateCcw, Copy, Download, CheckCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PIILegend } from "@/components/PIILegend";
import { type PIIEntity, type PIIType, PII_COLORS, SAMPLE_TEXT, SAMPLE_ENTITIES, getRedactedText } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  originalText?: string;
  entities?: PIIEntity[];
  onBack?: () => void;
}

export function RedactionReview({ originalText = SAMPLE_TEXT, entities: initialEntities = SAMPLE_ENTITIES, onBack }: Props) {
  const [entities, setEntities] = useState<PIIEntity[]>(initialEntities.map((e) => ({ ...e })));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Manual Redaction State
  const [manualSelection, setManualSelection] = useState<{ text: string; start: number; end: number } | null>(null);
  const [manualReplacement, setManualReplacement] = useState("");
  const [replaceAll, setReplaceAll] = useState(false);

  const updateEntity = (id: string, accepted: boolean | null) => {
    setEntities((prev) => prev.map((e) => (e.id === id ? { ...e, accepted } : e)));
  };

  const acceptAll = () => setEntities((prev) => prev.map((e) => ({ ...e, accepted: true })));
  const rejectAll = () => setEntities((prev) => prev.map((e) => ({ ...e, accepted: false })));
  const resetAll = () => setEntities((prev) => prev.map((e) => ({ ...e, accepted: null })));

  const redactedText = useMemo(() => getRedactedText(originalText, entities), [originalText, entities]);

  const copyRedacted = () => {
    navigator.clipboard.writeText(redactedText);
    toast({ title: "Copied!", description: "Redacted text copied to clipboard." });
  };

  const downloadRedacted = () => {
    const blob = new Blob([redactedText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "redacted-document.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: "Redacted file saved." });
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const container = document.getElementById("original-document-container");
    if (!container || !container.contains(selection.anchorNode)) return;

    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(container);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);

    const startIndex = preSelectionRange.toString().length;
    const endIndex = startIndex + range.toString().length;

    if (startIndex < endIndex) {
      const selectedText = originalText.slice(startIndex, endIndex);

      // Skip whitespace-only selections
      if (!selectedText.trim()) {
        selection.removeAllRanges();
        return;
      }

      // Open the dialog instead of instantly adding
      setManualSelection({ text: selectedText, start: startIndex, end: endIndex });
      setManualReplacement(`[MANUAL_REDACTION]`);
      setReplaceAll(false);
      selection.removeAllRanges();
    }
  };

  const confirmManualRedaction = () => {
    if (!manualSelection) return;

    const { text, start, end } = manualSelection;
    const replacementStr = manualReplacement.trim() || `[MANUAL_REDACTION]`;

    setEntities((prev) => {
      let baseEntities = [...prev];
      const newEntities: PIIEntity[] = [];

      if (replaceAll) {
        // Find all occurrences of the selected text
        let searchIdx = 0;
        while (searchIdx < originalText.length) {
          const matchIdx = originalText.indexOf(text, searchIdx);
          if (matchIdx === -1) break;

          newEntities.push({
            id: `manual-${Date.now()}-${matchIdx}`,
            type: "id",
            original: text,
            replacement: replacementStr,
            startIndex: matchIdx,
            endIndex: matchIdx + text.length,
            accepted: true,
          });
          searchIdx = matchIdx + text.length;
        }
      } else {
        // Just the one selected Occurrence
        newEntities.push({
          id: `manual-${Date.now()}`,
          type: "id",
          original: text,
          replacement: replacementStr,
          startIndex: start,
          endIndex: end,
          accepted: true,
        });
      }

      // We must remove any existing entities that overlap with our NEW entities
      // to prevent UI layout breaking
      baseEntities = baseEntities.filter(existing => {
        const isOverlapped = newEntities.some(newEnt =>
          existing.startIndex < newEnt.endIndex && existing.endIndex > newEnt.startIndex
        );
        return !isOverlapped;
      });

      return [...baseEntities, ...newEntities];
    });

    toast({ title: "Manual Redaction Added", description: `Redacted ${replaceAll ? 'all occurrences of ' : ''}"${text.length > 20 ? text.slice(0, 20) + '...' : text}"` });
    setManualSelection(null);
  };

  // Build highlighted original text
  const renderHighlightedText = () => {
    const sorted = [...entities].sort((a, b) => a.startIndex - b.startIndex);
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    sorted.forEach((entity) => {
      if (entity.startIndex > lastIndex) {
        parts.push(<span key={`text-${lastIndex}`}>{originalText.slice(lastIndex, entity.startIndex)}</span>);
      }
      const colorVar = `--${PII_COLORS[entity.type]}`;
      parts.push(
        <span
          key={entity.id}
          className={cn(
            "cursor-pointer rounded-sm px-0.5 transition-all",
            selectedId === entity.id && "ring-2 ring-ring",
            entity.accepted === false && "line-through opacity-50"
          )}
          style={{ backgroundColor: `hsl(var(${colorVar}) / 0.25)`, borderBottom: `2px solid hsl(var(${colorVar}))` }}
          onClick={() => setSelectedId(entity.id === selectedId ? null : entity.id)}
        >
          {entity.original}
        </span>
      );
      lastIndex = entity.endIndex;
    });

    if (lastIndex < originalText.length) {
      parts.push(<span key="text-end">{originalText.slice(lastIndex)}</span>);
    }

    return parts;
  };

  const summary = entities.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {} as Record<PIIType, number>);

  return (
    <div className="flex flex-col w-full max-w-6xl mx-auto my-4 h-[calc(100vh-4rem)] min-h-[500px] border rounded-lg shadow-sm bg-background overflow-hidden relative">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b p-3 flex-wrap">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              ← Back
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={acceptAll}>
            <CheckCheck className="h-3.5 w-3.5 mr-1" /> Accept All
          </Button>
          <Button variant="outline" size="sm" onClick={rejectAll}>
            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject All
          </Button>
          <Button variant="outline" size="sm" onClick={resetAll}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyRedacted}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
          </Button>
          <Button size="sm" onClick={downloadRedacted}>
            <Download className="h-3.5 w-3.5 mr-1" /> Download TXT
          </Button>
        </div>
      </div>

      {/* Legend + Summary */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-muted/50 flex-wrap">
        <PIILegend />
        <div className="flex gap-3 text-xs text-muted-foreground">
          {Object.entries(summary).map(([type, count]) => (
            <span key={type}>
              {count} {type}
            </span>
          ))}
        </div>
      </div>

      {/* Side by side */}
      <div className="flex-1 min-h-0 grid grid-cols-2 divide-x overflow-hidden">
        {/* Original */}
        <div className="flex flex-col min-h-0">
          <div className="px-4 py-2 border-b bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0 cursor-default">
            Original Document <span className="text-muted-foreground/50 lowercase ml-2 font-normal">(select text to manually redact)</span>
          </div>
          <div
            id="original-document-container"
            className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed whitespace-pre-wrap font-mono selection:bg-primary/20"
            onMouseUp={handleTextSelection}
          >
            {renderHighlightedText()}
          </div>
        </div>

        {/* Redacted */}
        <div className="flex flex-col min-h-0">
          <div className="px-4 py-2 border-b bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            Redacted Document
          </div>
          <div className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed whitespace-pre-wrap font-mono">
            {redactedText}
          </div>
        </div>
      </div>

      {/* Entity detail panel */}
      {selectedId && (() => {
        const entity = entities.find((e) => e.id === selectedId)!;
        return (
          <div className="border-t p-3 flex items-center gap-4 bg-muted/30">
            <div className="flex-1">
              <span className="text-xs font-semibold uppercase text-muted-foreground">{entity.type}</span>
              <p className="text-sm">
                "<strong>{entity.original}</strong>" → <code className="bg-muted px-1 rounded text-xs">{entity.replacement}</code>
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant={entity.accepted === true ? "default" : "outline"} onClick={() => updateEntity(entity.id, true)}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={entity.accepted === false ? "destructive" : "outline"} onClick={() => updateEntity(entity.id, false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => updateEntity(entity.id, null)}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Manual Redaction Dialog */}
      <Dialog open={!!manualSelection} onOpenChange={(open) => !open && setManualSelection(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manual Redaction</DialogTitle>
            <DialogDescription>
              Provide a replacement label for the selected text.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Selected Text</label>
              <div className="p-2 border rounded-md bg-muted/50 font-mono text-sm break-all max-h-32 overflow-y-auto">
                {manualSelection?.text}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Replace With</label>
              <Input
                value={manualReplacement}
                onChange={(e) => setManualReplacement(e.target.value)}
                placeholder="[REDACTED]"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="replace-all"
                checked={replaceAll}
                onCheckedChange={(c) => setReplaceAll(c === true)}
              />
              <label
                htmlFor="replace-all"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Replace all occurrences in document
              </label>
            </div>
          </div>
          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="ghost" onClick={() => setManualSelection(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmManualRedaction}>
              Confirm Redaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
