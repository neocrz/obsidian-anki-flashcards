# AGENTS.md — working on Anki Flashcards

This file is the shared operating manual for humans and AI agents. Read it before changing code.
`refs/` contains upstream examples and algorithm notes. It is intentionally gitignored and **must
not** be imported, copied wholesale, or treated as part of the build.

## Project overview

- **What it is:** an Obsidian community plugin that turns tagged note content into Anki-style
  spaced-repetition flashcards.
- **Target:** TypeScript → bundled CommonJS `main.js`, loaded by Obsidian.
- **Release artifacts:** `main.js`, `manifest.json`, optional `styles.css`.
- **Source of truth for schedules:** a hidden metadata line in the note, immediately below each
  card block. Reviewing a card rewrites that line. There is no separate database.
- **Package manager:** npm. **Bundler:** esbuild. **Tests:** Vitest. **Lint/format:** ESLint +
  Prettier.

## Requirements and commands

Node.js 22+ and npm are required. The repository was bootstrapped with Node 26.

```bash
npm install          # install dependencies
npm run dev          # esbuild watch mode (no typecheck)
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run test:watch   # vitest watch mode
npm run lint         # eslint .
npm run format       # prettier --write .
npm run validate     # typecheck + lint + format check + tests + production build
npm run build        # typecheck + production bundle
```

`npm run build` writes `main.js` at the project root. Copy `main.js`, `manifest.json`, and
`styles.css` into `<Vault>/.obsidian/plugins/anki-flashcards/` for manual testing. Never commit
`main.js`, `node_modules/`, coverage output, or `refs/`.

## Architecture at a glance

```
src/main.ts                     plugin lifecycle, ribbon, commands, vault events
src/settings.ts                 settings shape + defaults + validation helpers
src/constants.ts                stable IDs, metadata marker, limits
src/types.ts                    shared domain types

src/model/tags.ts               base-tag/subtag → deck path resolution
src/model/parser.ts             note text → cards (pure, no Obsidian imports)
src/model/metadata.ts           hidden review-data line parse/serialize/merge (pure)
src/model/deck.ts               deck tree + due/new/review counts (pure)
src/model/hash.ts               deterministic block IDs (pure)

src/scheduling/steps.ts         "1m 10m" step parsing and duration formatting (pure)
src/scheduling/fuzz.ts          deterministic interval fuzzing (pure)
src/scheduling/scheduler.ts     Anki SM-2 state machine and previews (pure)
src/scheduling/queue.ts         study session ordering and daily limits (pure)

src/data/card-store.ts          vault index, file events, answer flow (Obsidian-aware)
src/data/note-writer.ts         atomic metadata-line updates via vault.process (Obsidian-aware)

src/ui/flashcard-view.ts        ItemView shell: deck browser ↔ review screen
src/ui/deck-browser.ts          deck list renderer
src/ui/review-screen.ts         card/review renderer
src/ui/settings-tab.ts          settings UI (declarative + classic fallback)
src/ui/settings-spec.ts         single source of truth for settings fields
src/ui/format.ts                human-readable dates/intervals

tests/                          Vitest tests for every pure module
docs/                           architecture, parsing, scheduling, roadmap
```

### Data flow

1. `CardStore.initialize()` scans markdown files. `metadataCache` is used to skip files without a
   matching tag; only candidate files are read.
2. `parseNote()` returns cards. Each card carries its deck path, direction, content, source line
   range, and schedule parsed from the hidden metadata line.
3. `buildDeckTree()` aggregates counts. `StudySession` orders due learning cards, due review cards,
   and new cards (subject to per-day limits).
4. Answering calls `scheduleAnswer()` (pure), then `note-writer` rewrites the metadata line inside
   `vault.process()`. The file is re-indexed and the view advances.
5. File create/modify/delete/rename events debounce a re-index. `refs/` is ignored.

## Non-negotiable invariants

1. **The note is the database.** Never introduce a hidden scheduling database that can drift from
   the note. Settings are the only plugin data stored with `saveData()`.
2. **Metadata lines are preserved.** When writing, merge into the existing JSON object; do not drop
   unknown keys. A future version may add fields.
3. **Metadata line placement is fixed:** immediately after the card block's last content line. For
   two-way cards, one metadata line holds both directions under `"cards"`.
4. **Pure modules stay pure.** `parser`, `metadata`, `deck`, `hash`, `steps`, `fuzz`, `scheduler`,
   and `queue` must not import `obsidian` or touch the DOM. This is what makes them testable.
5. **Directional identity is stable.** A block has one `id`; card IDs are `filePath::blockId::direction`.
   Once written, the ID survives content edits and line shifts.
6. **One review = one metadata write.** Do not batch reviews across files; a failed write must not
   advance the UI. Surface an error and keep the current card.
