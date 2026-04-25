import { useState, useEffect, useRef } from "react";
import { Lock } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { PIILegend } from "@/components/PIILegend";
import { toast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { runPipeline } from "@/lib/pii-pipeline";
import {
    loadPDF,
    getPageData,
    getBoundingBoxesForTextRange,
    generateRedactedPDF,
    isScannedPage,
    type PDFPageData,
} from "@/lib/pdf-utils";
import { runOCR, getOCRBoxesForRange, terminateOCRWorker, type OcrResult } from "@/lib/ocr-utils";
import type { PIIEntity } from "@/lib/mock-data";

import { PDFToolbar } from "./pdf-review/PDFToolbar";
import { PDFPageViewer, type PDFBox } from "./pdf-review/PDFPageViewer";
import { EntityDetailPanel } from "./pdf-review/EntityDetailPanel";
import { ManualRedactionDialog, type ManualSelectionData } from "./pdf-review/ManualRedactionDialog";

interface Props {
    file: File;
    onBack?: () => void;
}

interface PDFReviewState {
    pageData: PDFPageData;
    entities: PIIEntity[];
    boxes: PDFBox[];
    /** true if this page was processed via OCR */
    wasOcr: boolean;
    /** Will be set when a page fails to process */
    error?: string;
    /** OCR result kept for manual-selection bbox lookup on scanned pages */
    ocrResult?: OcrResult;
}

interface ProgressState {
    current: number;
    total: number;
    /** human-readable status line e.g. "Running OCR…" */
    detail: string;
}

export function PDFRedactionReview({ file, onBack }: Props) {
    const [pages, setPages] = useState<PDFReviewState[]>([]);
    const [progress, setProgress] = useState<ProgressState | null>({ current: 0, total: 0, detail: "Preparing…" });
    const [generating, setGenerating] = useState(false);
    const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

    // Manual Selection State
    const [dragStart, setDragStart] = useState<{ x: number; y: number; pageIndex: number } | null>(null);
    const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
    const [manualSelection, setManualSelection] = useState<ManualSelectionData | null>(null);
    const [manualReplacement, setManualReplacement] = useState("");
    const [replaceAll, setReplaceAll] = useState(false);

    // Ref to cancel mid-process if user navigates away
    const cancelledRef = useRef(false);

    useEffect(() => {
        cancelledRef.current = false;

        async function processPagesSequentially() {
            try {
                const pdf = await loadPDF(file);
                const numPages = pdf.numPages;

                setProgress({ current: 0, total: numPages, detail: "Loading…" });

                // ── Sequential pipeline ────────────────────────────────────────
                // We process one page at a time and stream results into state.
                // This avoids holding all decoded page canvases in memory at once.
                for (let i = 1; i <= numPages; i++) {
                    if (cancelledRef.current) break;

                    setProgress({
                        current: i - 1,
                        total: numPages,
                        detail: `Reading page ${i} of ${numPages}…`,
                    });

                    try {
                        const data = await getPageData(pdf, i);
                        const scanned = isScannedPage(data.text);

                        let pageText = data.text;
                        let ocrResult: OcrResult | undefined;

                        if (scanned) {
                            setProgress({
                                current: i - 1,
                                total: numPages,
                                detail: `Running OCR on page ${i} of ${numPages}…`,
                            });
                            // Lazy-load Tesseract only when we hit the first scanned page
                            ocrResult = await runOCR(data.canvas);
                            pageText = ocrResult.text;
                        }

                        setProgress({
                            current: i - 1,
                            total: numPages,
                            detail: `Detecting PII on page ${i} of ${numPages}…`,
                        });

                        const result = await runPipeline(pageText);

                        // Build bounding boxes — two different paths for scanned vs searchable
                        const boxes: PDFBox[] = [];
                        for (const entity of result.entities) {
                            if (scanned && ocrResult) {
                                // Use char-index span matching against the OCR-assembled text.
                                // entity.startIndex/endIndex are offsets into the OCR text string
                                // returned by runOCR — exactly what getOCRBoxesForRange expects.
                                const ocrBoxes = getOCRBoxesForRange(ocrResult, entity.startIndex, entity.endIndex);
                                for (const box of ocrBoxes) {
                                    boxes.push({
                                        entityId: entity.id,
                                        x: box.x,
                                        y: box.y,
                                        width: box.width,
                                        height: box.height,
                                        type: entity.type,
                                        accepted: entity.accepted,
                                    });
                                }
                            } else {
                                // Use pdfjs text-item bbox matching
                                const textBoxes = getBoundingBoxesForTextRange(data, entity.startIndex, entity.endIndex);
                                for (const box of textBoxes) {
                                    boxes.push({
                                        entityId: entity.id,
                                        x: box.x,
                                        y: box.y,
                                        width: box.width,
                                        height: box.height,
                                        type: entity.type,
                                        accepted: entity.accepted,
                                    });
                                }
                            }
                        }

                        const newPage: PDFReviewState = {
                            pageData: data,
                            entities: result.entities,
                            boxes,
                            wasOcr: scanned,
                            ocrResult,
                        };

                        // Stream page into UI immediately
                        setPages(prev => [...prev, newPage]);

                        // NOTE: We intentionally do NOT zero the canvas (canvas.width = 0).
                        // generateRedactedPDF reads the canvas later to produce the flattened JPEG.
                        // Zeroing it here causes a "DataView offset out of bounds" crash on download.

                    } catch (pageErr: any) {
                        console.error(`Error processing page ${i}:`, pageErr);
                        // Push an error placeholder and keep going — don't crash the whole session
                        const errPage: PDFReviewState = {
                            pageData: {
                                pageIndex: i,
                                viewport: {} as any,
                                text: "",
                                items: [],
                                canvas: document.createElement("canvas"),
                            },
                            entities: [],
                            boxes: [],
                            wasOcr: false,
                            error: `Page ${i} could not be processed: ${pageErr.message ?? "unknown error"}`,
                        };
                        setPages(prev => [...prev, errPage]);
                    }
                }

            } catch (err: any) {
                console.error("PDF load failed:", err);
                toast({
                    title: "Error loading PDF",
                    description: "Failed to parse PDF.",
                    variant: "destructive",
                });
                if (onBack) onBack();
            } finally {
                setProgress(null);
            }
        }

        processPagesSequentially();

        return () => {
            cancelledRef.current = true;
            // Terminate the OCR worker when the user navigates away
            terminateOCRWorker();
        };
    }, [file, onBack]);

    const updateEntity = (entityId: string, accepted: boolean | null) => {
        setPages(prev => prev.map(page => {
            const updatedEntities = page.entities.map(e => e.id === entityId ? { ...e, accepted } : e);
            const updatedBoxes = page.boxes.map(b => b.entityId === entityId ? { ...b, accepted } : b);
            return { ...page, entities: updatedEntities, boxes: updatedBoxes };
        }));
    };

    const setAll = (state: boolean | null) => {
        setPages(prev => prev.map(page => ({
            ...page,
            entities: page.entities.map(e => ({ ...e, accepted: state })),
            boxes: page.boxes.map(b => ({ ...b, accepted: state })),
        })));
    };

    const handleDownload = async () => {
        setGenerating(true);
        toast({ title: "Generating PDF…", description: "Flattening images for true redaction." });
        try {
            const pagesDataToGenerate = pages.map(page => {
                const approvedBoxes = page.boxes.filter(b => b.accepted !== false);
                return { pageData: page.pageData, redactionBoxes: approvedBoxes };
            });

            const blob = await generateRedactedPDF(pagesDataToGenerate);

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `redacted_${file.name}`;
            a.click();
            URL.revokeObjectURL(url);

            toast({ title: "Success", description: "Secured PDF downloaded successfully." });
        } catch (err: any) {
            console.error(err);
            toast({ title: "Generation failed", description: err.message || "Could not generate PDF.", variant: "destructive" });
        } finally {
            setGenerating(false);
        }
    };

    // ── Mouse event handlers for manual selection ──────────────────────────
    const handleMouseDown = (e: React.MouseEvent, pageIndex: number) => {
        if ((e.target as HTMLElement).classList.contains("pointer-events-auto")) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top, pageIndex });
        setDragCurrent({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    const handleMouseMove = (e: React.MouseEvent, pageIndex: number) => {
        if (!dragStart || dragStart.pageIndex !== pageIndex) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setDragCurrent({
            x: Math.max(0, Math.min(e.clientX - rect.left, rect.width)),
            y: Math.max(0, Math.min(e.clientY - rect.top, rect.height)),
        });
    };

    const handleMouseUp = (e: React.MouseEvent, pageIndex: number) => {
        if (!dragStart || !dragCurrent || dragStart.pageIndex !== pageIndex) {
            setDragStart(null);
            setDragCurrent(null);
            return;
        }

        const x = Math.min(dragStart.x, dragCurrent.x);
        const y = Math.min(dragStart.y, dragCurrent.y);
        const width = Math.abs(dragCurrent.x - dragStart.x);
        const height = Math.abs(dragCurrent.y - dragStart.y);

        setDragStart(null);
        setDragCurrent(null);

        if (width < 5 || height < 5) return;

        const selectionRect = { x, y, width, height };
        const page = pages[pageIndex];

        // OCR page: spatial selection against OCR word bboxes
        if (page.wasOcr && page.ocrResult) {
            const matchedWords = page.ocrResult.words.filter(w => {
                return w.x < x + width && w.x + w.width > x &&
                    w.y < y + height && w.y + w.height > y;
            });
            const selectedText = matchedWords.map(w => w.text).join(" ");
            if (selectedText.trim()) {
                setManualSelection({ pageIndex, rect: selectionRect, text: selectedText, startIndex: -1, endIndex: -1 });
                setManualReplacement("[MANUAL_REDACTION]");
                setReplaceAll(false);
            }
            return;
        }

        // Searchable page: spatial selection against PDF text items
        let minStart = Infinity;
        let maxEnd = -1;

        for (const mapped of page.pageData.items) {
            const tx = pdfjsLib.Util.transform(page.pageData.viewport.transform, mapped.item.transform);
            const itemX = tx[4];
            const itemY = tx[5];
            const itemHeight = Math.abs(tx[3]) || mapped.item.height * page.pageData.viewport.scale;
            const itemTop = itemY - itemHeight;
            const itemWidth = mapped.item.width * page.pageData.viewport.scale;

            const overlapX = itemX < x + width && itemX + itemWidth > x;
            const overlapY = itemTop < y + height && itemTop + itemHeight > y;

            if (overlapX && overlapY) {
                minStart = Math.min(minStart, mapped.start);
                maxEnd = Math.max(maxEnd, mapped.end);
            }
        }

        if (minStart !== Infinity && maxEnd !== -1) {
            const selectedText = page.pageData.text.substring(minStart, maxEnd);
            if (selectedText.trim()) {
                setManualSelection({ pageIndex, rect: selectionRect, text: selectedText, startIndex: minStart, endIndex: maxEnd });
                setManualReplacement("[MANUAL_REDACTION]");
                setReplaceAll(false);
            }
        } else {
            setManualSelection({ pageIndex, rect: selectionRect, text: "Image/Visual Area", startIndex: -1, endIndex: -1 });
            setManualReplacement("[MANUAL_REDACTION]");
            setReplaceAll(false);
        }
    };

    const confirmManualRedaction = (replacementStr: string, isReplaceAll: boolean) => {
        if (!manualSelection) return;

        const { pageIndex, rect, text, startIndex, endIndex } = manualSelection;
        const finalReplacement = replacementStr.trim() || "[MANUAL_REDACTION]";

        setPages(prev => {
            const newPages = [...prev];
            const page = { ...newPages[pageIndex] };
            const newEntityId = `manual-${Date.now()}`;

            if (startIndex === -1) {
                page.boxes = [...page.boxes, {
                    entityId: newEntityId,
                    x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                    type: "id", accepted: true,
                }];
                page.entities = [...page.entities, {
                    id: newEntityId, type: "id", original: text,
                    replacement: finalReplacement, startIndex: -1, endIndex: -1, accepted: true,
                }];
            } else {
                if (isReplaceAll) {
                    for (let i = 0; i < newPages.length; i++) {
                        let p = { ...newPages[i] };
                        let searchIdx = 0;
                        while (searchIdx < p.pageData.text.length) {
                            const matchIdx = p.pageData.text.indexOf(text, searchIdx);
                            if (matchIdx === -1) break;
                            const eId = `manual-all-${Date.now()}-${i}-${matchIdx}`;
                            const newE: PIIEntity = {
                                id: eId, type: "id", original: text, replacement: finalReplacement,
                                startIndex: matchIdx, endIndex: matchIdx + text.length, accepted: true,
                            };
                            p.entities = [...p.entities, newE];
                            const newBoxes = getBoundingBoxesForTextRange(p.pageData, matchIdx, matchIdx + text.length);
                            for (const b of newBoxes) {
                                p.boxes = [...p.boxes, {
                                    entityId: eId, x: b.x, y: b.y, width: b.width, height: b.height,
                                    type: "id", accepted: true,
                                }];
                            }
                            searchIdx = matchIdx + text.length;
                        }
                        newPages[i] = p;
                    }
                    toast({ title: "Manual Redaction Added", description: `Redacted all occurrences of "${text.length > 20 ? text.slice(0, 20) + "…" : text}"` });
                    setManualSelection(null);
                    return newPages;
                } else {
                    const newEntity: PIIEntity = {
                        id: newEntityId, type: "id", original: text, replacement: finalReplacement,
                        startIndex, endIndex, accepted: true,
                    };
                    page.entities = [...page.entities, newEntity];
                    page.boxes = [...page.boxes, {
                        entityId: newEntityId, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                        type: "id", accepted: true,
                    }];
                }
            }

            newPages[pageIndex] = page;
            return newPages;
        });

        if (!isReplaceAll) {
            toast({ title: "Manual Redaction Added", description: "Redacted selected area." });
        }
        setManualSelection(null);
    };

    // ── Progress percentage ───────────────────────────────────────────────
    const progressPct = progress
        ? progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
        : 100;

    // ── Selected entity lookup ────────────────────────────────────────────
    let selectedEntity: PIIEntity | null = null;
    if (selectedEntityId) {
        for (const page of pages) {
            const match = page.entities.find(e => e.id === selectedEntityId);
            if (match) { selectedEntity = match; break; }
        }
    }

    return (
        <div className="flex flex-col w-full max-w-6xl mx-auto my-4 h-[calc(100vh-4rem)] min-h-[500px] border rounded-lg shadow-sm bg-background overflow-hidden relative">
            <PDFToolbar
                onBack={onBack}
                onSetAll={setAll}
                onDownload={handleDownload}
                isGenerating={generating}
            />

            <div className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-muted/50 flex-wrap">
                <PIILegend />
            </div>

            {/* ── Inline progress banner — non-blocking, pages stream in below ── */}
            {progress && (
                <div className="border-b bg-background px-6 py-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Lock className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="font-medium text-foreground">{progress.detail}</span>
                        <span className="ml-auto text-xs text-muted-foreground">All processing stays on your device</span>
                    </div>
                    <Progress value={progressPct} className="h-1.5" />
                </div>
            )}

            <div className="flex-1 overflow-auto bg-muted/30 p-4 space-y-6">
                {/* Pages stream in one-by-one as they finish */}
                {pages.map((page, index) => (
                    page.error ? (
                        <div key={index} className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-sm text-destructive">
                            ⚠ {page.error}
                        </div>
                    ) : (
                        <PDFPageViewer
                            key={index}
                            pageIndex={index}
                            pageData={page.pageData}
                            boxes={page.boxes}
                            selectedEntityId={selectedEntityId}
                            onSelectEntity={setSelectedEntityId}
                            dragStart={dragStart}
                            dragCurrent={dragCurrent}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                        />
                    )
                ))}

                {/* Empty state — processing hasn't yielded any pages yet */}
                {pages.length === 0 && progress && (
                    <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
                        <Lock className="h-10 w-10 text-primary opacity-60" />
                        <p className="text-sm">Analyzing your document…</p>
                    </div>
                )}
            </div>

            <EntityDetailPanel
                entity={selectedEntity}
                onUpdateStatus={updateEntity}
            />

            <ManualRedactionDialog
                selection={manualSelection}
                onClose={() => setManualSelection(null)}
                onConfirm={confirmManualRedaction}
                replacementValue={manualReplacement}
                onReplacementChange={setManualReplacement}
                replaceAllValue={replaceAll}
                onReplaceAllChange={setReplaceAll}
            />
        </div>
    );
}
