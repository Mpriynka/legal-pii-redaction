/**
 * ocr-utils.ts
 *
 * Lazy-loaded OCR via Tesseract.js.
 * The worker is created on first call only — never loaded for normal searchable PDFs.
 *
 * Design: mirrors the MappedTextItem pattern from pdf-utils.ts so that
 * getOCRBoxesForRange can do precise character-index-based bbox lookup,
 * exactly the same way getBoundingBoxesForTextRange does for searchable PDFs.
 */

/** One OCR word with its character span in the assembled page text */
export interface OcrMappedWord {
    /** start character offset in OcrResult.text */
    start: number;
    /** end character offset in OcrResult.text (exclusive) */
    end: number;
    /** raw word string as returned by Tesseract */
    text: string;
    /** bounding box in canvas pixel coordinates (at the scale the canvas was rendered) */
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface OcrResult {
    /** Full page text with words joined by spaces and lines by newlines */
    text: string;
    /** Words with char offsets that index into .text */
    words: OcrMappedWord[];
}

// Singleton worker — created once and reused across pages
let workerPromise: Promise<import('tesseract.js').Worker> | null = null;

async function getWorker(): Promise<import('tesseract.js').Worker> {
    if (!workerPromise) {
        workerPromise = (async () => {
            const Tesseract = await import('tesseract.js');
            const worker = await Tesseract.createWorker('eng', 1, {
                logger: () => { },  // suppress verbose progress logs
            });
            return worker;
        })();
    }
    return workerPromise;
}

/**
 * Run OCR on a canvas element.
 *
 * Returns the assembled page text AND a list of words with their character
 * offsets into that text, so callers can go from a PII entity's
 * (startIndex, endIndex) span straight to pixel bboxes.
 */
export async function runOCR(canvas: HTMLCanvasElement): Promise<OcrResult> {
    const worker = await getWorker();

    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });

    const mappedWords: OcrMappedWord[] = [];
    let assembledText = '';

    // Traverse block → paragraph → line → word and build char-indexed word list.
    // We replicate Tesseract's whitespace structure: words within a line are
    // space-separated, lines within a paragraph are newline-separated.
    if (data.blocks) {
        for (const block of data.blocks) {
            for (const para of block.paragraphs) {
                for (const line of para.lines) {
                    for (let wi = 0; wi < line.words.length; wi++) {
                        const word = line.words[wi];
                        const wordText = word.text;
                        if (!wordText.trim()) continue;

                        // Add inter-word space (not before first word on a line)
                        if (wi > 0 && assembledText.length > 0 && !assembledText.endsWith('\n')) {
                            assembledText += ' ';
                        }

                        const start = assembledText.length;
                        assembledText += wordText;
                        const end = assembledText.length;

                        const { x0, y0, x1, y1 } = word.bbox;
                        mappedWords.push({
                            start,
                            end,
                            text: wordText,
                            x: x0,
                            y: y0,
                            width: x1 - x0,
                            height: y1 - y0,
                        });
                    }
                    // Newline between lines
                    if (assembledText.length > 0 && !assembledText.endsWith('\n')) {
                        assembledText += '\n';
                    }
                }
            }
        }
    }

    return { text: assembledText, words: mappedWords };
}

/**
 * Find bounding boxes for a character range [startIndex, endIndex) in the
 * OCR assembled text.  Mirrors getBoundingBoxesForTextRange from pdf-utils.ts.
 *
 * All returned coordinates are in canvas pixel space (the same resolution
 * the canvas was rendered at, typically 2× the PDF page size).
 */
export function getOCRBoxesForRange(
    ocrResult: OcrResult,
    startIndex: number,
    endIndex: number
): { x: number; y: number; width: number; height: number }[] {
    const boxes: { x: number; y: number; width: number; height: number }[] = [];

    for (const word of ocrResult.words) {
        // A word overlaps the range if its span intersects [startIndex, endIndex)
        if (startIndex < word.end && endIndex > word.start) {
            boxes.push({ x: word.x, y: word.y, width: word.width, height: word.height });
        }
    }

    return boxes;
}

/**
 * Terminate the shared Tesseract worker and free memory.
 * Called from the useEffect cleanup in PDFRedactionReview.
 */
export async function terminateOCRWorker(): Promise<void> {
    if (workerPromise) {
        try {
            const worker = await workerPromise;
            await worker.terminate();
        } catch {
            // ignore termination errors
        } finally {
            workerPromise = null;
        }
    }
}
