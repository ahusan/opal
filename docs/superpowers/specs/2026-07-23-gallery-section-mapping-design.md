# Gallery structure, search, photosets & section mapping — filename-driven

**Date:** 2026-07-23 (rev 3 — photosets/search are the mapping mechanism)
**Status:** Approved (design), pending implementation
**File touched:** `public/index.html` (single-file app)

## Problem & direction (from management, 2026-07-23)

- The media **folder structure is irrelevant**. Delivery format: one flat
  folder named after the resort (e.g. `Ananea Madivaru Maldives/`) with all
  images directly inside.
- **The filename convention is the structure** and the search key:

  ```
  <Resort> - <Segment> - <Segment> - … - <Label>.<ext>
  e.g. Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg
  ```

  Files won't be renamed; the parser absorbs quirks (notably a doubled
  resort prefix, acknowledged as a naming mistake to be fixed in code).
- The team's mental model is **Lightroom search**: terms match the original
  filename as substrings, multiple terms AND together, and saved searches
  ("photosets") with editable parameters group images dynamically.

## Decisions

1. Gallery **hierarchy is parsed from filenames** (kept for browsing — easier
   to distinguish images than a flat dump); folders are ignored, with a
   folder-path fallback only for non-conforming names.
2. **Original filenames stored untouched** (`img.name`) — they are the data
   and the search key. Display labels are derived, never written back.
3. **Search is the one mapping mechanism.** Photosets are saved searches;
   each survey section's image panel is driven by an editable query seeded
   with a sensible default. No category→section scoring engine, no separate
   override UI — "fixing the mapping" = editing the query, exactly like
   Lightroom.
4. Images attach to answers only via explicit human clicks (panel `＋` /
   Attach all / existing picker). No silent auto-linking.

## Design

### 1. Filename parser (pure function)

`mgParseName(fileName)` → `{cats:[…], label}`:

- Split the basename on `" - "`.
- Collapse consecutive duplicate leading segments (doubled resort prefix).
- Drop the first segment (the resort name — positional, per convention, so
  it works even when the app resort is named differently).
- Remaining: all but the last segment → category path; last → card label.
- Fewer than 2 segments after the strip → `{cats:null}`; import falls back
  to the folder-derived path (existing `mgImportParts`), else Uncategorised.

### 2. Import flow

- For each image, prefer `mgParseName(...).cats`; fall back to folders.
  Identical result for the legacy folder tree and the flat-folder dump.
- `mgEnsurePath` unchanged. Stored record: `name` = original filename,
  plus derived `label`. Dedupe compares original names within the resolved
  category (also matches rev-1 cleaned names to avoid re-import duplicates).
- Rev-1's `mgProperName` storage rewriting is removed; its prefix-collapse
  logic lives in the parser.

### 3. Search (pure function + gallery UI)

- `mgMatch(query, name)`: split query into terms — quotes group phrases
  (`"kids club"`), otherwise whitespace-separated; every term must match
  the original filename as a case-insensitive substring (AND). Empty query
  matches all.
- Gallery toolbar gains a search input: live-filters to a flat result grid;
  result cards show their category path for context. Lightbox works from
  results.

### 4. Photosets (saved searches)

- `resort.media.sets = [{id, name, q}]` — created from the current search
  ("Save as photoset"), listed in the gallery (name + live match count),
  one click re-runs the query; edit renames or changes `q`; delete removes
  the set only (never images). Membership is always dynamic — a photoset is
  its query.
- Syncs via the resort doc (D1 + offline queue) like all other edits.

### 5. Section panels driven by queries

- Each section's query lives in `resort.media.secQ[sectionId]`; when unset,
  a built-in seed applies (shown in the edit UI as the starting value):
  - restaurants / bars / fnb → `f&b`
  - room_types / accommodation → `accommodation`
  - family → `kids`
  - marine & watersports/activities sections → `watersports`, `cruise`
  - spa/wellness sections → `wellness`
  - facilities → `facilities`
  - resort_profile → `general`
  (Seeds are single broad terms — the filename hierarchy makes them precise,
  e.g. `f&b` hits every `… - F&B - …` file. Multi-term seeds allowed where
  needed; custom sections default to the longest non-stopword in their
  title, e.g. "Spa And Wellness" → `wellness`.)
- "Related images" panel at the top of each section (Entry & Build modes),
  collapsed by default: `📷 Related images (N) ▸`. Expanded: matches grouped
  by category, thumbnail grid, lightbox on click, plus an **✏ edit query**
  control (shows the effective query, saves to `secQ`, "reset to default").
  Display-only; derived, never stored in answers.
- Sections whose query matches nothing show the collapsed strip with (0)
  and the edit control, so the mapping is discoverable and fixable in place.

### 6. One-click attach (unchanged from rev 2)

- `＋` on panel thumbnails only when the section (fixed) / current entry
  (repeating) has a `type:'images'` question; appends `{g: imgId}` with the
  picker's dedupe. Repeating sections (Bars, Restaurants, Villa types)
  match entry names against filenames ("Flores" ↔ `… - Flores - 6.jpg`) for
  a "Suggested for this entry" row with **Attach all**.
- Multiple image questions in scope → attach to the first; the picker modal
  remains for precise placement.

## Not in scope

- Renaming files or enforcing the naming convention.
- Auto-attach without confirmation.
- Backend/API changes — R2 and the media API are untouched.
- Boolean operators / exclusions in search (AND of substrings only, matching
  the team's stated Lightroom usage).

## Testing

Extract-and-run node harness (pattern of `test_gallery_import.js`), plus the
whole-file script parse check:

- `mgParseName` against every real filename in `media/` (doubled-prefix
  files, no-number `…Yoga.png`, non-conforming names → fallback).
- Category trees identical for the folder tree vs a simulated flat dump.
- `mgMatch`: single term, multi-term AND, quoted phrases, case-insensitivity,
  empty query.
- Section seeds against the real filenames: `f&b` → all F&B files (Bars,
  Restaurants panels), `accommodation` → villa files, `kids` → Kids Club,
  `wellness` → spa/yoga, `general` → aerials + reception.
- Photoset CRUD round-trip on a mock resort doc; section query override +
  reset-to-default behaviour.
