import { RangeSetBuilder, StateEffect, type Extension } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	type DecorationSet,
	type ViewUpdate,
} from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import { isMetadataLineLike } from '../model/metadata';
import type { FlashcardSettings } from '../settings';

/** Lets the plugin ask existing editors to rebuild their decorations after a settings change. */
const refreshEffect = StateEffect.define<null>();

/** Tiny stand-in for a review-data comment. Clicking it reveals the raw line. */
class MetadataBadgeWidget extends WidgetType {
	toDOM(): HTMLElement {
		return createSpan({
			cls: 'fc-metadata-badge',
			text: 'fc-srs',
			attr: { 'aria-label': 'Anki Flashcards review data. Click to show.' },
		});
	}

	ignoreEvent(): boolean {
		return false;
	}

	eq(): boolean {
		return true;
	}
}

function selectionTouchesLine(view: EditorView, from: number, to: number): boolean {
	return view.state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function buildDecorations(view: EditorView, enabled: boolean): DecorationSet {
	if (!enabled || !view.state.field(editorLivePreviewField, false)) return Decoration.none;

	const builder = new RangeSetBuilder<Decoration>();
	let lastLineStart = -1;

	for (const { from, to } of view.visibleRanges) {
		let pos = from;
		while (pos <= to) {
			const line = view.state.doc.lineAt(pos);
			if (line.from > lastLineStart) {
				if (
					line.to > line.from &&
					isMetadataLineLike(line.text) &&
					!selectionTouchesLine(view, line.from, line.to)
				) {
					builder.add(
						line.from,
						line.to,
						Decoration.replace({ widget: new MetadataBadgeWidget() }),
					);
				}
				lastLineStart = line.from;
			}
			if (line.to >= to) break;
			pos = line.to + 1;
		}
	}

	return builder.finish();
}

/**
 * Collapse this plugin's hidden `fc-srs` comments to a small badge.
 *
 * Only lines recognised by `isMetadataLineLike()` are affected, so other HTML
 * comments render normally. Source mode is untouched, and the raw line comes
 * back while the cursor or a selection is on it.
 */
export function metadataLineDecorations(getSettings: () => FlashcardSettings): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, getSettings().compactReviewData);
			}

			update(update: ViewUpdate): void {
				this.decorations = buildDecorations(update.view, getSettings().compactReviewData);
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}

/** Re-decorate all open Live Preview editors, e.g. after the toggle changes. */
export function refreshMetadataDecorations(): void {
	for (const element of activeDocument.querySelectorAll('.cm-editor')) {
		if (!element.instanceOf(HTMLElement)) continue;
		const view = EditorView.findFromDOM(element);
		if (!view) continue;
		view.dispatch({ effects: refreshEffect.of(null) });
	}
}
