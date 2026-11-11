# Scheduling: Anki-style SM-2

The scheduler is a pure implementation of Anki's modified SM-2 model (the "V2/V3" family), not
classic SM-2. The four ratings are **Again (1)**, **Hard (2)**, **Good (3)**, **Easy (4)**.

## State machine

```
          new
           │ first answer
           ▼
       learning ◄──────────────┐
           │ last step / Easy  │ Again (reset to step 0)
           ▼                   │
        review ──── Again ──► relearning
           │                   │ steps complete
           └───── Hard/Good/Easy ──► review
```

- `new`: no schedule yet. Treated as learning with step index 0.
- `learning`: intraday (or hour/day-long) steps.
- `review`: day-scale interval and an ease factor.
- `relearning`: steps after a lapse; graduation returns to review.

## Configuration

| Setting              | Default      | Notes                                        |
| -------------------- | ------------ | -------------------------------------------- |
| Learning steps       | `1m 10m`     | `m`, `h`, `d` supported. Minutes internally. |
| Relearning steps     | `10m`        |                                              |
| Graduating interval  | `1` day      | Used when learning graduates with Good.      |
| Easy interval        | `4` days     | Used when a new card is answered Easy.       |
| Starting ease        | `250%`       | Stored as `2500`.                            |
| Minimum ease         | `130%`       | Floor `1300`.                                |
| Hard interval factor | `1.2`        |                                              |
| Easy bonus           | `1.3`        |                                              |
| Interval modifier    | `1.0`        | Applied to Hard/Good/Easy.                   |
| Lapse multiplier     | `0.0`        | New interval after relearning. `0` → 1 day.  |
| Maximum interval     | `36500` days |                                              |
| Leech threshold      | `8` lapses   |                                              |
| Fuzz                 | on           | Deterministic per card/repetition.           |
| New cards/day        | `20`         | Per deck subtree.                            |
| Reviews/day          | `200`        | Per deck subtree.                            |

## Learning and new cards

Let `S = [s0, s1, …]` be the learning steps in minutes, and `i` the current step index.

| Rating | Result                                                                              |
| ------ | ----------------------------------------------------------------------------------- |
| Again  | `i = 0`, due = now + `s0`                                                           |
| Hard   | stay at `i`; delay = `(s[i] + s[i+1]) / 2` if a next step exists, else `s[i] * 1.5` |
| Good   | `i+1`; if past the last step, graduate to review with the graduating interval       |
| Easy   | graduate immediately with the easy interval                                         |

- New cards have no ease changes during learning.
- Graduation sets `state = review`, `step = 0`, `intervalDays = graduatingInterval`,
  `ease = startingEase` (preserved if already set).
- `introduced` is set on the first answer. It counts toward the daily new limit for the rest of the
  day, even if the card is still learning.

Hard is the average of Again and Good for the current/next step, matching Anki's "repeat the current
step after the first step" behavior. On the final step, Hard repeats the step with a 1.5× delay.

## Review cards

Let:

- `p` = previous interval in days (at least 1),
- `e` = current ease (permille) / 1000,
- `m` = interval modifier,
- `h` = hard interval factor,
- `b` = easy bonus,
- `f(x)` = fuzz applied to a day interval.

Ease update:

| Rating | Δ ease | New ease                |
| ------ | ------ | ----------------------- |
| Again  | `-200` | `max(1300, ease - 200)` |
| Hard   | `-150` | `max(1300, ease - 150)` |
| Good   | `0`    | unchanged               |
| Easy   | `+150` | `ease + 150`            |

Intervals (Good uses the ease **before** the answer; Easy also uses the current ease for its interval,
then increases ease for next time):

```
hard  = max(p + 1, floor(p * h * m))
good  = max(p + 1, hard + 1, floor(p * e * m))
easy  = max(p + 1, good + 1, floor(p * e * b * m))
```

Then fuzz is applied and ordering is re-enforced:

```
hard' = max(p + 1, f(hard))
good' = max(hard' + 1, f(good))
easy' = max(good' + 1, f(easy))
```

