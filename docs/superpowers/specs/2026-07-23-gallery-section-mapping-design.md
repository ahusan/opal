# Gallery → survey-section image mapping

**Date:** 2026-07-23
**Status:** Approved (design), pending implementation
**File touched:** `public/index.html` (single-file app)

## Problem

Gallery images are organised into categories mirroring the media folder tree
(`F&B / Flores`, `Accommodation / Beach Pool Villa`, …), but survey sections
(Bars, Restaurants, Villa types, Spa…) show no images. Reviewers filling in a
section need to see the relevant images there, and linking images to image
questions is currently manual via the picker modal only.

## Decisions (from brainstorming)

1. **Display mode:** per-section "Related images" panel **plus** one-click
   attach into existing image questions. No silent auto-linking — a human
   confirms every link, so answers stay clean.
2. **Mapping rules:** automatic matching with per-category manual override
   saved on the resort.

## Design

### 1. Mapping engine (pure functions)

- `mgAutoSections(catPath, sections)` → ranked section ids. Scores a
  top-level gallery category against every visible section by:
  - token overlap between the category path and the section title
    (handles renamed/custom sections, e.g. "Spa, Gym and Yoga Pavilion" →
    "Spa And Wellness"), and
  - a domain synonym table:
    - f&b / restaurant / bar / dining / food → Restaurants, Bars, F&B
    - accommodation / villa / room → Villa types, Accommodation inventory
    - kids / teens / family → Family
    - watersports / dive / snorkel / cruise / excursion / marine → marine &
      activities sections
    - pool / gym / reception / facility / boutique → Facilities
    - aerial / island / general → Resort profile
- A category may map to several sections (F&B → Restaurants **and** Bars).
- Unmatched categories appear in no section until manually mapped.
- `mgSectionsFor(resort, catId)` resolves the effective mapping:
  manual override if present, else nearest ancestor's override, else auto.

### 2. Manual override (gallery UI)

- Each category header gains a `📌` control opening a checkbox list of
  sections; saving writes `resort.media.map[catId] = [sectionId, …]` in the
  resort doc (syncs via D1, participates in the existing offline edit queue).
- Override replaces the auto guess entirely for that category; subcategories
  inherit unless they set their own.
- Deleting a category deletes its map entry.

### 3. "Related images" panel (per section)

- Rendered at the top of every mapped section in both Entry and Build modes,
  collapsed by default: `📷 Related images (N) ▸` (collapse state in-memory,
  like `MG_OPEN`).
- Expanded: thumbnails grouped by category (existing thumb URLs and
  lightbox `mgView` on click). Display-only; derived, never stored.

### 4. One-click attach

- Thumbnails in the panel show a `＋` affordance **only when** the section
  (fixed) or the current entry (repeating) has a `type:'images'` question;
  clicking appends `{g: imgId}` with the same dedupe as the picker.
- Repeating sections (Bars, Restaurants, Villa types): entry names are
  matched against category paths and image names ("Flores" ↔ `F&B / Flores`)
  to show a "Suggested for this entry" row with **Attach all**.
- If multiple image questions exist in the target scope, attach to the first;
  the picker modal remains for precise placement.

## Not in scope

- Auto-attach without confirmation (even exact matches).
- Parsing filename " - " hierarchies for mapping (folders + titles suffice;
  filenames only assist entry-name suggestion matching).
- Any backend/API change — mapping lives in the resort doc; R2 untouched.

## Testing

- Extract-and-run node harness (same pattern as
  `test_gallery_import.js`): feed real folder names + real section titles to
  `mgAutoSections`/`mgSectionsFor`; assert F&B→{restaurants,bars,fnb},
  Accommodation→{room_types,accommodation}, Spa→spa section, Kids Club→family,
  Sunset Cruise→activities, override-beats-auto, ancestor inheritance.
- Whole-file script parse check (`new Function` on the script block).
