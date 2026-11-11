# Parsing and note format

## Opting a note in

A note is indexed when it contains the base tag (`#fc` by default) or a subtag of it. Tags are read
from Obsidian's metadata cache and from a content fallback scan (frontmatter and inline). Cards in a
note share the note's deck.

### Deck resolution

| Tags in note                    | Deck path                      |
| ------------------------------- | ------------------------------ |
| `#fc`                           | `''` (root `fc`)               |
| `#fc/japanese`                  | `japanese`                     |
| `#fc/japanese/hiragana`         | `japanese/hiragana`            |
| `#fc/japanese/hiragana` + `#fc` | `japanese/hiragana`            |
| `#fc/japanese` + `#fc/spanish`  | first by file order, depth tie |

Rules:

- Matching is case-insensitive on the tag path. The deck key is lowercased; the label keeps the first
  spelling seen.
- The **most specific** matching tag wins (most path segments). Ties use the first tag in the note.
- Cards are assigned to exactly one deck. There is no per-card deck override in v0.1.
- Tags inside card content still count as note tags. This is a deliberate simplification.

## Inline cards

```
<front>;:<back>
<front>;::<back>
```

- `;:` creates one card (forward).
- `;::` creates two cards (forward and reverse), each with its own schedule.
- One inline card per line. The parser splits at the first unescaped separator outside inline code.
- Front/back are trimmed. Both must be non-empty.
- `\;:` and `\;::` can be used to avoid parsing a literal separator.
- Fenced code blocks (``` or ~~~) are ignored.

Examples:

```markdown
Capital of Japan;:Tokyo
Tokyo;::Capital of Japan
Use \;: in prose;:this line still makes a card
```

The backslash only prevents parsing. Markdown renders `\;` as `;`, so the third card's front displays
as `Use ;: in prose`.

## Multi-line cards

```
<front line 1>
<front line 2>
:;
<back line 1>
<back line 2>
```

- The block is a paragraph: blank lines delimit cards.
- A block with exactly one trimmed separator line creates a card.
- `:;` creates one direction; `:;:` creates two.
- At least one non-empty front line and one non-empty back line are required.
- Empty lines inside a block are impossible by definition (they end the block), so front/back can
  never contain blank lines. This matches the requested behavior.
- A block with multiple separator lines is ignored and reported as a warning.
- Fenced code blocks are skipped and act as block boundaries.

## Review metadata line

Every reviewed card gets a hidden HTML comment immediately after its last content line:

```markdown
<!-- fc-srs {"v":1,"id":"a1b2c3","cards":{"fwd":{...},"rev":{...}}} -->
```

### Fields

| Field       | Meaning                                                               |
| ----------- | --------------------------------------------------------------------- |
| `v`         | Format version (currently `1`).                                       |
| `id`        | Stable block ID. Shared by both directions.                           |
| `cards.fwd` | Schedule for the forward direction.                                   |
| `cards.rev` | Schedule for the reverse direction (two-way cards only).              |
| `due`       | ISO timestamp when the card is next due.                              |
| `state`     | `new`, `learning`, `review`, or `relearning`.                         |
| `step`      | Index into the current learning/relearning steps.                     |
| `ivl`       | Review interval in days. Kept at the previous value while relearning. |
| `ease`      | Ease in permille (`2500` = 250%).                                     |
| `reps`      | Total answers.                                                        |
| `lapses`    | Number of review-state `Again` answers.                               |
| `intro`     | ISO timestamp of the first answer.                                    |
| `last`      | ISO timestamp of the most recent answer.                              |
| `rd`        | Review-state answers today.                                           |
| `rday`      | Local `YYYY-MM-DD` for `rd`.                                          |
| `leech`     | Optional; card reached the leech threshold.                           |
| `suspended` | Optional; card is suspended and hidden from queues.                   |

### Identity and stability

- A block gets an ID from its normalized content plus an occurrence counter:
  `hash(front + back + kind + twoWay) + '-' + occurrence`.
- On the first review the ID is written into the metadata line. Afterwards it is authoritative, so
  editing the card text or moving the card does not lose its schedule.
- Card ID = `filePath::blockId::forward|reverse`.
- Two-way cards share one block ID and one metadata line; each direction has its own schedule.
- If a metadata line has no `id`, the parser generates one and the next write persists it.

### Writer behavior

1. Re-parse the file inside `vault.process()`.
2. Find the block by ID, then by content + direction. (No line/order fallback: a replaced card fails
   safely instead of receiving another card's schedule.)
3. Merge the direction's schedule into the existing JSON object (unknown keys preserved).
4. Replace the existing metadata line or insert it after the block's last content line.
5. Preserve the file's EOL style.
6. If no card matches, throw; do not write.

### Tolerated input

- Missing metadata: card is new.
- Missing direction record: that direction is new.
- Malformed JSON or unknown `state`: the line is ignored with a console warning; the card is new.
- Unknown keys: preserved on write.
- Missing optional fields: defaulted (`ease` = starting ease, counters = 0).
- Legacy/extra lines: only the exact `<!-- fc-srs {...} -->` marker is recognized.

## Limitations

- No nested or clozed cards in v0.1.
- No per-card tags/decks.
- Inline separators inside inline code are ignored; inside fenced code the whole block is ignored.
- An orphaned metadata line (card deleted) is harmless and is not rendered.
- Metadata is an HTML comment, so it is hidden in reading view but visible in source mode. Do not edit
  it by hand unless you understand the fields; malformed lines are treated as "new card".
