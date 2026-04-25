import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export interface ManualSelectionData {
    pageIndex: number;
    rect: { x: number; y: number; width: number; height: number };
    text: string;
    startIndex: number;
    endIndex: number;
}

interface ManualRedactionDialogProps {
    selection: ManualSelectionData | null;
    onClose: () => void;
    onConfirm: (replacement: string, replaceAll: boolean) => void;
    replacementValue: string;
    onReplacementChange: (val: string) => void;
    replaceAllValue: boolean;
    onReplaceAllChange: (val: boolean) => void;
}

export function ManualRedactionDialog({
    selection,
    onClose,
    onConfirm,
    replacementValue,
    onReplacementChange,
    replaceAllValue,
    onReplaceAllChange,
}: ManualRedactionDialogProps) {
    return (
        <Dialog open={!!selection} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Manual Redaction</DialogTitle>
                    <DialogDescription>
                        Provide a replacement label for the selected area.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {selection?.startIndex !== -1 && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Selected Text detected under box</label>
                            <div className="p-2 border rounded-md bg-muted/50 font-mono text-sm break-all max-h-32 overflow-y-auto">
                                {selection?.text}
                            </div>
                        </div>
                    )}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Replace With</label>
                        <Input
                            value={replacementValue}
                            onChange={(e) => onReplacementChange(e.target.value)}
                            placeholder="[REDACTED]"
                            autoFocus
                        />
                    </div>
                    {selection?.startIndex !== -1 && (
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="replace-all-pdf"
                                checked={replaceAllValue}
                                onCheckedChange={(c) => onReplaceAllChange(c === true)}
                            />
                            <label
                                htmlFor="replace-all-pdf"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                                Replace all occurrences in document
                            </label>
                        </div>
                    )}
                </div>
                <DialogFooter className="sm:justify-start">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={() => onConfirm(replacementValue, replaceAllValue)}>
                        Confirm Redaction
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
