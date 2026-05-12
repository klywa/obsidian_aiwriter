/**
 * Parses Voyaru annotation blocks from document text.
 *
 * Annotation block format (at end of file):
 *   %%voyaru-annotations
 *   @ann|id:ann-1|type:local|target:original text|suggestion text
 *   @ann|id:ann-2|type:global|target:|global suggestion
 *   %%
 */

export interface Annotation {
    id: string;
    type: 'local' | 'global';
    target: string;       // Empty string for global annotations
    suggestion: string;
    lineIndex: number;    // Line index within the annotation block (for editing)
}

export interface ParsedAnnotations {
    annotations: Annotation[];
    blockStart: number;   // Character offset where %%voyaru-annotations starts
    blockEnd: number;     // Character offset where closing %% ends
    hasBlock: boolean;
}

const BLOCK_START_MARKER = '%%voyaru-annotations';
const BLOCK_END_MARKER = '%%';

/** Escape newlines and backslashes so a value fits on a single annotation line. */
function escapeField(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

/** Reverse escapeField. */
function unescapeField(value: string): string {
    let result = '';
    for (let i = 0; i < value.length; i++) {
        if (value[i] === '\\' && i + 1 < value.length) {
            const next = value[i + 1];
            if (next === 'n') { result += '\n'; i++; continue; }
            if (next === 'r') { result += '\r'; i++; continue; }
            if (next === '\\') { result += '\\'; i++; continue; }
        }
        result += value[i];
    }
    return result;
}

/**
 * Parse all annotations from document text.
 * Returns empty result if no annotation block is found.
 */
export function parseAnnotations(docText: string): ParsedAnnotations {
    const empty: ParsedAnnotations = {
        annotations: [],
        blockStart: -1,
        blockEnd: -1,
        hasBlock: false
    };

    const blockStartIdx = docText.indexOf(BLOCK_START_MARKER);
    if (blockStartIdx === -1) return empty;

    // Find the closing %% AFTER the opening marker
    const afterMarker = blockStartIdx + BLOCK_START_MARKER.length;
    const blockEndIdx = docText.indexOf('\n' + BLOCK_END_MARKER, afterMarker);
    if (blockEndIdx === -1) return empty;

    const blockEnd = blockEndIdx + 1 + BLOCK_END_MARKER.length; // include trailing %%
    const blockContent = docText.substring(afterMarker, blockEndIdx);
    const lines = blockContent.split('\n').filter(l => l.trim().length > 0);

    const annotations: Annotation[] = [];
    let lineIndex = 0;

    for (const line of lines) {
        if (!line.startsWith('@ann|')) {
            lineIndex++;
            continue; // Skip malformed lines silently
        }

        try {
            // Format: @ann|id:X|type:Y|target:Z|suggestion text
            const withoutPrefix = line.substring('@ann|'.length);
            // Split on | but the last segment (suggestion) may contain |
            // Parse named fields until we hit an unnamed segment
            const segments = withoutPrefix.split('|');
            const fields: Record<string, string> = {};
            let suggestionParts: string[] = [];
            let inSuggestion = false;

            for (const seg of segments) {
                if (inSuggestion) {
                    suggestionParts.push(seg);
                    continue;
                }
                const colonIdx = seg.indexOf(':');
                if (colonIdx === -1) {
                    // No colon — this and remaining segments are the suggestion
                    suggestionParts.push(seg);
                    inSuggestion = true;
                } else {
                    const key = seg.substring(0, colonIdx);
                    const val = seg.substring(colonIdx + 1);
                    if (['id', 'type', 'target'].includes(key)) {
                        fields[key] = val;
                    } else {
                        // Not a known key — treat as start of suggestion
                        suggestionParts.push(seg);
                        inSuggestion = true;
                    }
                }
            }

            const id = fields['id'] || `ann-${Date.now()}-${lineIndex}`;
            const type = fields['type'] === 'global' ? 'global' : 'local';
            const target = unescapeField(fields['target'] || '');
            const suggestion = unescapeField(suggestionParts.join('|'));

            if (suggestion) {
                annotations.push({ id, type, target, suggestion, lineIndex });
            }
        } catch (e) {
            // Skip malformed annotation lines
            console.warn('[AnnotationParser] Skipping malformed annotation line:', line);
        }

        lineIndex++;
    }

    return {
        annotations,
        blockStart: blockStartIdx,
        blockEnd,
        hasBlock: true
    };
}

/**
 * Serialize a single annotation to a single line in the block.
 * Newlines in target/suggestion are escaped so each annotation fits on one line.
 */
export function serializeAnnotation(ann: Annotation): string {
    return `@ann|id:${ann.id}|type:${ann.type}|target:${escapeField(ann.target)}|${escapeField(ann.suggestion)}`;
}

/**
 * Write the annotation block into document text.
 * Replaces existing block or appends at end.
 */
export function writeAnnotationBlock(docText: string, annotations: Annotation[]): string {
    const parsed = parseAnnotations(docText);
    const lines = annotations.map(serializeAnnotation).join('\n');
    const block = annotations.length > 0
        ? `\n\n${BLOCK_START_MARKER}\n${lines}\n${BLOCK_END_MARKER}`
        : '';

    if (parsed.hasBlock) {
        // Replace existing block (trim the preceding \n\n as well)
        const beforeBlock = docText.substring(0, parsed.blockStart).replace(/\n+$/, '');
        const afterBlock = docText.substring(parsed.blockEnd);
        return beforeBlock + block + afterBlock;
    } else {
        return docText.replace(/\n+$/, '') + block;
    }
}

/**
 * Add a single annotation to document text.
 */
export function addAnnotationToText(
    docText: string,
    type: 'local' | 'global',
    target: string,
    suggestion: string
): string {
    const parsed = parseAnnotations(docText);
    const newAnn: Annotation = {
        id: `ann-${Date.now()}`,
        type,
        target,
        suggestion,
        lineIndex: parsed.annotations.length
    };
    return writeAnnotationBlock(docText, [...parsed.annotations, newAnn]);
}

/**
 * Remove an annotation by id from document text.
 */
export function removeAnnotationFromText(docText: string, annotationId: string): string {
    const parsed = parseAnnotations(docText);
    const remaining = parsed.annotations.filter(a => a.id !== annotationId);
    return writeAnnotationBlock(docText, remaining);
}
