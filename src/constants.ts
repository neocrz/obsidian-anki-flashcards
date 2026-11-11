/** Stable public IDs. Changing these is a breaking change. */

export const PLUGIN_ID = 'anki-flashcards';

export const VIEW_TYPE = 'anki-flashcards-view';

export const RIBBON_ICON = 'layers';

export const METADATA_MARKER = 'fc-srs';

export const METADATA_VERSION = 1;

export const COMMAND_IDS = {
	open: 'open-flashcards',
	rebuild: 'rebuild-flashcard-index',
} as const;

export const DEFAULT_TAG = 'fc';

export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;
