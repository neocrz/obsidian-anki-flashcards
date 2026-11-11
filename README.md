# Anki Flashcards for Obsidian

Turn tagged notes into Anki-style spaced-repetition flashcards. Cards live in your notes, schedules
live in hidden lines below the cards, and everything works offline.

## Features

- **Cards in plain notes.** Add `#fc` to a note (configurable) and use `;:` / `;::` inline or
  `:;` / `:;:` multi-line separators. No separate card database.
- **Decks from subtags.** `#fc/japanese/hiragana` creates the deck `japanese/hiragana`. Parent decks
  aggregate their subdecks, like Anki.
- **Anki-style scheduling.** New → Learning → Review, with relearning on lapses, learning steps in
  minutes/hours, ease factors, hard/easy modifiers, interval fuzzing, leech detection, and daily
  new/review limits.
- **Review data in the note.** After a review, a hidden comment is written below the card. It is
  visible in source mode and previewable, but never rendered in reading view.
- **Anki-like review UI.** Left-ribbon icon, deck browser with due/new counts, four rating buttons
  with next-interval previews, and keyboard shortcuts.
- **Two-way cards.** `;::` and `:;:` create forward and reverse cards with independent schedules.
- **Two-way collaboration ready.** Pure parser/scheduler modules, tests, architecture docs, and
  `AGENTS.md` make AI-assisted changes safe.

## Install (manual)

1. Clone the repository.
2. `npm install`
3. `npm run build`
4. Copy `main.js`, `manifest.json`, and `styles.css` to
   `<Vault>/.obsidian/plugins/anki-flashcards/`.
5. Enable **Anki Flashcards** in **Settings → Community plugins**.

For development, `npm run dev` watches the source and rebuilds `main.js`.

## Card syntax

Add the base tag somewhere in a note. Every card in that note is indexed.

### Inline cards

```markdown
Capital of Japan;:Tokyo
Tokyo;::Capital of Japan
```

- `;:` is one-way (left is front, right is back).
- `;::` is two-way (two independent cards).
- One card per line. Fenced code blocks are ignored.

### Multi-line cards

```markdown
What are the three primary colors?
:;
Red
Green
Blue
```

Use `:;:` instead of `:;` for a two-way card. A multi-line card is a paragraph; blank lines delimit
cards.

### Decks

```markdown
#fc/japanese/hiragana

あ;:a
い;:i
```

This note belongs to deck `japanese/hiragana`. A note is assigned to its most specific `#fc/...`
tag. Notes with only `#fc` go to the root deck `fc`.

## Review data format

Reviewing a card writes a hidden line immediately below it:

```markdown
<!-- fc-srs {"v":1,"id":"a1b2c3","cards":{"fwd":{"due":"2026-11-11T13:20:00.000Z","state":"learning","step":0,"ivl":0,"ease":2500,"reps":1,"lapses":0,"intro":"2026-11-11T13:19:00.000Z","last":"2026-11-11T13:19:00.000Z","rd":0}}}} -->
```

Keep the line below its card. The parser merges into it, so future versions can add fields without
losing data. If you delete a card, you may delete its line. Two-way cards keep both schedules in one
line (`fwd` and `rev`).

## Algorithm

The scheduler follows Anki's modified SM-2 model: separate learning/relearning queues, four
ratings, additive ease changes, lapse handling, graduation intervals, interval modifiers, and
fuzzing. See [docs/SCHEDULING.md](docs/SCHEDULING.md) for formulas and the deliberate differences
from Anki (for example, due times are exact timestamps rather than day-indexed rollover times).

## Settings

- Base tag, new cards/day, reviews/day
- Learning and relearning steps (`1m 10m`, `10m`, `1h`, ...)
- Graduating/easy intervals
- Starting/minimum ease, hard factor, easy bonus, interval modifier, lapse multiplier
- Maximum interval, leech threshold/action, fuzz on/off

## Development

```bash
npm install
npm run typecheck
npm run test
npm run lint
npm run format
npm run validate   # everything + production build
npm run dev        # watch build
```

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Parsing:
[docs/PARSING.md](docs/PARSING.md) · Scheduling: [docs/SCHEDULING.md](docs/SCHEDULING.md) ·
Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md) · Agent guide: [AGENTS.md](AGENTS.md).

## Privacy

The plugin reads notes in your vault, writes only review metadata below cards you review, stores
settings with Obsidian's plugin data API, and makes no network requests.

## License

MIT
