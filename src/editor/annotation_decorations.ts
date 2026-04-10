import { ViewPlugin, DecorationSet, Decoration, ViewUpdate, EditorView } from '@codemirror/view';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import { parseAnnotations } from './annotation_parser';

/**
 * Dispatch this effect on an EditorView to force annotation decorations to rebuild.
 * Used when vault.modify() may not synchronously trigger docChanged in the CM6 view.
 */
export const forceAnnotationRefresh = StateEffect.define<null>();

/**
 * CM6 ViewPlugin that highlights annotated text in the editor.
 * Scans the document for annotation targets and marks them with a CSS class.
 * Re-runs on every document change (incrementally).
 */
export const annotationHighlightPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            const hasForceRefresh = update.transactions.some(
                tr => tr.effects.some(e => e.is(forceAnnotationRefresh))
            );
            if (update.docChanged || update.viewportChanged || hasForceRefresh) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const builder = new RangeSetBuilder<Decoration>();
            const docText = view.state.doc.toString();
            const { annotations, blockStart } = parseAnnotations(docText);

            // Only highlight local annotations with a non-empty target
            const localAnnotations = annotations.filter(a => a.type === 'local' && a.target.length > 0);

            if (localAnnotations.length === 0) {
                return builder.finish();
            }

            // Find all target occurrences in the document (excluding the annotation block itself)
            const searchableText = blockStart > -1 ? docText.substring(0, blockStart) : docText;

            // Collect all ranges first, then sort by position
            const ranges: Array<{ from: number; to: number; annId: string }> = [];

            for (const ann of localAnnotations) {
                let searchFrom = 0;
                while (true) {
                    const idx = searchableText.indexOf(ann.target, searchFrom);
                    if (idx === -1) break;
                    ranges.push({ from: idx, to: idx + ann.target.length, annId: ann.id });
                    searchFrom = idx + 1;
                }
            }

            // Sort by start position (required by RangeSetBuilder)
            ranges.sort((a, b) => a.from - b.from);

            for (const range of ranges) {
                builder.add(
                    range.from,
                    range.to,
                    Decoration.mark({
                        class: 'voyaru-annotation-highlight',
                        attributes: { 'data-ann-id': range.annId }
                    })
                );
            }

            return builder.finish();
        }
    },
    { decorations: v => v.decorations }
);

/**
 * Returns the CM6 extensions to register for annotation highlighting.
 */
export function getAnnotationExtensions() {
    return [annotationHighlightPlugin];
}
