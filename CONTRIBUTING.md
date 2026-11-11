# Contributing

Thanks for helping! This project is designed for human + AI collaboration. Start with
[AGENTS.md](../AGENTS.md) and the [architecture](ARCHITECTURE.md) doc.

## Setup

```bash
npm install
npm run typecheck
npm run test
```

Node.js 22+ is required. `npm run dev` starts an esbuild watch; `npm run build` produces `main.js`.

## Before opening a PR

```bash
npm run validate
```

This runs typecheck, ESLint, Prettier check, Vitest, and a production build. CI runs the same.

## Ground rules

- Keep scheduling/parsing logic pure and tested. UI modules stay thin.
- Never commit `main.js`, `node_modules/`, `refs/`, or coverage output.
- Preserve the note metadata format and unknown keys.
- Update `docs/` and `CHANGELOG.md` for behavior changes.
- Use stable command/view IDs; see `src/constants.ts`.

## Testing a build in Obsidian

1. `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css` into
   `<Vault>/.obsidian/plugins/anki-flashcards/`.
3. Reload Obsidian (or use the **Reload app without saving** command), then enable the plugin.

Create a test note:

```markdown
#fc/test

Capital of Japan;:Tokyo
Tokyo;::Capital of Japan

What is 2 + 2?
:;
4
```

Open the ribbon icon, study the `test` deck, answer a card, and inspect the note source. A hidden
`<!-- fc-srs ... -->` line should appear under the card.