7. **No network calls, telemetry, or remote code.** The plugin is fully offline.
8. **Clean up every listener, timer, and view on unload.** Use `this.register*`/`this.register()` or
   explicit `onClose` cleanup.
9. **Never change command IDs, view type, or metadata marker casually.** They are user-facing stable
   API. See `src/constants.ts`.
10. **Do not commit generated files.** `main.js` is a build artifact.

## Card syntax (summary)

Cards are opt-in per note via a tag (`#fc` by default). Any subtag after the base tag names a deck:
`#fc/japanese/hiragana` → deck `japanese/hiragana`.

| Syntax                   | Meaning                 |
| ------------------------ | ----------------------- |
| `front;:back`            | one-way inline card     |
| `front;::back`           | two-way inline card     |
| `front` / `:;` / `back`  | one-way multi-line card |
| `front` / `:;:` / `back` | two-way multi-line card |

- Blank lines delimit multi-line card blocks.
- Inline cards are one per line. Fenced code blocks are ignored.
- Front and back must be non-empty.
- A note is assigned to the most specific matching base tag (longest tag path, then first seen).

## Review data format

A hidden comment is appended below a reviewed card:

```markdown
<!-- fc-srs {"v":1,"id":"a1b2c3","cards":{"fwd":{"due":"2026-11-11T13:20:00.000Z","state":"learning","step":0,"ivl":0,"ease":2500,"reps":1,"lapses":0,"intro":"2026-11-11T13:19:00.000Z","last":"2026-11-11T13:19:00.000Z","rd":0}}}} -->
```

- `fwd`/`rev` are directions. `due`/`intro`/`last` are ISO timestamps. `ivl` is days for review
  cards, `0` for learning cards. `ease` is permille. `rd` is review answers today; `rday` is the
  local date for that counter. `leech`/`suspended` are optional booleans.
- `id` is the block ID. `cards` may contain only one direction; the other direction is treated as
  new.
- The parser is tolerant of missing/unknown fields and ignores malformed lines.
- Metadata lines are excluded from card parsing and are hidden in reading view.

## How to make a change

1. Read `docs/ARCHITECTURE.md`, `docs/PARSING.md`, and `docs/SCHEDULING.md` when touching those
   areas.
2. Change the pure module first and add/adjust tests in `tests/`.
3. Wire the module into `CardStore`/UI without duplicating logic.
4. Run `npm run validate`. Fix lint/format instead of disabling rules.
5. Update docs and `CHANGELOG.md` when behavior changes.

### Adding a scheduler rating or state

- Update `Rating`/`CardState` in `src/types.ts`.
- Update `previewAnswers()` and `scheduleAnswer()` in `src/scheduling/scheduler.ts`.
- Update rating buttons in `src/ui/review-screen.ts` and keyboard handling in
  `src/ui/flashcard-view.ts`.
- Add table-driven tests for transitions, ease, fuzz, and limits.

### Adding a settings field

- Add it to `FlashcardSettings` and `DEFAULT_SETTINGS`.
- Add an entry to `SETTINGS_GROUPS` in `src/ui/settings-spec.ts`. Both the declarative
  (`getSettingDefinitions()`) and classic (`display()`) renderers read it; value coercion lives in
  `setControlValue()` in `src/ui/settings-tab.ts`.
- Pass it through `toSchedulerConfig()` if it affects scheduling.
- Rebuild the index only for indexing-related settings (base tag, tag normalization).

## Testing policy

- Every parser/metadata/scheduler/queue behavior needs a test.
- Use fixed clocks (`new Date('2026-01-01T00:00:00.000Z')`); never depend on the wall clock.
- Use fixed card IDs/seeds so fuzz is reproducible.
- Prefer table-driven tests. Cover boundaries: first/last learning step, graduation, lapse,
  relearning, ease floor, interval ordering, fuzz brackets, daily limits, two-way cards, CRLF.
- UI and Obsidian APIs are not unit-tested; keep them thin.

## Style

- TypeScript strict, tabs, single quotes, semicolons, trailing commas, 100 columns (Prettier).
- Prefer small files (<300 lines) and named exports. `main.ts` stays lifecycle-only.
- Use `async/await`; handle failures with user-visible `Notice` and console diagnostics.
- Use Obsidian CSS variables in `styles.css`; support light/dark and mobile widths.
- Sentence case for UI copy.

## Reference material

`refs/` contains:

- `obsidian-sample-plugin/` — build/manifest conventions.
- `obsidian-emoji-toolbar/` — ribbon icon + popover patterns.
- `obsidian-spaced-repetition/` — prior art for parsing and ItemViews; do not copy its data model.
- `what-algorithms-anki-uses.md`, `report-supermemo2.md`, `report-fsrs.md` — algorithm background.

Read them for context, then implement in this project's own structure.
