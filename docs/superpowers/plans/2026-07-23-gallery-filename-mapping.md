# Filename-Driven Gallery, Search, Photosets & Section Panels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gallery categories, search, photosets, and per-section image panels all driven by the media filename convention `<Resort> - <Segment> - … - <Label>.<ext>`, per `docs/superpowers/specs/2026-07-23-gallery-section-mapping-design.md`.

**Architecture:** Everything lives in the single-file app `public/index.html` (one `<style>` block, one main `<script>` block). Pure helper functions (parser, matcher, query resolver) are added next to the existing MEDIA GALLERY code and tested by extracting them from the HTML into node. UI wires into `renderGallerySec` (gallery tab), `renderForm` (section panels), and `renderRepSec` (per-entry suggestions). Data extensions (`sets`, `secQ`, `img.label`) ride on the existing resort doc → D1 sync; no backend changes.

**Tech Stack:** Vanilla JS (ES2020, compact style — no semicolome omissions, 2-space indent, single-letter locals common), plain node scripts for tests (no framework), Cloudflare Pages static hosting (no build step).

## Global Constraints

- All app code changes go in `public/index.html`; **no backend/API changes** (R2 media API untouched).
- **Original filenames are stored untouched** in `img.name` — never rewrite them (they are the search key).
- Filename convention: `<Resort> - <Segment> - … - <Label>.<ext>`; parser must absorb a doubled resort prefix; resort segment is dropped **positionally** (no comparison with the app's resort name).
- Search semantics: whitespace-separated terms, `"quoted phrases"` group, every term a case-insensitive substring of the filename, ANDed. Empty query matches all (search box); a null/empty **section** query matches nothing.
- No auto-attach: images enter answers only via explicit clicks.
- Match the file's code style: compact vanilla JS, template-literal HTML, `eh()` for escaping user text, `openModal`/`closeModal`/`toast`/`saveS` for UI plumbing.
- **Auto-save everything** (commitment to management for the deployed app, 2026-07-23): every mutation this plan introduces — photoset create/edit/delete, section query overrides, attached images, the auto-created "Photos" question — must go through `saveS()` in the same call that changes state (never a separate "save" button), so it persists via localStorage + the D1 sync/offline queue exactly like existing answers.
- After every `public/index.html` edit, run the parse check: `node tests/parse.test.js` (created in Task 1).
- Run all tests with: `for f in tests/*.test.js; do node "$f" || exit 1; done`

---

### Task 1: Test infrastructure + commit the pending baseline

The working tree already contains an uncommitted, manually-verified fix (helpers `mgImportParts`, `mgProperName` and `mgAddFiles` changes). Put test infrastructure in `tests/`, cover what survives into this feature (`mgImportParts` — kept as the folder fallback), and commit the baseline. (`mgProperName` is deliberately NOT tested — Task 3 deletes it.)

**Files:**
- Create: `tests/_extract.js`
- Create: `tests/parse.test.js`
- Create: `tests/import-folder.test.js`
- Modify: none (commits the existing `public/index.html` working-tree changes)

**Interfaces:**
- Produces: `require('./_extract').load(fnNames, constNames?)` → object of live functions extracted from `public/index.html`; `node tests/parse.test.js` parse-checks all script blocks. All later test tasks consume these.

- [ ] **Step 1: Write the extraction helper**

```js
// tests/_extract.js — pull real function/const definitions out of public/index.html
// so tests run the shipped code without duplicating logic.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function fnSrc(name) {
  const i0 = html.indexOf('function ' + name + '(');
  if (i0 < 0) throw new Error('function ' + name + ' not found in index.html');
  let i = html.indexOf('{', i0), d = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') d++;
    else if (html[i] === '}') { d--; if (!d) break; }
  }
  return html.slice(i0, i + 1);
}

function constSrc(name) {
  const i0 = html.indexOf('const ' + name + '=');
  if (i0 < 0) throw new Error('const ' + name + ' not found in index.html');
  let i = html.indexOf('{', i0);
  if (i < 0 || i > html.indexOf(';', i0)) return html.slice(i0, html.indexOf(';', i0) + 1);
  let d = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') d++;
    else if (html[i] === '}') { d--; if (!d) break; }
  }
  return html.slice(i0, html.indexOf(';', i) + 1);
}

function load(fns, consts = []) {
  const src = [...consts.map(constSrc), ...fns.map(fnSrc)].join('\n');
  const ctx = {};
  new Function('ctx', src + '\n' + fns.map(n => `ctx.${n}=${n};`).join('') +
    consts.map(n => `ctx.${n}=${n};`).join(''))(ctx);
  return ctx;
}

module.exports = { html, fnSrc, constSrc, load };
```

- [ ] **Step 2: Write the parse check**

```js
// tests/parse.test.js — every non-JSON <script> block in index.html must parse.
const { html } = require('./_extract');
const blocks = [...html.matchAll(/<script(?![^>]*src)([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/application\/json/.test(m[1]));
if (!blocks.length) { console.log('FAIL: no script blocks found'); process.exit(1); }
blocks.forEach((m, i) => { new Function(m[2]); console.log(`ok   script block ${i} parses (${m[2].length} chars)`); });
```

- [ ] **Step 3: Write the folder-fallback import test**

```js
// tests/import-folder.test.js — mgImportParts: folder-path fallback mapping.
// Wrapper folders (media / <resort folder, any name> / Image Gallery) never
// become categories; cut at the DEEPEST wrapper.
const { load } = require('./_extract');
const { mgImportParts } = load(['cleanSeg', 'mgImportParts']);

let fails = 0;
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`FAIL ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

// resort folder name ≠ app resort name — must still strip (the original bug)
eq('picked media/, name mismatch',
  mgImportParts('media/Ananea Madivaru Maldives/Image Gallery/Kids Club/a.jpg', 'bodumas resort and spa').parts,
  ['Kids Club']);
eq('picked resort folder',
  mgImportParts('Ananea Madivaru Maldives/Image Gallery/F&B_/Flores/a.jpg', 'x').parts,
  ['F&B', 'Flores']);
eq('picked Image Gallery',
  mgImportParts('Image Gallery/Accommodation/Beach Pool Villa_/a.jpg', 'x').parts,
  ['Accommodation', 'Beach Pool Villa']);
eq('no wrapper anywhere — only picked root dropped',
  mgImportParts('Holiday pics/Pool/a.jpg', 'x').parts,
  ['Pool']);
eq('resortSeg reported from segment above Image Gallery',
  mgImportParts('media/Ananea Madivaru Maldives/Image Gallery/Kids Club/a.jpg', 'x').resortSeg,
  'Ananea Madivaru Maldives');
process.exit(fails ? 1 : 0);
```

- [ ] **Step 4: Run all tests, expect pass**

Run: `node tests/parse.test.js && node tests/import-folder.test.js`
Expected: `ok` lines only, exit 0. (These test already-present code — they pass immediately.)

- [ ] **Step 5: Commit the baseline**

```bash
git add tests/ public/index.html
git commit -m "feat: robust folder-import wrapper stripping + node test harness for index.html helpers"
```

---

### Task 2: `mgParseName` — the filename convention parser

**Files:**
- Modify: `public/index.html` — insert directly after the `cleanSeg` function (search for `function cleanSeg(`)
- Test: `tests/parse-name.test.js`

**Interfaces:**
- Consumes: `cleanSeg(s)` (existing).
- Produces: `mgParseName(fileName)` → `{cats: string[]|null, label: string, stripped: string}`. `cats` null ⇢ name doesn't follow the convention (caller falls back to folders). `stripped` = name after resort-prefix removal WITH extension (used for rev-1 dedupe compat in Task 3). Tasks 3, 5, 9 rely on these exact names.

- [ ] **Step 1: Write the failing test**

```js
// tests/parse-name.test.js — mgParseName: filenames ARE the structure.
const { load } = require('./_extract');
const { mgParseName } = load(['cleanSeg', 'mgParseName']);

let fails = 0;
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`FAIL ${label}:\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

eq('standard name',
  mgParseName('Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg'),
  { cats: ['F&B', 'Restaurants & Bars', 'Flores'], label: '6',
    stripped: 'F&B - Restaurants & Bars - Flores - 6.jpg' });
eq('doubled resort prefix collapses',
  mgParseName('Ananea Madivaru Maldives - Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg'),
  { cats: ['F&B', 'Restaurants & Bars', 'Flores'], label: '6',
    stripped: 'F&B - Restaurants & Bars - Flores - 6.jpg' });
eq('non-numeric label',
  mgParseName('Ananea Madivaru Maldives - Facilities - Wellness - Spa and Yoga Pavillion - Yoga.png'),
  { cats: ['Facilities', 'Wellness', 'Spa and Yoga Pavillion'], label: 'Yoga',
    stripped: 'Facilities - Wellness - Spa and Yoga Pavillion - Yoga.png' });
eq('deep hierarchy',
  mgParseName('Ananea Madivaru Maldives - F&B - Restaurants & Bars - Asia Street Food - Maldivian - Kaage - 5.jpg').cats,
  ['F&B', 'Restaurants & Bars', 'Asia Street Food', 'Maldivian', 'Kaage']);
eq('non-conforming name → cats null',
  mgParseName('plain-photo.jpg'),
  { cats: null, label: 'plain-photo.jpg', stripped: 'plain-photo.jpg' });
eq('two segments only (resort + label) → cats null, stripped drops resort',
  mgParseName('Ananea Madivaru Maldives - beach.jpg'),
  { cats: null, label: 'Ananea Madivaru Maldives - beach.jpg', stripped: 'beach.jpg' });
eq('empty input safe', mgParseName(''), { cats: null, label: '', stripped: '' });
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/parse-name.test.js`
Expected: throws `function mgParseName not found in index.html`

- [ ] **Step 3: Implement `mgParseName`** — insert this immediately after the `cleanSeg` function in `public/index.html`:

```js
// Filename convention "<Resort> - <Segment> - … - <Label>.<ext>" is the structure
// (management decision 2026-07-23): segments become the category path, the last
// token is the card label. The resort token is dropped positionally; a doubled
// resort prefix (known naming mistake) is collapsed. cats:null ⇒ name doesn't
// follow the convention — caller falls back to the folder path.
function mgParseName(name){
  const raw=String(name||'');
  const toks=raw.split(' - ').map(s=>s.trim()).filter(Boolean);
  while(toks.length>1&&toks[0].toLowerCase()===toks[1].toLowerCase())toks.shift();
  const stripped=toks.length>1?toks.slice(1).join(' - '):raw;
  if(toks.length<3)return{cats:null,label:raw,stripped};
  const segs=toks.slice(1);
  const label=segs[segs.length-1].replace(/\.[A-Za-z0-9]+$/,'').trim()||segs[segs.length-1];
  return{cats:segs.slice(0,-1).map(cleanSeg).filter(Boolean),label,stripped};
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node tests/parse-name.test.js && node tests/parse.test.js`
Expected: all `ok`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/parse-name.test.js public/index.html
git commit -m "feat: mgParseName — parse gallery structure from the filename convention"
```

---

### Task 3: Import uses filenames; original names stored; `mgProperName` removed

**Files:**
- Modify: `public/index.html` — functions `mgImportFolder`, `mgAddFiles`, `mgCardHTML`; delete function `mgProperName`
- Test: `tests/import-jobs.test.js`

**Interfaces:**
- Consumes: `mgParseName` (Task 2), `mgImportParts` (baseline).
- Produces: `mgJobParts(relPath, fileName, resortNameLower)` → `string[]` category segments (filename-first, folder fallback). Image records gain optional `label`; `name` is ALWAYS the original filename. Task 5/8/9 read `img.label || img.name` for card captions.

- [ ] **Step 1: Write the failing test**

```js
// tests/import-jobs.test.js — mgJobParts: filenames beat folders; identical
// category tree for the legacy folder tree and the flat one-folder dump.
const { load } = require('./_extract');
const { mgJobParts } = load(['cleanSeg', 'mgParseName', 'mgImportParts', 'mgJobParts']);

let fails = 0;
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`FAIL ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

const NAME = 'Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg';
const WANT = ['F&B', 'Restaurants & Bars', 'Flores'];
eq('flat dump (folder = resort name)', mgJobParts('Ananea Madivaru Maldives/' + NAME, NAME, 'x'), WANT);
eq('legacy folder tree — filename still wins', mgJobParts('media/Ananea Madivaru Maldives/Image Gallery/F&B_/Flores/' + NAME, NAME, 'x'), WANT);
eq('no folders at all', mgJobParts(NAME, NAME, 'x'), WANT);
eq('non-conforming name falls back to folders',
  mgJobParts('Image Gallery/Kids Club/holiday.jpg', 'holiday.jpg', 'x'), ['Kids Club']);
eq('non-conforming name, no folders → uncategorised',
  mgJobParts('holiday.jpg', 'holiday.jpg', 'x'), []);
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/import-jobs.test.js`
Expected: throws `function mgJobParts not found in index.html`

- [ ] **Step 3: Implement.** In `public/index.html`:

**(a)** Replace the entire `mgImportFolder` function AND the `mgProperName` function above it (delete `mgProperName` — original filenames are the data now; its collapse logic lives in `mgParseName`) with:

```js
// Category segments for one imported file: the filename convention wins;
// folder paths are only a fallback for non-conforming names.
function mgJobParts(rel,fileName,rn){
  const pn=mgParseName(fileName);
  return pn.cats||mgImportParts(rel,rn).parts;
}
function mgImportFolder(ev){
  const all=[...ev.target.files];ev.target.value='';
  const r=S.resorts[S.activeResortId];if(!r)return;
  const rn=(r.name||'').toLowerCase().trim();
  const files=all.filter(f=>f.type.startsWith('image/')&&!f.name.startsWith('.'));
  if(!files.length){toast('No images found in that folder');return;}
  const jobs=files.map(f=>{
    const parts=mgJobParts(f.webkitRelativePath||f.name,f.name,rn);
    return{file:f,cat:parts.length?mgEnsurePath(r,parts):null};
  });
  mgAddFiles(jobs);
}
```

**(b)** In `mgAddFiles`, replace the `jobs.forEach(...)` body's first lines (currently computing `nm` from `j.name||j.file.name` and the `dup` check) so the record keeps the ORIGINAL name, gains a derived `label`, and dedupes against both the original and the rev-1 cleaned name:

```js
  jobs.forEach(j=>{
    const pn=mgParseName(j.file.name);
    const dup=m.imgs.find(im=>(im.cat||null)===(j.cat||null)&&
      (im.name.toLowerCase()===j.file.name.toLowerCase()||im.name.toLowerCase()===pn.stripped.toLowerCase()));
    if(dup){skipped++;return;}
    const im={id:mgId('i'),name:j.file.name,label:pn.cats?pn.label:undefined,cat:j.cat||null,ct:j.file.type,size:j.file.size,
              st:REMOTE?'up':'ref',at:new Date().toISOString()};
```

(The rest of `mgAddFiles` — push, enqueue, toast — is unchanged. Also update its comment line to `// jobs: [{file, cat}] — creates entries, saves, renders, then uploads in background`.)

**(c)** In `mgCardHTML`, change the caption line from `<div class="mg-name">${eh(i.name)}</div>` to:

```js
    <div class="mg-name">${eh(i.label||i.name)}</div>
```

(The card's `title` attribute already shows the full `i.name` on hover; the lightbox caption `mgLbShow` also uses `im.name` — leave both.)

- [ ] **Step 4: Run all tests**

Run: `for f in tests/*.test.js; do node "$f" || exit 1; done`
Expected: all `ok`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/import-jobs.test.js public/index.html
git commit -m "feat: filename-driven gallery categories; store original names, derived labels"
```

---

### Task 4: `mgMatch` — Lightroom-style search matcher

**Files:**
- Modify: `public/index.html` — insert after `mgParseName`
- Test: `tests/match.test.js`

**Interfaces:**
- Produces: `mgMatch(query, name)` → boolean (terms ANDed, case-insensitive substrings, quotes group, empty query → true). Tasks 5–9 all call it with exactly this signature.

- [ ] **Step 1: Write the failing test**

```js
// tests/match.test.js — mgMatch: Lightroom semantics.
const { load } = require('./_extract');
const { mgMatch } = load(['mgMatch']);
const NAME = 'Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg';
let fails = 0;
const t = (label, got, want) => {
  if (got !== want) { fails++; console.log(`FAIL ${label}: got ${got}`); }
  else console.log(`ok   ${label}`);
};
t('single term', mgMatch('ananea', NAME), true);
t('case-insensitive', mgMatch('FLORES', NAME), true);
t('multi-term AND, both present', mgMatch('ananea f&b', NAME), true);
t('multi-term AND, one missing', mgMatch('ananea sunset', NAME), false);
t('quoted phrase present', mgMatch('"restaurants & bars"', NAME), true);
t('quoted phrase absent', mgMatch('"kids club"', NAME), false);
t('quotes + bare term', mgMatch('"restaurants & bars" flores', NAME), true);
t('empty query matches all', mgMatch('', NAME), true);
t('whitespace-only query matches all', mgMatch('   ', NAME), true);
t('no match on empty name', mgMatch('x', ''), false);
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/match.test.js`
Expected: throws `function mgMatch not found in index.html`

- [ ] **Step 3: Implement** — insert after `mgParseName` in `public/index.html`:

```js
// Lightroom-style filename search (the team's mental model): every term must
// appear in the original filename, case-insensitive; "quotes" group a phrase.
function mgQTerms(q){
  const out=[];const re=/"([^"]*)"|(\S+)/g;let m;
  while((m=re.exec(String(q||''))))if((m[1]||m[2]||'').trim())out.push((m[1]||m[2]).trim().toLowerCase());
  return out;
}
function mgMatch(q,name){
  const n=String(name||'').toLowerCase();
  return mgQTerms(q).every(t=>n.includes(t));
}
```

- [ ] **Step 4: Run tests**

Run: `node tests/match.test.js && node tests/parse.test.js`
Expected: all `ok`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/match.test.js public/index.html
git commit -m "feat: mgMatch — Lightroom-style AND filename search"
```

---

### Task 5: Gallery search UI

**Files:**
- Modify: `public/index.html` — `renderGallerySec` (split out `mgTreeHTML`), new `mgSearch`, new CSS in the `/* ══ MEDIA GALLERY ══ */` style area
- Test: parse check + existing tests

**Interfaces:**
- Consumes: `mgMatch`, `mgCardHTML`, `mgCatPath`, `mgCats`, `mgImgs`, `mediaOf`, `eh`.
- Produces: global `let MG_QUERY=''`; `mgTreeHTML(resort)` → string (tree, or flat results grouped by category when a query is active); `mgSearch(value)` (oninput handler, updates only `#mgTree` so the input keeps focus). Task 6 re-renders chips + tree; Task 6's "Save as photoset" button `#mgSaveSetBtn` is toggled by `mgSearch`.

- [ ] **Step 1: Restructure `renderGallerySec`.** Replace everything in the function from `const roots=mgCats(resort,null)` down to the closing `return html;` (keeping the toolbar + offline-warning code above it) with:

```js
  html+=`<div class="mg-search-row">
    <input class="mg-search" id="mgSearchInp" placeholder='🔎 Search file names — e.g. f&b "kids club"' value="${eh(MG_QUERY)}" oninput="mgSearch(this.value)">
    <button class="mg-btn" id="mgSaveSetBtn" style="display:${MG_QUERY.trim()?'inline-block':'none'}" onclick="mgSetSave()">💾 Save as photoset</button>
  </div>`;
  html+=`<div id="mgTree">${mgTreeHTML(resort)}</div>`;
  return html;
```

Then add below the function (note the empty-state copy now reflects the flat-folder delivery):

```js
let MG_QUERY='';
function mgTreeHTML(resort){
  const q=MG_QUERY.trim();
  if(q){
    const hits=mediaOf(resort).imgs.filter(i=>mgMatch(q,i.name));
    if(!hits.length)return`<div class="mg-none">No file names match <code>${eh(q)}</code></div>`;
    const byCat={};hits.forEach(i=>{(byCat[i.cat||'']=byCat[i.cat||'']||[]).push(i);});
    return Object.keys(byCat).map(cid=>`<div class="gp-cat-t">📂 ${eh(cid?mgCatPath(resort,cid):'Uncategorised')}</div>
      <div class="mg-grid">${byCat[cid].map(i=>mgCardHTML(resort,i)).join('')}</div>`).join('');
  }
  const roots=mgCats(resort,null),rootImgs=mgImgs(resort,null);
  if(!roots.length&&!rootImgs.length){
    return`<div class="mg-empty"><div style="font-size:30px;">🖼️</div>
      <strong>No images yet</strong><br>
      Click <strong>📁 Import media folder…</strong> and pick this resort's media folder —
      a flat folder is fine: categories come from the file names<br>
      (<em>Resort - Section - … - N.jpg</em>).</div>`;
  }
  let html='';
  if(rootImgs.length)html+=`<div class="mg-grid">${rootImgs.map(i=>mgCardHTML(resort,i)).join('')}</div>`;
  html+=roots.map(c=>mgCatHTML(resort,c,0)).join('');
  return html;
}
function mgSearch(v){
  MG_QUERY=v;
  const t=document.getElementById('mgTree');
  if(t)t.innerHTML=mgTreeHTML(S.resorts[S.activeResortId]);
  const b=document.getElementById('mgSaveSetBtn');
  if(b)b.style.display=v.trim()?'inline-block':'none';
}
```

*Temporary stub so the file stays parseable until Task 6:* also add `function mgSetSave(){toast('Photosets arrive in the next change');}` right after `mgSearch` — Task 6 replaces it.

- [ ] **Step 2: Add CSS** — in the `<style>` block, directly under the `/* gallery picker modal */` rules:

```css
/* gallery search + photosets */
.mg-search-row{display:flex;gap:8px;margin:12px 0 8px;}
.mg-search{flex:1;padding:8px 11px;border:1px solid var(--border);border-radius:var(--r);font-size:var(--fs-sm);background:var(--surface);color:var(--text);outline:none;}
.mg-search:focus{border-color:var(--accent);}
.mg-sets{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;}
.mg-set-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border:1px solid var(--border);border-radius:14px;font-size:var(--fs-xs);cursor:pointer;background:var(--surface);}
.mg-set-chip:hover{border-color:var(--accent);background:var(--al);}
.mg-set-n{color:var(--text3);}
.mg-set-chip button{border:none;background:none;cursor:pointer;font-size:11px;padding:0 2px;color:var(--text3);}
.mg-set-chip button:hover{color:var(--accent);}
.mg-set-chip button.del:hover{color:var(--danger);}
```

- [ ] **Step 3: Verify**

Run: `for f in tests/*.test.js; do node "$f" || exit 1; done`
Expected: all `ok`. Optionally smoke-test in the browser via `npx wrangler pages dev public --port 8788` → gallery tab shows the search box; typing filters live.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: gallery filename search (Lightroom-style AND terms)"
```

---

### Task 6: Photosets — saved searches with editable parameters

**Files:**
- Modify: `public/index.html` — `mediaOf` (data init), replace the `mgSetSave` stub, add photoset CRUD + chips; hook chips into `renderGallerySec`
- Test: `tests/media-of.test.js`

**Interfaces:**
- Consumes: `MG_QUERY`, `mgSearch`, `mgMatch`, `mgId`, `openModal`/`closeModal`/`saveS`/`renderForm`/`toast`/`eh`.
- Produces: `mediaOf(r)` now also guarantees `media.sets` (array of `{id,name,q}`) and `media.secQ` (object) — Task 8 reads/writes `secQ`. UI functions `mgSetChipsHTML(r)`, `mgSetSave`, `mgSetDoSave`, `mgSetApply(id)`, `mgSetEdit(id)`, `mgSetDoEdit(id)`, `mgSetDel(id)`, `mgSetDoDel(id)`.

- [ ] **Step 1: Write the failing test**

```js
// tests/media-of.test.js — mediaOf backfills sets/secQ on legacy resort docs.
const { load } = require('./_extract');
const { mediaOf } = load(['mediaOf']);
let fails = 0;
const t = (label, ok) => { if (!ok) { fails++; console.log('FAIL ' + label); } else console.log('ok   ' + label); };

const legacy = { media: { cats: [{ id: 'c1', name: 'F&B', parent: null }], imgs: [{ id: 'i1', name: 'x.jpg', cat: 'c1' }] } };
const m = mediaOf(legacy);
t('legacy cats preserved', m.cats.length === 1 && m.cats[0].name === 'F&B');
t('legacy imgs preserved', m.imgs.length === 1);
t('sets backfilled as []', Array.isArray(m.sets) && m.sets.length === 0);
t('secQ backfilled as {}', m.secQ && typeof m.secQ === 'object' && !Array.isArray(m.secQ));
const fresh = {};
const f = mediaOf(fresh);
t('fresh doc initialised', Array.isArray(f.cats) && Array.isArray(f.imgs) && Array.isArray(f.sets) && typeof f.secQ === 'object');
t('corrupt sets healed', Array.isArray(mediaOf({ media: { cats: [], imgs: [], sets: 'nope' } }).sets));
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/media-of.test.js`
Expected: FAIL lines for `sets backfilled` / `secQ backfilled` (mediaOf doesn't create them yet), exit 1.

- [ ] **Step 3: Implement.**

**(a)** Replace `mediaOf` with:

```js
function mediaOf(r){
  if(!r.media||typeof r.media!=='object')r.media={cats:[],imgs:[],sets:[],secQ:{}};
  if(!Array.isArray(r.media.cats))r.media.cats=[];
  if(!Array.isArray(r.media.imgs))r.media.imgs=[];
  if(!Array.isArray(r.media.sets))r.media.sets=[];
  if(!r.media.secQ||typeof r.media.secQ!=='object'||Array.isArray(r.media.secQ))r.media.secQ={};
  return r.media;
}
```

**(b)** Update the structure comment above it to: `// Structure lives in resort.media = { cats:[{id,name,parent}], imgs:[{id,name,label?,cat,ct,size,st,at}], sets:[{id,name,q}], secQ:{secId:query} }`.

**(c)** Replace the Task-5 `mgSetSave` stub with the photoset block (place after `mgSearch`):

```js
// ── photosets: saved searches, dynamic membership (a photoset IS its query) ──
function mgSetChipsHTML(r){
  const sets=mediaOf(r).sets;if(!sets.length)return'';
  return`<div class="mg-sets">${sets.map(s=>{
    const n=mediaOf(r).imgs.filter(i=>mgMatch(s.q,i.name)).length;
    return`<span class="mg-set-chip" onclick="mgSetApply('${s.id}')" title="Query: ${eh(s.q)}">📸 ${eh(s.name)} <span class="mg-set-n">${n}</span>
      <button title="Edit photoset" onclick="event.stopPropagation();mgSetEdit('${s.id}')">✏</button>
      <button class="del" title="Delete photoset" onclick="event.stopPropagation();mgSetDel('${s.id}')">✕</button></span>`;
  }).join('')}</div>`;
}
function mgSetSave(){
  const q=MG_QUERY.trim();if(!q)return;
  openModal(`<h3>Save photoset</h3>
    <div class="mr2"><label>Photoset name</label><input type="text" id="mgsn" placeholder="e.g. Bars press kit" onkeydown="if(event.key==='Enter')mgSetDoSave()"></div>
    <p style="font-size:var(--fs-xs);color:var(--text3);">Query: <code>${eh(q)}</code> — the photoset always shows whatever currently matches this search.</p>
    <div class="ma"><button onclick="closeModal()">Cancel</button><button class="bp2" onclick="mgSetDoSave()">Save</button></div>`);
  setTimeout(()=>document.getElementById('mgsn').focus(),50);
}
function mgSetDoSave(){
  const name=document.getElementById('mgsn').value.trim();if(!name)return;
  const r=S.resorts[S.activeResortId];
  mediaOf(r).sets.push({id:mgId('s'),name,q:MG_QUERY.trim()});
  saveS();closeModal();renderForm();toast('Photoset saved');
}
function mgSetApply(id){
  const r=S.resorts[S.activeResortId];const s=mediaOf(r).sets.find(x=>x.id===id);if(!s)return;
  MG_QUERY=s.q;renderForm();
}
function mgSetEdit(id){
  const r=S.resorts[S.activeResortId];const s=mediaOf(r).sets.find(x=>x.id===id);if(!s)return;
  openModal(`<h3>Edit photoset</h3>
    <div class="mr2"><label>Photoset name</label><input type="text" id="mgsn" value="${eh(s.name)}"></div>
    <div class="mr2"><label>Search terms (every term must appear in the file name)</label><input type="text" id="mgsq" value="${eh(s.q)}" onkeydown="if(event.key==='Enter')mgSetDoEdit('${id}')"></div>
    <div class="ma"><button onclick="closeModal()">Cancel</button><button class="bp2" onclick="mgSetDoEdit('${id}')">Save</button></div>`);
  setTimeout(()=>{const e=document.getElementById('mgsn');e.focus();e.select();},50);
}
function mgSetDoEdit(id){
  const r=S.resorts[S.activeResortId];const s=mediaOf(r).sets.find(x=>x.id===id);if(!s)return;
  const name=document.getElementById('mgsn').value.trim(),q=document.getElementById('mgsq').value.trim();
  if(!name||!q)return;
  s.name=name;s.q=q;saveS();closeModal();renderForm();toast('Photoset updated');
}
function mgSetDel(id){
  const r=S.resorts[S.activeResortId];const s=mediaOf(r).sets.find(x=>x.id===id);if(!s)return;
  openModal(`<h3>Delete photoset</h3><p>Delete <strong>${eh(s.name)}</strong>? Images are never deleted — a photoset is just a saved search.</p>
    <div class="ma"><button onclick="closeModal()">Cancel</button><button class="bd" onclick="mgSetDoDel('${id}')">Delete</button></div>`);
}
function mgSetDoDel(id){
  const r=S.resorts[S.activeResortId];const m=mediaOf(r);
  m.sets=m.sets.filter(s=>s.id!==id);
  saveS();closeModal();renderForm();toast('Photoset deleted');
}
```

**(d)** In `renderGallerySec`, right after the `.mg-search-row` div added in Task 5, insert:

```js
  html+=mgSetChipsHTML(resort);
```

- [ ] **Step 4: Run all tests**

Run: `for f in tests/*.test.js; do node "$f" || exit 1; done`
Expected: all `ok`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/media-of.test.js public/index.html
git commit -m "feat: photosets — saved filename searches with editable parameters"
```

---

### Task 7: Section query resolver — seeds, custom-title fallback, overrides

**Files:**
- Modify: `public/index.html` — add after the photoset block
- Test: `tests/sec-query.test.js`

**Interfaces:**
- Consumes: `mediaOf` (Task 6 shape).
- Produces: `const MG_SEED` (object), `mgTitleSeed(title)` → string|null, `mgSecQuery(resort, sec)` → string|null (`sec` is a section def object with `id` and `title`; null ⇒ panel shows 0 matches). Task 8 calls `mgSecQuery` and `MG_SEED[secId]||mgTitleSeed(title)` for "reset to default".

- [ ] **Step 1: Write the failing test**

```js
// tests/sec-query.test.js — section queries: override ?? seed ?? title-derived.
const { load } = require('./_extract');
const { mgSecQuery, mgTitleSeed, MG_SEED } = load(['mediaOf', 'mgTitleSeed', 'mgSecQuery'], ['MG_SEED', 'MG_STOP']);
let fails = 0;
const t = (label, got, want) => {
  if (got !== want) { fails++; console.log(`FAIL ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log('ok   ' + label);
};

const r = { media: { cats: [], imgs: [], sets: [], secQ: {} } };
t('bars seed', mgSecQuery(r, { id: 'bars', title: 'Bars' }), 'f&b');
t('restaurants seed', mgSecQuery(r, { id: 'restaurants', title: 'Restaurants' }), 'f&b');
t('villa types seed', mgSecQuery(r, { id: 'room_types', title: 'Villa / room types' }), 'accommodation');
t('family seed', mgSecQuery(r, { id: 'family', title: 'Family & kids' }), 'kids');
t('custom section → longest non-stopword of title',
  mgSecQuery(r, { id: 'cs123', title: 'Spa And Wellness' }), 'wellness');
t('custom watersports section',
  mgSecQuery(r, { id: 'cs456', title: 'Watersports, Scuba Diving, Island Sports / Activities / Kids Club / Teens Club' }), 'watersports');
t('stopword-only title → null', mgSecQuery(r, { id: 'cs789', title: 'The And For' }), null);
r.media.secQ.bars = 'beach bar';
t('override beats seed', mgSecQuery(r, { id: 'bars', title: 'Bars' }), 'beach bar');
r.media.secQ.bars = '';
t('empty override disables the query', mgSecQuery(r, { id: 'bars', title: 'Bars' }), null);
t('mgTitleSeed short words filtered', mgTitleSeed('Spa'), null);
t('seed table has no gallery/faq entries', MG_SEED.media_gallery === undefined && MG_SEED.faq === undefined);

// Seeds must actually hit the real filename convention (spec: "seeds against real filenames").
const { mgMatch } = load(['mgMatch']);
t('bars seed hits F&B files', mgMatch(MG_SEED.bars, 'Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg'), true);
t('villa seed hits accommodation files', mgMatch(MG_SEED.room_types, 'Ananea Madivaru Maldives - Accommodation - Villas - Beach Pool Villa.jpg'), true);
t('family seed hits kids files', mgMatch(MG_SEED.family, 'Ananea Madivaru Maldives - Facilities - Activities - Kids Club - 25.jpg'), true);
t('wellness title-seed hits spa files', mgMatch('wellness', 'Ananea Madivaru Maldives - Facilities - Wellness - Spa and Yoga Pavillion - Yoga.png'), true);
t('profile seed hits general files', mgMatch(MG_SEED.resort_profile, 'Ananea Madivaru Maldives - General - Island Aerial - 19.jpg'), true);
t('bars seed does NOT hit kids files', mgMatch(MG_SEED.bars, 'Ananea Madivaru Maldives - Facilities - Activities - Kids Club - 25.jpg'), false);
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/sec-query.test.js`
Expected: throws `const MG_SEED= not found in index.html`

- [ ] **Step 3: Implement** — add after `mgSetDoDel`:

```js
// ── section image queries: override ?? built-in seed ?? derived from title ──
// Seeds are single broad terms — the filename hierarchy makes them precise
// ("f&b" hits every "… - F&B - …" file).
const MG_SEED={restaurants:'f&b',bars:'f&b',fnb:'f&b',room_types:'accommodation',accommodation:'accommodation',family:'kids',marine:'watersports',facilities_fixed:'facilities',resort_profile:'general',spa:'wellness'};
const MG_STOP=new Set(['and','the','for','with','from','into','your','all','other','misc','resort','types','type','club','island']);
function mgTitleSeed(title){
  const words=String(title||'').toLowerCase().replace(/[^a-z0-9\s&]/g,' ').split(/\s+/).filter(w=>w.length>=4&&!MG_STOP.has(w));
  if(!words.length)return null;
  return words.sort((a,b)=>b.length-a.length)[0];
}
function mgSecQuery(r,sec){
  const o=mediaOf(r).secQ[sec.id];
  if(o!==undefined&&o!==null)return String(o).trim()||null;
  return MG_SEED[sec.id]||mgTitleSeed(sec.title);
}
```

- [ ] **Step 4: Run tests**

Run: `node tests/sec-query.test.js && node tests/parse.test.js`
Expected: all `ok`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/sec-query.test.js public/index.html
git commit -m "feat: section image-query resolver (seeds + title fallback + overrides)"
```

---

### Task 8: "Related images" panel in every fixed/repeating section

**Files:**
- Modify: `public/index.html` — new panel functions after `mgSecQuery`; insertion in `renderForm`; CSS
- Test: parse check + all tests

**Interfaces:**
- Consumes: `mgSecQuery`, `mgMatch`, `mediaOf`, `mgCatPath`, `mediaUrl`, `mgThumbErr`, `mgView`, `getSecDef`, `openModal`/`saveS`/`renderForm`/`toast`/`eh`.
- Produces: `MG_SP` (open-state), `mgSpTog(secId)`, `mgSecImgs(r,q)` → img[], `mgSecPanelHTML(resort,sec)` → string, `mgSecQEdit/mgSecQSave/mgSecQReset(secId)`. Task 9 adds the `＋` button via `mgSpCardHTML`'s `fixed` argument — keep its signature `mgSpCardHTML(r,i,secId,fixed)`.

- [ ] **Step 1: Implement panel functions** — add after `mgSecQuery`:

```js
// ── "Related images" panel: shows gallery images matching the section query ──
const MG_SP={};
function mgSpTog(secId){MG_SP[secId]=!MG_SP[secId];renderForm();}
function mgSecImgs(r,q){return q?mediaOf(r).imgs.filter(i=>mgMatch(q,i.name)):[];}
function mgSpCardHTML(r,i,secId,fixed){
  const th=i.st==='ok'?`<img src="${mediaUrl(r.id,i.id,'thumb')}" loading="lazy" alt="" onerror="mgThumbErr(this,'${mediaUrl(r.id,i.id,'orig')}')">`:`<span>🖼</span>`;
  return`<div class="sp-card" title="${eh(i.name)}">
    <div class="sp-th" onclick="mgView('${i.id}')">${th}</div>
    <div class="sp-nm">${eh(i.label||i.name)}</div>
  </div>`;
}
function mgSecPanelHTML(resort,sec){
  if(sec.type!=='fixed'&&sec.type!=='repeating')return'';
  const q=mgSecQuery(resort,sec);
  const imgs=mgSecImgs(resort,q);
  const open=!!MG_SP[sec.id];
  let html=`<div class="sp-wrap"><div class="sp-hdr" onclick="mgSpTog('${sec.id}')">
    <span class="mg-chev">${open?'▾':'▸'}</span> 📷 Related images (${imgs.length})
    <span class="sp-q" onclick="event.stopPropagation();mgSecQEdit('${sec.id}')" title="Edit the search query that picks these images">✏ ${q?eh(q):'set query…'}</span>
  </div>`;
  if(open){
    if(!imgs.length){
      html+=`<div class="sp-none">No gallery file names match${q?` <code>${eh(q)}</code>`:''} — ✏ edit the query, or add images in the 🖼️ Image Gallery tab.</div>`;
    }else{
      const byCat={};imgs.forEach(i=>{(byCat[i.cat||'']=byCat[i.cat||'']||[]).push(i);});
      html+=Object.keys(byCat).map(cid=>`<div class="gp-cat-t" style="padding:0 12px;">📂 ${eh(cid?mgCatPath(resort,cid):'Uncategorised')}</div>
        <div class="sp-grid">${byCat[cid].map(i=>mgSpCardHTML(resort,i,sec.id,sec.type==='fixed')).join('')}</div>`).join('');
    }
  }
  html+=`</div>`;
  return html;
}
function mgSecQEdit(secId){
  const r=S.resorts[S.activeResortId];const sec=getSecDef(secId,r);
  const cur=mgSecQuery(r,sec)||'';
  const def=MG_SEED[secId]||mgTitleSeed(sec.title)||'';
  openModal(`<h3>Section image query</h3>
    <div class="mr2"><label>Search terms (every term must appear in the file name; "quotes" group a phrase)</label>
    <input type="text" id="mgsq" value="${eh(cur)}" placeholder='e.g. f&b "beach dinner"' onkeydown="if(event.key==='Enter')mgSecQSave('${secId}')"></div>
    <div class="ma"><button onclick="closeModal()">Cancel</button>
    ${def?`<button onclick="mgSecQReset('${secId}')">Reset to default (${eh(def)})</button>`:''}
    <button class="bp2" onclick="mgSecQSave('${secId}')">Save</button></div>`);
  setTimeout(()=>{const e=document.getElementById('mgsq');e.focus();e.select();},50);
}
function mgSecQSave(secId){
  const r=S.resorts[S.activeResortId];
  mediaOf(r).secQ[secId]=document.getElementById('mgsq').value.trim();
  saveS();closeModal();renderForm();toast('Query saved');
}
function mgSecQReset(secId){
  const r=S.resorts[S.activeResortId];
  delete mediaOf(r).secQ[secId];
  saveS();closeModal();renderForm();toast('Query reset to default');
}
```

- [ ] **Step 2: Insert the panel in `renderForm`.** Directly after the section-header `</div>` (the line ending the `.fsc-hdr` block, before `if(sec.type==='fixed'){`), add:

```js
  if(sec.type==='fixed'||sec.type==='repeating')html+=mgSecPanelHTML(resort,sec);
```

- [ ] **Step 3: Add CSS** — under the Task-5 gallery-search rules:

```css
/* per-section related-images panel */
.sp-wrap{border:1px solid var(--border);border-radius:var(--rl);margin:0 0 14px;background:var(--surface);}
.sp-hdr{display:flex;align-items:center;gap:7px;padding:9px 12px;font-size:var(--fs-sm);font-weight:600;cursor:pointer;user-select:none;}
.sp-q{margin-left:auto;font-weight:400;font-size:var(--fs-xs);color:var(--text3);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%;}
.sp-q:hover{color:var(--accent);}
.sp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;padding:4px 12px 12px;}
.sp-card{position:relative;}
.sp-th{aspect-ratio:1;border-radius:var(--r);overflow:hidden;background:var(--surface2);display:flex;align-items:center;justify-content:center;cursor:pointer;}
.sp-th img{width:100%;height:100%;object-fit:cover;display:block;}
.sp-nm{font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px;}
.sp-add{position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;line-height:1;display:none;align-items:center;justify-content:center;}
.sp-card:hover .sp-add{display:flex;}
.sp-none{padding:0 12px 12px;font-size:var(--fs-xs);color:var(--text3);}
.sp-suggest{display:flex;align-items:center;gap:8px;padding:7px 10px;margin:0 0 8px;background:var(--al);border-radius:var(--r);font-size:var(--fs-xs);}
```

- [ ] **Step 4: Verify**

Run: `for f in tests/*.test.js; do node "$f" || exit 1; done`
Expected: all `ok`. Browser smoke test (`npx wrangler pages dev public --port 8788`): Bars section shows `📷 Related images (n)` with the F&B images; ✏ opens the query editor; saving/reset re-renders.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat: per-section related-images panel driven by editable search queries"
```

---

### Task 9: One-click attach + per-entry suggestions

**Files:**
- Modify: `public/index.html` — `mgSpCardHTML` (add ＋ button), new attach helpers after the panel block, `renderRepSec` (suggestion row)
- Test: `tests/entry-suggest.test.js`

**Interfaces:**
- Consumes: `imgArr(secId,fId,idx)` (existing — answer array holding `{g:imgId}` refs), `imgRerender`, `mgSpCardHTML(r,i,secId,fixed)` (Task 8), `ensureSecDef(resort,secId)` + `getSecFields(resort,secId)` (existing global-field plumbing), `mediaOf`, `saveS`, `toast`.
- Produces: `mgAttach(secId,fId,idx,imgId)`, `mgAttachFixed(secId,imgId)` (auto-creates a "Photos" image question when the fixed section has none — management wants photo tagging in "Watersports…/Kids Club/Teens Club", "Spa And Wellness", "Resort Facilities", which ship without one), `mgAttachAll(secId,fId,idx,idsCsv)`, `mgEntrySuggest(r,name)` → img[].

- [ ] **Step 1: Write the failing test**

```js
// tests/entry-suggest.test.js — entry-name → gallery image suggestions.
const { load } = require('./_extract');
const { mgEntrySuggest } = load(['mediaOf', 'mgEntrySuggest']);
let fails = 0;
const t = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`FAIL ${label}: got ${JSON.stringify(got)}`); }
  else console.log('ok   ' + label);
};
const r = { media: { cats: [], sets: [], secQ: {}, imgs: [
  { id: 'i1', name: 'Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg' },
  { id: 'i2', name: 'Ananea Madivaru Maldives - F&B - Restaurants & Bars - Asia Street Food - Maldivian - Kaage - 5.jpg' },
  { id: 'i3', name: 'Ananea Madivaru Maldives - Accommodation - Villas - Beach Pool Villa.jpg' },
] } };
t('matches by entry name', mgEntrySuggest(r, 'Flores').map(i => i.id), ['i1']);
t('case-insensitive', mgEntrySuggest(r, 'beach pool villa').map(i => i.id), ['i3']);
t('multi-word entry name', mgEntrySuggest(r, 'Beach Pool Villa').map(i => i.id), ['i3']);
t('no match', mgEntrySuggest(r, 'Sunset Bar').map(i => i.id), []);
t('short names give nothing (guard against noise)', mgEntrySuggest(r, 'a'), []);
t('empty name gives nothing', mgEntrySuggest(r, ''), []);
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/entry-suggest.test.js`
Expected: throws `function mgEntrySuggest not found in index.html`

- [ ] **Step 3: Implement.**

**(a)** Add after `mgSecQReset`:

```js
// ── one-click attach: gallery image → an image question's answer array ──
function mgAttach(secId,fId,idx,imgId){
  const a=imgArr(secId,fId,idx);
  if(a.some(e=>e&&typeof e==='object'&&e.g===imgId)){toast('Already attached');return;}
  a.push({g:imgId});saveS();imgRerender(secId,fId,idx);toast('Image attached');
}
// Fixed sections without an image question get one automatically on first
// attach — same as adding "Photos" via "+ Field", just seamless (asked for
// the Watersports/Kids Club, Spa And Wellness and Resort Facilities sections).
function mgEnsureImagesField(secId){
  const r=S.resorts[S.activeResortId];
  ensureSecDef(r,secId);
  const fields=getSecFields(r,secId);
  let f=fields.find(x=>x.type==='images');
  if(!f){f={id:'cf'+Date.now(),label:'Photos',type:'images'};fields.push(f);toast('Added a “Photos” question to this section');}
  return f.id;
}
function mgAttachFixed(secId,imgId){
  mgAttach(secId,mgEnsureImagesField(secId),-1,imgId);
  renderForm();
}
function mgAttachAll(secId,fId,idx,ids){
  const a=imgArr(secId,fId,idx);let n=0;
  String(ids||'').split(',').filter(Boolean).forEach(id=>{
    if(!a.some(e=>e&&typeof e==='object'&&e.g===id)){a.push({g:id});n++;}
  });
  saveS();renderForm();toast(n+' image(s) attached');
}
function mgEntrySuggest(r,name){
  const n=String(name||'').trim().toLowerCase();
  if(n.length<3)return[];
  return mediaOf(r).imgs.filter(i=>i.name.toLowerCase().includes(n));
}
```

**(b)** In `mgSpCardHTML` (Task 8), add the ＋ button before the closing `</div>` of `.sp-card`:

```js
    ${fixed?`<button class="sp-add" title="Attach to this section's image question" onclick="mgAttachFixed('${secId}','${i.id}')">＋</button>`:''}
```

**(c)** In `renderRepSec`, inside the `items.forEach` loop, right after the `<div class="rep-body" …>` opening tag line, add the suggestion row (a human click is always required — no auto-attach):

```js
    const imgF=rfs.find(f=>f.type==='images');
    if(imgF){
      const already=new Set((Array.isArray(item[imgF.id])?item[imgF.id]:[]).filter(e=>e&&typeof e==='object'&&e.g).map(e=>e.g));
      const cand=mgEntrySuggest(resort,nameVal).filter(i=>!already.has(i.id));
      if(cand.length)html+=`<div class="sp-suggest">💡 ${cand.length} gallery image(s) match “${eh(nameVal)}”
        <button class="mg-btn" onclick="mgAttachAll('${sec.id}','${imgF.id}',${idx},'${cand.map(i=>i.id).join(',')}')">Attach all</button></div>`;
    }
```

- [ ] **Step 4: Run all tests**

Run: `for f in tests/*.test.js; do node "$f" || exit 1; done`
Expected: all `ok`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/entry-suggest.test.js public/index.html
git commit -m "feat: one-click attach from section panels + per-entry gallery suggestions"
```

---

### Task 10: End-to-end verification + docs

**Files:**
- Modify: `README.md` (gallery paragraph)
- Test: full suite + wrangler dev smoke test

- [ ] **Step 1: Full test suite**

Run: `for f in tests/*.test.js; do echo "== $f"; node "$f" || exit 1; done`
Expected: every file all-`ok`, exit 0.

- [ ] **Step 2: Browser smoke test** (needs `npm run db:init:local` once):

Run: `npx wrangler pages dev public --port 8788` then verify in the browser:
1. Gallery: import `media/Ananea Madivaru Maldives/Image Gallery` → categories match the FILENAME hierarchy (e.g. Kids Club images land under `Facilities / Activities / Kids Club`), cards show short labels, hover shows full names.
2. Search `f&b` → only F&B files; `f&b flores` narrows; `💾 Save as photoset` → chip appears with live count; ✏ edit changes results; ✕ deletes chip only.
3. Bars section: `📷 Related images` lists F&B images; ✏ shows `f&b`; a restaurant entry named `Flores` shows the 💡 suggestion row; Attach all links the image; re-clicking reports 0 attached (dedupe).
4. Spa And Wellness (fixed section, no image question): panel shows wellness images; clicking ＋ on one both creates a "Photos" question (toast) and attaches the image; a second ＋ on another image reuses the same question.
5. **Auto-save round-trip** (promised to management): create a photoset, edit a section query, and attach an image — then hard-reload the page (and, if a second browser/profile is handy, open the app there too). All three changes must reappear without any manual save action, proving they synced to D1 rather than living only in the tab's localStorage.
6. Curl sanity: `curl -s localhost:8788 | grep -c mgParseName` → ≥1.

- [ ] **Step 3: Update README** — find the sentence in `README.md` that describes the Image Gallery section (`grep -n "Image Gallery" README.md`) and replace/extend it with this paragraph (adjust surrounding markdown to fit):

```markdown
The 🖼️ Image Gallery organises itself from the media **filename convention**
`<Resort> - <Section> - … - <Label>.jpg` — folder structure is ignored, so a
flat folder dump imports identically to a nested tree. Original filenames are
stored untouched and drive everything: the Lightroom-style search box (terms
AND together, quotes group phrases), saved searches ("photosets") with
editable queries, and the 📷 Related-images panel each survey section shows.
Section panels use an editable per-section query (✏ in the panel header);
images are linked to answers only by explicit clicks (＋ / Attach all).
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: filename-driven gallery, photosets, section image panels"
```
