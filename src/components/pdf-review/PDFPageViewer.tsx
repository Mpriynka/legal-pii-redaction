import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PII_COLORS } from "@/lib/mock-data";
import type { PDFPageData } from "@/lib/pdf-utils";

export interface PDFBox {
    entityId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: string;
    accepted: boolean | null;
}

interface DragState {
    x: number;
    y: number;
    pageIndex: number;
}

interface PDFPageViewerProps {
    pageIndex: number;
    pageData: PDFPageData;
    boxes: PDFBox[];
    selectedEntityId: string | null;
    onSelectEntity: (id: string | null) => void;
    dragStart: DragState | null;
    dragCurrent: { x: number; y: number } | null;
    onMouseDown: (e: React.MouseEvent, pageIndex: number) => void;
    onMouseMove: (e: React.MouseEvent, pageIndex: number) => void;
    onMouseUp: (e: React.MouseEvent, pageIndex: number) => void;
}

export function PDFPageViewer({
    pageIndex,
    pageData,
    boxes,
    selectedEntityId,
    onSelectEntity,
    dragStart,
    dragCurrent,
    onMouseDown,
    onMouseMove,
    onMouseUp,
}: PDFPageViewerProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Attach canvas to DOM cleanly
    useEffect(() => {
        if (containerRef.current && !containerRef.current.hasChildNodes()) {
            pageData.canvas.style.display = 'block';
            containerRef.current.appendChild(pageData.canvas);
        }
    }, [pageData.canvas]);

    return (
        <div
            className="relative shadow-md bg-[white] overflow-hidden mx-auto select-none"
            style={{ width: pageData.viewport.width, height: pageData.viewport.height }}
            onMouseDown={(e) => onMouseDown(e, pageIndex)}
            onMouseMove={(e) => onMouseMove(e, pageIndex)}
            onMouseUp={(e) => onMouseUp(e, pageIndex)}
            onMouseLeave={(e) => onMouseUp(e, pageIndex)}
        >
            {/* Canvas Container */}
            <div ref={containerRef} className="absolute inset-0 z-0 pointer-events-none" />

            {/* Interactive Drag Overlay */}
            <div className="absolute inset-0 z-0 bg-transparent cursor-crosshair" />

            {/* Active Drag Selection Rect */}
            {dragStart && dragCurrent && dragStart.pageIndex === pageIndex && (
                <div
                    className="absolute bg-blue-500/20 border border-blue-500 z-30 pointer-events-none"
                    style={{
                        left: Math.min(dragStart.x, dragCurrent.x),
                        top: Math.min(dragStart.y, dragCurrent.y),
                        width: Math.abs(dragCurrent.x - dragStart.x),
                        height: Math.abs(dragCurrent.y - dragStart.y)
                    }}
                />
            )}

            {/* Box Overlays */}
            <div className="absolute inset-0 z-10 pointer-events-none">
                {boxes.map((box, i) => {
                    // @ts-ignore
                    const colorVar = `--${PII_COLORS[box.type] || 'primary'}`;
                    const isSelected = selectedEntityId === box.entityId;
                    const isRejected = box.accepted === false;

                    return (
                        <div
                            key={`${box.entityId}-${i}`}
                            onClick={() => onSelectEntity(isSelected ? null : box.entityId)}
                            className={cn(
                                "absolute cursor-pointer pointer-events-auto transition-all mix-blend-multiply",
                                isSelected && "ring-2 ring-ring ring-offset-2 z-20",
                                isRejected && "opacity-30 grayscale"
                            )}
                            style={{
                                left: box.x,
                                top: box.y,
                                width: box.width,
                                height: box.height,
                                backgroundColor: `hsl(var(${colorVar}) / 0.4)`,
                                border: `1.5px solid hsl(var(${colorVar}))`
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}
