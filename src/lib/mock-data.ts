/**
 * Defines the supported types of Personally Identifiable Information (PII).
 */
export type PIIType = "name" | "email" | "phone" | "ssn" | "address" | "date" | "financial" | "id" | "organization" | "location";

/**
 * Represents a detected PII entity within a document.
 */
export interface PIIEntity {
  /** Unique identifier for the entity instance. */
  id: string;
  /** The category of PII detected. */
  type: PIIType;
  /** The exact string that was detected in the original text. */
  original: string;
  /** The string to replace the original text with. */
  replacement: string;
  /** The starting character index in the original text. */
  startIndex: number;
  /** The ending character index in the original text (exclusive). */
  endIndex: number;
  /** Null indicates pending review, true indicates accepted redaction, false indicates rejected. */
  accepted: boolean | null;
}

/**
 * Maps PIIType categories to corresponding CSS color variables used for highlighting.
 */
export const PII_COLORS: Record<PIIType, string> = {
  name: "pii-name",
  email: "pii-email",
  phone: "pii-phone",
  ssn: "pii-ssn",
  address: "pii-address",
  date: "pii-date",
  financial: "pii-financial",
  id: "pii-id",
  organization: "pii-name",
  location: "pii-address",
};

export const PII_LABELS: Record<PIIType, string> = {
  name: "Person Name",
  email: "Email Address",
  phone: "Phone Number",
  ssn: "SSN",
  address: "Address",
  date: "Date / Time",
  financial: "Financial",
  id: "Identifier",
  organization: "Organization",
  location: "Location",
};

export const SAMPLE_TEXT = `Dear Mr. John Smith,

Thank you for your application dated March 15, 1990. We have reviewed your submission and would like to schedule a follow-up interview.

Your contact information on file:
- Email: john.smith@example.com
- Phone: (555) 123-4567
- SSN: 123-45-6789
- Address: 1234 Oak Street, Springfield, IL 62701

We also received the reference from Jane Doe (jane.doe@company.org, (555) 987-6543) and Michael Johnson at michael.j@enterprise.net.

Please confirm your availability by contacting our HR department at hr@corporation.com or calling (555) 000-1111.

Best regards,
Sarah Williams
Human Resources Director`;

export const SAMPLE_ENTITIES: PIIEntity[] = [
  { id: "1", type: "name", original: "John Smith", replacement: "[NAME_1]", startIndex: 9, endIndex: 19, accepted: null },
  { id: "2", type: "date", original: "March 15, 1990", replacement: "[DATE_1]", startIndex: 64, endIndex: 78, accepted: null },
  { id: "3", type: "email", original: "john.smith@example.com", replacement: "[EMAIL_1]", startIndex: 189, endIndex: 211, accepted: null },
  { id: "4", type: "phone", original: "(555) 123-4567", replacement: "[PHONE_1]", startIndex: 221, endIndex: 235, accepted: null },
  { id: "5", type: "ssn", original: "123-45-6789", replacement: "[SSN_1]", startIndex: 243, endIndex: 254, accepted: null },
  { id: "6", type: "address", original: "1234 Oak Street, Springfield, IL 62701", replacement: "[ADDRESS_1]", startIndex: 267, endIndex: 305, accepted: null },
  { id: "7", type: "name", original: "Jane Doe", replacement: "[NAME_2]", startIndex: 340, endIndex: 348, accepted: null },
  { id: "8", type: "email", original: "jane.doe@company.org", replacement: "[EMAIL_2]", startIndex: 350, endIndex: 370, accepted: null },
  { id: "9", type: "phone", original: "(555) 987-6543", replacement: "[PHONE_2]", startIndex: 372, endIndex: 386, accepted: null },
  { id: "10", type: "name", original: "Michael Johnson", replacement: "[NAME_3]", startIndex: 392, endIndex: 407, accepted: null },
  { id: "11", type: "email", original: "michael.j@enterprise.net", replacement: "[EMAIL_3]", startIndex: 411, endIndex: 435, accepted: null },
  { id: "12", type: "email", original: "hr@corporation.com", replacement: "[EMAIL_4]", startIndex: 507, endIndex: 525, accepted: null },
  { id: "13", type: "phone", original: "(555) 000-1111", replacement: "[PHONE_3]", startIndex: 537, endIndex: 551, accepted: null },
  { id: "14", type: "name", original: "Sarah Williams", replacement: "[NAME_4]", startIndex: 570, endIndex: 584, accepted: null },
];

/**
 * Applies the accepted PII entity replacements to the provided text.
 * Ensures consistent masking replacements for identical strings by grouping them.
 * 
 * @param text The original document text.
 * @param entities The array of detected PII entities.
 * @returns The final string with approved redactions applied.
 */
export function getRedactedText(text: string, entities: PIIEntity[]): string {
  let result = text;

  // Create a mapping to ensure identical strings receive consistent masking placeholders
  const entityMaskMap = new Map<string, string>();

  // Use a regex to extract full words that contain the detected entity so sub-word tokenization doesn't break consistency.
  // Example: If ML tokenizes "Priyanka" as "Pri", "yanka", both should map back to the parent word "Priyanka"
  const getFullWord = (original_text: string, startIndex: number, endIndex: number) => {
    // Find previous space or start of string
    let wordStart = startIndex;
    while (wordStart > 0 && /\S/.test(original_text[wordStart - 1])) {
      wordStart--;
    }
    // Find next space or end of string
    let wordEnd = endIndex;
    while (wordEnd < original_text.length && /\S/.test(original_text[wordEnd])) {
      wordEnd++;
    }
    return original_text.substring(wordStart, wordEnd).toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  // Sort by startIndex descending so replacements don't mess up indices
  const sorted = [...entities]
    .filter((e) => e.accepted !== false)
    .sort((a, b) => b.startIndex - a.startIndex);

  for (const entity of sorted) {
    const parentWord = getFullWord(text, entity.startIndex, entity.endIndex);

    // If we haven't seen this specific entity text before, assign it the current replacement mask
    if (!entityMaskMap.has(parentWord)) {
      entityMaskMap.set(parentWord, entity.replacement);
    }

    // Fetch the standardized mask from our map for insertion
    const consistentMask = entityMaskMap.get(parentWord)!;

    result = result.slice(0, entity.startIndex) + consistentMask + result.slice(entity.endIndex);
  }
  return result;
}
