# Gallery structure & survey-section mapping — filename-driven

**Date:** 2026-07-23 (rev 2 — direction change from management)
**Status:** Approved (design), pending implementation
**File touched:** `public/index.html` (single-file app)

## Problem & direction change

Rev 1 treated the media **folder structure** as the source of truth for
gallery categories. Management direction (2026-07-23): folders are
irrelevant and may disappear entirely (all files dumped into one folder).
**The filename convention is the structure** and the search key:

```
<Resort> - <Segment> - <Segment> - … - <Label>.<ext>
e.g. Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg
```

Files are "already named correctly" and will not be renamed — the parser
must tolerate quirks as-is (notably a doubled resort prefix:
`Ananea Madivaru Maldives - Ananea Madivaru Maldives - F&B - …`).

## Decisions

1. Gallery categorisation is parsed from **filenames**, not folders.
   The gallery still **displays a hierarchy** (parsed from names) — easier
   to distinguish than a flat dump.
2. Original filenames are **stored untouched** (`img.name`) — they are the
   data and the search key. Display labels are derived, never written back.
3. Survey sections get a "Related images" panel + one-click attach with
   auto mapping and per-category manual override (unchanged from rev 1).
4. Gallery gets a **search box** filtering by full original filename.

## Design

### 1. Filename parser (pure function)

`mgParseName(fileName)` → `{cats:[…], label}`:

- Split the basename on `" - "`.
- Collapse consecutive duplicate leading segments (doubled resort prefix).
- Drop the first segment (the resort name — positional, per convention; no
  match against the app's resort name required, so it works even when the
  app resort is named differently).
- Remaining segments: all but the last become the category path; the last
  is the image label (`6`, `Yoga`, `Turtle`, …).
- **Fallback:** fewer than 2 segments remain after the resort strip (name
  doesn't follow the convention) → `{cats:null}`; the import then uses the
  existing folder-derived path (rev-1 `mgImportParts` logic, kept), or
  Uncategorised when there are no folders.

### 2. Import flow

- `mgImportFolder` and per-category/file adds: for each image, prefer
  `mgParseName(...).cats` for the category path; fall back to folders.
  Works identically for the current folder tree and the future one-folder
  dump.
- `mgEnsurePath` unchanged (case-insensitive reuse of existing categories).
- Stored record: `name` = original filename (unchanged), plus derived
  `label` for card display. Dedupe compares original names within the
  resolved category (also matches rev-1 cleaned names to avoid re-import
  duplicates).
- Rev-1's `mgProperName` display-name rewriting is **removed from storage**;
  its prefix-collapsing logic moves into the parser.

### 3. Gallery UI

- Tree rendering unchanged (categories now come from names).
- Cards show the derived label, full original name in the tooltip/lightbox.
- New search input in the gallery toolbar: live-filters images by substring
  of the original filename (flattening the tree to matching results).

### 4. Section mapping engine (pure functions)

- `mgAutoSections(catPath, sections)` — scores a category path against all
  visible sections: token overlap with section titles + domain synonyms:
  - f&b / restaurant / bar / dining / food → Restaurants, Bars, F&B
  - accommodation / villa / room → Villa types, Accommodation inventory
  - kids / teens / family → Family
  - watersports / dive / snorkel / cruise / excursion / marine / activities
    → marine & activities sections
  - pool / gym / reception / facility / boutique / wellness / spa →
    Facilities / Spa & Wellness
  - aerial / island / general → Resort profile
  Filename-derived paths are richer than folders were (e.g.
  `Facilities / Activities / Kids Club`), so matching keys off the full
  path, not just the top level. A category may map to several sections.
- `mgSectionsFor(resort, catId)` — manual override if present, else nearest
  ancestor's override, else auto. Overrides stored as
  `resort.media.map[catId] = [sectionId, …]` (syncs via D1, offline queue).
- `📌` control on category headers to set/clear the override.

### 5. "Related images" panel + one-click attach (unchanged from rev 1)

- Collapsed strip at top of each mapped section (Entry & Build modes):
  `📷 Related images (N) ▸`; expanded shows thumbnails grouped by category,
  lightbox on click. Display-only, derived, never stored.
- `＋` attach on thumbnails only when the section (fixed) / current entry
  (repeating) has a `type:'images'` question; appends `{g: imgId}` with the
  picker's dedupe. Repeating sections match entry names against category
  paths/labels ("Flores" ↔ `… / Flores`) for a "Suggested for this entry"
  row with **Attach all**. No auto-attach without a human click.
- Multiple image questions in scope → attach to the first; picker modal
  remains for precise placement.

## Not in scope

- Renaming files or enforcing the naming convention.
- Auto-attach without confirmation.
- Backend/API changes — R2 and the media API are untouched.

## Testing

- Extract-and-run node harness (pattern of `test_gallery_import.js`):
  - `mgParseName` against every real filename in `media/` (incl. the
    doubled-prefix files, the no-number `…Yoga.png`, non-conforming names).
  - Category trees identical whether files come via the folder tree or a
    simulated single-folder dump.
  - `mgAutoSections`/`mgSectionsFor`: F&B→{restaurants,bars,fnb},
    Accommodation→{room_types,accommodation}, Wellness→spa section,
    Kids Club→family, Sunset Cruise→activities; override beats auto;
    ancestor inheritance.
- Whole-file script parse check (`new Function` on the script block).
