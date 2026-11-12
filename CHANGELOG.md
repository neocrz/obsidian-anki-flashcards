# Changelog

All notable changes to this project are documented here. Format based on Keep a Changelog; versions
follow SemVer.

## [Unreleased]

### Added

- Optional (on by default) compaction of review-data comments in Live Preview: `fc-srs` lines
  collapse to a small badge, and reveal the raw line when the cursor touches it. Only this plugin's
  comments are affected; Source mode and other HTML comments are unchanged.

## [0.1.0] - 2026-11-11

### Added

- Obsidian plugin scaffold: manifest, esbuild build, TypeScript strict config, ESLint, Prettier,
  Vitest, CI.
- Note syntax: `;:` and `;::` inline cards; `:;` and `:;:` multi-line cards.
- Configurable base tag and subtag decks, with parent deck aggregation.
- Anki-style SM-2 scheduler: learning/relearning steps, four ratings, ease changes, lapses, leeches,
  interval modifiers, deterministic fuzz, maximum interval.
- Daily new/review limits.
- Note-embedded review metadata with stable block IDs and atomic writes.
- Ribbon icon, deck browser, Anki-like review screen with interval previews and keyboard shortcuts,
  settings tab, and styles.
- Settings rendered from a shared spec: declarative definitions for Obsidian 1.13+ settings search,
  with the classic `display()` renderer as a fallback for older versions.
- Architecture, parsing, scheduling, roadmap, agent, and contribution docs.
