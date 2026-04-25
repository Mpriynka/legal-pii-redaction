/**
 * Regex-based PII detection — Stage 1 of the pipeline.
 * Fast pattern matching for well-structured PII patterns.
 */

import type { PIIType } from "./mock-data";

export interface RegexMatch {
  type: PIIType;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

const PATTERNS: { type: PIIType; pattern: RegExp; confidence: number }[] = [
  // Person Names with prefixes (Shri, Mr, Mrs, Ms)
  { type: "name" as PIIType, pattern: /\b(?:Shri|Mr|Mrs|Ms)\.?\s+[A-Za-z\s]+\b/gi, confidence: 0.95 },
  // Company Names (M/s. ...)
  { type: "organization" as PIIType, pattern: /\bM\/s\.?[ A-Za-z0-9.,&'-]+/gi, confidence: 0.95 },
  // LOP / File References
  { type: "id", pattern: /\b(?:\d+\(\d+\)\/)?SEEPZ\/EOU\/[\w\/]+\b/gi, confidence: 0.95 },
  // Addresses / Plot Nos
  { type: "location" as PIIType, pattern: /\b(?:Plot No|Survey No|Phase|Unit No)[ A-Za-z0-9.,-]+(?:\b|$)/gi, confidence: 0.85 },
  // Pincodes (Indian 6-digit)
  { type: "location" as PIIType, pattern: /\b\d{6}\b/g, confidence: 0.9 },
  // Dates (DD.MM.YYYY or DD/MM/YYYY)
  { type: "date", pattern: /\b\d{2}[./-]\d{2}[./-]\d{4}\b/g, confidence: 0.95 },
  // Email
  { type: "email", pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, confidence: 0.95 },
  // Phone Indian
  { type: "phone", pattern: /\b(?:\+?91[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, confidence: 0.9 },
  // PAN Card
  { type: "id", pattern: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g, confidence: 0.9 },
  // IEC Code (usually 10 digits)
  { type: "id", pattern: /\b\d{10}\b/g, confidence: 0.8 },
];

export function detectWithRegex(text: string): RegexMatch[] {
  const results: RegexMatch[] = [];

  for (const { type, pattern, confidence } of PATTERNS) {
    // Reset lastIndex for each run
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      results.push({
        type,
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence,
      });
    }
  }

  // Sort by start index
  results.sort((a, b) => a.start - b.start);
  return results;
}