All intervals are clamped to `[1, maximumInterval]`.

- **Again** is a lapse: `lapses += 1`, ease drops by 200, `state = relearning`, step 0, due = now +
  `relearningSteps[0]`. The previous `intervalDays` is kept so relearning graduation can apply the
  lapse multiplier.
- **Hard/Good/Easy** keep `state = review`, set `step = 0`, and set `due = now + interval` days.
- Review answers increment `reviewsToday` (reset when the local date changes).

## Relearning

Let `R` be the relearning steps.

| Rating | Result                                                                                    |
| ------ | ----------------------------------------------------------------------------------------- |
| Again  | step 0, due = now + `R[0]`                                                                |
| Hard   | stay at the current step, same delay rule as learning Hard                                |
| Good   | advance; past the last step → review with `max(1, floor(intervalDays * lapseMultiplier))` |
| Easy   | graduate immediately with `max(1, floor(intervalDays * lapseMultiplier), easyInterval)`   |

- Ease is not changed during relearning (the lapse already applied `-200`).
- Leech detection happens when a review card lapses. At `lapses >= leechThreshold` the card gets
  `leech = true`; with `leechAction = suspend` it also gets `suspended = true` and leaves the queue.

## Fuzzing

Fuzz prevents cards learned together from becoming due together. It is deterministic per
card/repetition/interval, so the button preview and the saved schedule agree.

For a raw interval `I`:

| Raw interval | Fuzz range                             |
| ------------ | -------------------------------------- |
| `I < 2`      | none                                   |
| `2 ≤ I ≤ 7`  | `[max(2, I-1), I+1]`                   |
| `8 ≤ I ≤ 20` | `[max(I-2, 7), I+2]`                   |
| `I > 20`     | `[I - floor(0.05I), I + floor(0.05I)]` |

The fuzzed value is clamped to the ordering constraints and maximum interval.

## Daily limits

- **New:** a deck subtree may introduce at most `newCardsPerDay` cards per local day. A card counts as
  introduced when its `intro` date equals today.
- **Reviews:** a deck subtree may answer at most `reviewsPerDay` review-state cards per local day,
  tracked per card by `rd`/`rday`. Learning/relearning answers do not count.
- Learning cards waiting on a step stay in the session; the UI shows a countdown when nothing is due.

Limits are evaluated per deck subtree, so studying a parent deck combines its children.

## Previews

The four rating buttons show the resulting due delay. `previewAnswers()` runs the same pure
transition with the same deterministic seed and formats the result:

- `< 1 hour` → minutes (`10m`)
- `< 1 day` → hours (`3h`)
- days → `Nd` (or months/years for long intervals)
- review cards also show the new interval.

## Deliberate differences from Anki

These are known and documented so future work can close them:

1. **Exact timestamps vs. day index.** Anki stores review due dates as day numbers and uses a
   configurable rollover hour (default 4am). This plugin stores exact ISO timestamps: an interval of
   3 days means 72 hours from the answer. Learning steps are exact too. This keeps minute/hour/day
   arithmetic simple and consistent with the note-based data model.
2. **No interday learning queue separation.** Steps longer than a day still live in
   learning/relearning.
3. **No sibling burying, custom study, filtered decks, or manual reschedule.**
4. **No undo.** An answer is written immediately.
5. **Fuzz uses a deterministic PRNG** rather than process-random values, so previews and writes agree.
   The statistical effect is the same.
6. **No FSRS.** The algorithm is Anki SM-2. FSRS is a future option; see `refs/report-fsrs.md`.
7. **Leech action is tag-only or suspend.** "Tag only" stores `leech` in the metadata; it does not
   add a tag to the note.
8. **Ease is unbounded above** and floored at 130%. Easy uses the pre-increment ease for its interval,
   matching the Anki documentation wording ("current ease times easy bonus, and ease is increased").

## References

- `refs/what-algorithms-anki-uses.md` — Anki's overview of SM-2/FSRS.
- `refs/report-supermemo2.md` — Anki SM-2 formulas, states, fuzz brackets.
- `refs/report-fsrs.md` — FSRS background for future work.
