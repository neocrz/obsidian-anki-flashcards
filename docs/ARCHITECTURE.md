# Architecture

## Goals

1. **Notes are the source of truth.** Schedules must be recoverable by reading notes; no separate
   card database.
2. **Anki-faithful scheduling.** The state machine and formulas are isolated in pure modules so they
   can be compared against Anki and tested without Obsidian.
3. **Small, replaceable modules.** Humans and AI agents should be able to change one layer without
   understanding the whole plugin.
4. **Safe writes.** File writes are atomic relative to Obsidian's `vault.process()` and preserve
   unknown metadata.

## Layer diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Obsidian shell                                                      │
│  main.ts  ── ribbon, commands, vault/metadata events, settings      │
│      │                                                              │
│      ├── ui/flashcard-view.ts ── deck browser ↔ review screen        │
│      │        │                                                     │
│      │        ├── ui/deck-browser.ts                                │
│      │        ├── ui/review-screen.ts                               │
│      │        └── ui/settings-tab.ts                                │
│      │                                                              │
│      └── data/card-store.ts ── index, answer flow, events            │
│               │                                                     │
│               ├── data/note-writer.ts ── vault.process()             │
│               ├── model/parser.ts                                    │
│               ├── model/metadata.ts                                  │
│               ├── model/tags.ts                                      │
│               ├── model/deck.ts                                      │
│               └── scheduling/scheduler.ts, queue.ts                 │
└─────────────────────────────────────────────────────────────────────┘
                         pure, no `obsidian` imports
┌─────────────────────────────────────────────────────────────────────┐
│ model/*  scheduling/*  utils/*                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Domain model

```ts
type CardState = 'new' | 'learning' | 'review' | 'relearning';
type CardDirection = 'forward' | 'reverse'; // stored as fwd/rev
type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

interface Schedule {
	due: string; // ISO timestamp
	state: CardState;
	step: number; // learning/relearning step index
	intervalDays: number; // review interval in days; 0 while learning
	ease: number; // permille, 2500 = 250%
	reps: number;
	lapses: number;
	introduced?: string; // first answer timestamp
	lastReviewed?: string;
	reviewsToday: number; // review-state answers today
	reviewDay?: string; // local YYYY-MM-DD for reviewsToday
	leech?: boolean;
	suspended?: boolean;
}

interface Flashcard {
	id: string; // `${filePath}::${blockId}::${direction}`
	blockId: string; // persisted in metadata once written
	filePath: string;
	deckPath: string; // '' = root deck, 'a/b' = nested
	direction: CardDirection;
	kind: 'inline' | 'multiline';
	twoWay: boolean;
	front: string;
	back: string;
	schedule: Schedule;
	order: number;
	lineStart: number;
	lineEnd: number;
	metadataLine?: number;
	rawMetadata?: NoteMetadataData;
}
```

`order` is the card's order in the note (forward then reverse per block). Line numbers are a snapshot
from the last parse; writes always re-parse before acting, so stale line numbers are harmless.

## Indexing

`CardStore.initialize()`:

1. Enumerates `app.vault.getMarkdownFiles()`.
2. Uses `metadataCache.getFileCache(file)?.tags` to find files with the configured base tag. Files
   without a matching tag (and without a content fallback) are skipped without reading.
3. Reads candidate files with `cachedRead()` and resolves the most specific deck tag.
4. Calls `parseNote()` and stores cards in `Map<id, Flashcard>` plus `Map<filePath, id[]>`.
5. Emits a `changed` event.

Vault events (`create`, `modify`, `delete`, `rename`) and `metadataCache` changes are debounced. The
index is rebuilt on demand after a base-tag change. Initial indexing starts after
`workspace.onLayoutReady` and is lazily awaited by the view.

## Answer flow

1. View calls `store.answer(cardId, rating)`.
2. Store reads current settings, builds a scheduler config, and calls
   `scheduleAnswer(schedule, rating, now, config, card.id)`.
3. `note-writer.updateNoteSchedule()` re-parses the note, finds the card by block ID, merges the new
   direction record into the existing metadata object, serializes it, and inserts/replaces the
   hidden line.
4. `vault.process()` guarantees the read-modify-write is serialized with other Obsidian writes.
5. Store re-indexes the file, emits `changed`, and returns the updated card.
6. View removes the card from the session if it graduated to a day-scale interval, or keeps it if it
   is waiting on a learning step.

If the write fails, the view catches the error, shows a notice, and leaves the card on screen. The
schedule is never advanced only in memory.

## Session order

`StudySession` receives a deck subtree and builds a pending set:

- all non-suspended learning/relearning cards (due or waiting),
- due review cards, capped by the remaining daily review limit,
- new cards, capped by the remaining daily new limit.

`pick()` returns the earliest due learning card, then due review cards, then new cards. If nothing is
due, it returns `nextDue` so the view can show a countdown. Card states are read from the store after
each answer, so no duplicate copy of scheduling state exists.

## Writes and conflict handling

- All writes go through `vault.process()`, never `vault.modify()`.
- `updateNoteSchedule()` re-parses the file it is about to edit. It matches by block ID, then by
  content + direction. It does not fall back to line/order matching, so a replaced card causes a
  safe failure instead of writing to the wrong card.
- If no match is found, it throws and the store does not update the index. This protects against
  deleting or editing the wrong card while a review is open.
- Existing metadata keys are preserved. `id` is written on the first review.
- EOL style is detected and preserved (`\r\n` vs `\n`).

## UI structure

`FlashcardView` is a single `ItemView` with two modes:

- **Deck browser:** deck tree with new/learning/review counts, study buttons, limits footer, empty
  state with syntax help.
- **Review:** one card at a time, show-answer toggle, four rating buttons with interval previews,
  keyboard shortcuts, schedule info, completion/countdown screen.

The view subscribes to `CardStore` events for deck-browser refreshes. Review sessions do not re-render
on unrelated file changes; the current card stays stable. Timers are cleared in `onClose`.

### Review-data lines in the editor

`ui/metadata-decorations.ts` registers a CodeMirror `ViewPlugin` that replaces lines recognised by
`isMetadataLineLike()` (the plugin's own `<!-- fc-srs ... -->` comments) with a tiny badge while in
Live Preview. Other HTML comments and Source mode are untouched. When the cursor or a selection
touches the line, the raw comment is shown again so it stays editable. The `compactReviewData`
setting (default on) turns this off; `refreshMetadataDecorations()` makes open editors rebuild after
a settings change. The line itself is never modified, so parsing and writes are unaffected.

## Extension points

- **New syntax:** add to `model/parser.ts` and `docs/PARSING.md`, then tests.
- **New scheduler behavior:** add to `scheduling/scheduler.ts`, previews, and tests; keep the note
  format backward compatible.
- **New data fields:** add optional fields to `Schedule`/metadata, parse tolerantly, serialize only
  when set, and update `docs/PARSING.md`.
- **New UI:** keep rendering functions free of scheduling math; read from `CardStore` and pure
  helpers.

## Deliberate scope boundaries (v0.1)

- No undo, card browser, search, statistics graphs, or syncing.
- No sibling burying or custom study/filtered decks.
- Review due times are exact timestamps; Anki's day rollover setting is not implemented yet.
- FSRS is documented as future work, not implemented.
- A note belongs to one deck (its most specific tag); per-card deck overrides are not implemented.
