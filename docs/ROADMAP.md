# Roadmap

## 0.1 — foundation (current)

- [x] Project structure, tooling, CI, tests
- [x] Inline and multi-line card parsing
- [x] Two-way cards
- [x] Base tag + subtag decks, parent aggregation
- [x] Anki SM-2 scheduler (learning/relearning/review, ease, lapses, fuzz, leeches)
- [x] Daily new/review limits
- [x] Note-embedded review metadata with stable IDs
- [x] Ribbon icon, deck browser, review screen, keyboard shortcuts
- [x] Settings tab
- [x] Architecture/parsing/scheduling docs and agent guide

## Next

- Undo last answer (restore previous metadata snapshot)
- Card browser: search, filter by deck/state/tag, suspend/unsuspend, reschedule
- Review statistics: answer history and due forecast
- Day rollover hour and day-indexed review due dates
- Per-card deck overrides and multiple tags
- Sibling burying and custom study sessions
- Cloze cards
- Optional FSRS scheduler behind a setting; keep SM-2 as default
- Import/export compatibility notes (Anki `.apkg` is out of scope)
- Performance: incremental index persistence for large vaults (still note-derived)

## Non-goals

- Cloud sync, accounts, telemetry
- Editing notes outside the review metadata line
- Remote code or auto-update outside normal releases
- Copying the data model of `refs/obsidian-spaced-repetition` (we keep note-embedded schedules)
