/**
 * Unified PII detection pipeline: Regex & ML Model
 * Currently separated for debugging purposes. Proper merging logic will be added later.
 */

import { detectWithRegex, type RegexMatch } from "./regex-pii";
import type { PIIEntity, PIIType } from "./mock-data";

let entityCounter = 0;

const TYPE_COUNTERS: Record<string, number> = {};

function nextReplacement(type: PIIType): string {
  const label = type.toUpperCase();
  TYPE_COUNTERS[label] = (TYPE_COUNTERS[label] || 0) + 1;
  return `[${label}_${TYPE_COUNTERS[label]}]`;
}

function resetCounters() {
  entityCounter = 0;
  for (const key of Object.keys(TYPE_COUNTERS)) {
    delete TYPE_COUNTERS[key];
  }
}

/**
 * Check if two spans overlap
 */
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Merge regex and ML results strictly ensuring no overlaps for UI rendering.
 */
function mergeResults(
  regexMatches: RegexMatch[]
): Array<{ type: PIIType; text: string; start: number; end: number; source: "regex" }> {
  const allMatches: Array<{ type: PIIType; text: string; start: number; end: number; source: "regex" }> = [];

  for (const r of regexMatches) {
    if (isNaN(r.start) || isNaN(r.end)) continue;
    allMatches.push({ type: r.type, text: r.text, start: r.start, end: r.end, source: "regex" });
  }

  // Sort primarily by length (descending) to greedily take the longest match
  allMatches.sort((a, b) => {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenA === lenB) {
      return a.start - b.start;
    }
    return lenB - lenA;
  });

  const finalMerged: typeof allMatches = [];
  for (const m of allMatches) {
    const hasOverlap = finalMerged.some((f) => overlaps(f, m));
    if (!hasOverlap) {
      finalMerged.push(m);
    }
  }

  // Finally, put them back into chronological start order
  finalMerged.sort((a, b) => a.start - b.start);
  return finalMerged;
}

export interface PipelineResult {
  entities: PIIEntity[];
  stats: {
    totalCount: number;
    durationMs: number;
  };
}

/**
 * Run the full PII detection pipeline on the given text.
 */
export async function runPipeline(text: string): Promise<PipelineResult> {
  resetCounters();
  const startTime = performance.now();

  // Stage 1: Regex
  const regexMatches = detectWithRegex(text);

  // Create the final merged, non-overlapping entities array for the UI
  const merged = mergeResults(regexMatches);
  const entities: PIIEntity[] = merged.map((m, i) => ({
    id: String(i + 1),
    type: m.type,
    original: m.text,
    replacement: nextReplacement(m.type),
    startIndex: m.start,
    endIndex: m.end,
    accepted: null,
  }));

  const durationMs = Math.round(performance.now() - startTime);

  return {
    entities,
    stats: {
      totalCount: entities.length,
      durationMs,
    },
  };
}
