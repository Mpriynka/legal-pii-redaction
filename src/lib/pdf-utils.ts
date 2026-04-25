import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { PDFDocument, rgb } from 'pdf-lib';

// Set worker to the locally installed build via unpkg to avoid Vite worker build issues
// Note: We use the exact version matched with the installed package
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface MappedTextItem {
    start: number;
    end: number;
    str: string;
    item: TextItem;
}

export interface PDFPageData {
    pageIndex: number;
    viewport: pdfjsLib.PageViewport;
    text: string;
    items: MappedTextItem[];
    canvas: HTMLCanvasElement;
}

/**
 * Heuristic: returns true when a page has essentially no embedded text,
 * which strongly indicates the page is a scanned image rather than a
 * searchable PDF. Threshold is 10 non-whitespace characters.
 */
export function isScannedPage(text: string): boolean {
    return text.replace(/\s/g, '').length < 10;
}

/**
 * Loads a PDF document from a File object
 */
export async function loadPDF(file: File): Promise<pdfjsLib.PDFDocumentProxy> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    return loadingTask.promise;
}

/**
 * Extracts text and renders the canvas for a specific page
 */
export async function getPageData(
    pdf: pdfjsLib.PDFDocumentProxy,
    pageIndex: number,
    scale = 2.0 // Render at 2x for better image quality
): Promise<PDFPageData> {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale });

    // 1. Render to Canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport } as any).promise;

    // 2. Extract Text Items
    const textContent = await page.getTextContent();
    let text = '';
    const items: MappedTextItem[] = [];

    let lastY: number | null = null;
    let lastX: number | null = null;
    let lastWidth: number | null = null;

    for (const textItem of textContent.items) {
        if (!('str' in textItem)) continue;

        // Heuristic gap detection for spaces and formatting
        if (lastY !== null && Math.abs(textItem.transform[5] - lastY) > textItem.height / 2) {
            if (!text.endsWith('\n')) text += '\n';
        } else if (lastX !== null && lastWidth !== null) {
            // transform[4] is the X coordinate
            const gap = Math.abs(textItem.transform[4] - (lastX + lastWidth));
            // If gap is large enough, assume a space
            if (gap > (textItem.height / 4) && !text.endsWith(' ') && textItem.str.trim() !== '') {
                text += ' ';
            }
        }

        const start = text.length;
        text += textItem.str;
        const end = text.length;

        items.push({ start, end, str: textItem.str, item: textItem });

        lastX = textItem.transform[4];
        lastY = textItem.transform[5];
        lastWidth = textItem.width;
    }

    return {
        pageIndex,
        viewport,
        text,
        items,
        canvas
    };
}

/**
 * Finds the bounding boxes for a given start and end character index in the parsed page text.
 * Returns boxes in Viewport coordinates (Pixels based on scale)
 */
export function getBoundingBoxesForTextRange(
    pageData: PDFPageData,
    startIndex: number,
    endIndex: number
): { x: number; y: number; width: number; height: number }[] {
    const boxes: { x: number; y: number; width: number; height: number }[] = [];

    for (const mapped of pageData.items) {
        // Check if the item overlaps with the requested range
        if (startIndex < mapped.end && endIndex > mapped.start) {
            const { item } = mapped;

            // Calculate Viewport coordinates
            // transform: [scaleX, skewY, skewX, scaleY, tx, ty]
            const tx = pdfjsLib.Util.transform(pageData.viewport.transform, item.transform);

            // tx[4] is X
            // tx[5] is Baseline Y
            const x = tx[4];
            const y = tx[5];

            // To get the top-left Y, we subtract the text height (approximate from scaleY tx[3])
            const height = Math.abs(tx[3]) || item.height * pageData.viewport.scale;
            const topLeftY = y - height;

            // item.width is in text unscaled coords if we didn't use viewport transform fully, 
            // but usually scaling is included in item.transform -> viewport.transform.
            // Easiest is to scale item.width by viewport.scale, or use Math.abs(tx[0]) width ratio.
            const width = item.width * pageData.viewport.scale;

            boxes.push({
                x,
                y: topLeftY,
                width,
                height
            });
        }
    }

    return boxes;
}

/**
 * Generates a final PDF where the background is perfectly flattened images 
 * of the canvas, with black redaction boxes drawn over it.
 */
export async function generateRedactedPDF(
    pagesData: { pageData: PDFPageData; redactionBoxes: { x: number; y: number; width: number; height: number }[] }[]
): Promise<Blob> {
    const doc = await PDFDocument.create();

    for (const { pageData, redactionBoxes } of pagesData) {
        const { canvas, viewport } = pageData;

        // We draw redactions directly on the canvas BEFORE converting it to an image.
        // This is Option A: true flattening.
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'black';
        for (const box of redactionBoxes) {
            // Add a slight padding to the box to ensure full coverage
            const padding = 2;
            ctx.fillRect(box.x - padding, box.y - padding, box.width + (padding * 2), box.height + (padding * 2));
        }

        // Convert canvas to image bytes
        // For large documents, we might use JPEG to save space. 
        // Using high quality (0.95).
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const imageBytes = await fetch(imageDataUrl).then(res => res.arrayBuffer());

        const pdfImage = await doc.embedJpg(imageBytes);

        // Add a page matching the canvas dimensions (which are scaled)
        const page = doc.addPage([canvas.width, canvas.height]);

        // Draw the entire image covering the page
        page.drawImage(pdfImage, {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
        });
    }

    const pdfBytes = await doc.save();
    return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
}
