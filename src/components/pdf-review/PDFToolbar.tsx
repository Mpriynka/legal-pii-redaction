import { Loader2, Download, CheckCheck, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PDFToolbarProps {
    onBack?: () => void;
    onSetAll: (state: boolean | null) => void;
    onDownload: () => void;
    isGenerating: boolean;
}

export function PDFToolbar({ onBack, onSetAll, onDownload, isGenerating }: PDFToolbarProps) {
    return (
        <div className="flex items-center justify-between gap-2 border-b p-3 flex-wrap">
            <div className="flex items-center gap-2">
                {onBack && (
                    <Button variant="ghost" size="sm" onClick={onBack}>
                        ← Back
                    </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => onSetAll(true)}>
                    <CheckCheck className="h-3.5 w-3.5 mr-1" /> Accept All
                </Button>
                <Button variant="outline" size="sm" onClick={() => onSetAll(false)}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Reject All
                </Button>
                <Button variant="outline" size="sm" onClick={() => onSetAll(null)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                </Button>
            </div>
            <div className="flex items-center gap-2">
                <Button size="sm" onClick={onDownload} disabled={isGenerating}>
                    {isGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                    {isGenerating ? "Exporting..." : "Download Redacted PDF"}
                </Button>
            </div>
        </div>
    );
}
