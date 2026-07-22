# Resort Data — Handoff / TODO

Self-contained notes to continue this project in **WSL** (Windows has no dev tools).
Pick this up from a fresh session: everything needed is in this file.

---

## What this project is

A team data store for the Maldives Resort Survey app, on Cloudflare's free tier:

- **Cloudflare Pages** hosts the app (`public/index.html`)
- **Pages Functions** (`functions/api/*`) are the API
- **D1** (SQLite) stores the data
- **R2** (bucket `resort-media`, binding `MEDIA`) stores resort images — see README
  "Image storage". The app's 🖼️ Image Gallery section + image fields upload to it.
- **Cloudflare Access** (Zero Trust) handles team login (no auth code in the app)

The app keeps a `localStorage` cache (instant load + offline), and syncs edits to D1 in
the background. Watch the **● Synced / Saving… / Offline** indicator in the sidebar.

### File map
```
public/index.html          App + remote-sync layer. Sync code is the block under
                           "REMOTE SYNC — Cloudflare D1" (search that string).
functions/api/resorts.js   GET list / PUT upsert / DELETE one / DELETE all
functions/api/config.js    GET/PUT the shared { customSections, sectionOrder, hiddenSections }
schema.sql                 D1 tables: resorts, app_config
wrangler.toml              Pages + D1 binding (needs database_id pasted in)
package.json               dev/deploy/db scripts
.claude/launch.json        Local dev server config (npm run dev → wrangler, port 8788)
README.md                  Full setup guide (dashboard path + CLI path)
```

---

## Step 0 — Move into WSL

Copy the folder into the WSL filesystem (faster than working under `/mnt/c`):

```bash
cp -r "/mnt/c/Users/ahusan/Documents/Resort Data" ~/resort-data
cd ~/resort-data
```

Note: files were authored on Windows; line endings are fine for JS/JSON/SQL. The folder
name has a space — the copy above renames it to `resort-data` to avoid quoting pain.

---

## Step 1 — Get it running locally

```bash
node --version        # install Node LTS first if missing (nvm recommended)
npm install           # pulls in wrangler
npx wrangler login    # opens browser to authenticate Cloudflare

# create the D1 database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create resort-data

npm run db:init:local # create tables in the LOCAL dev DB
npm run dev           # http://localhost:8788  (serves app + /api)
```

Without Cloudflare Access in front, local writes are attributed to `local`.

---

## Step 2 — Deploy

```bash
npm run db:init       # create tables in the REMOTE (production) DB
npm run deploy        # creates the Pages project, returns a *.pages.dev URL
```

Then lock it to the team — **Cloudflare dashboard → Zero Trust → Access → Add an
application** (Self-hosted) over the Pages URL, policy = team emails. After that the API
gets each writer's email in `updated_by` automatically.

(Full dashboard-only alternative — no CLI — is in `README.md` Path A.)

---

## Step 3 — Migrate existing data

Use **🗄️ Download full backup (.json)** in the new app's Export view — it's lossless
(answers, comments, gallery structure, section layout) and re-imports via the same
Import card. Alternatively, open the deployed app in the browser that holds the old
data while the DB is empty — it will *ask* before seeding D1 from that cache.

(The old flat .json/.ndjson exports are for Elasticsearch pipelines only; importing
them creates name+comment shells and never overwrites a resort that has data.)

---

## TODO — improvements before go-live

**Status 2026-07-22: items 1–7 are DONE** (see git log on the `hardening` branch);
item 8 is partially done — payload validation shipped, Time Travel documented in
README (it's automatic), scheduled backup export still open.

### 🔴 1. Make backup/restore lossless  (file: `public/index.html`)
- **Problem:** `flatR()` flattens resorts for export; `handleImport()` only reads
  `id`/`resort_name`/`_comments` and sets `data:{}`, `repeating:{}` — so a JSON export
  re-imports as an empty shell. Verified.
- **Fix:** add a "Download full backup" that dumps raw `Object.values(S.resorts)`
  (full nested objects, not `flatR`), plus a restore that detects raw objects and
  repopulates `data`/`repeating`/`comments`/`sectionDefs`. Keep the existing flat
  NDJSON/CSV exports for downstream/Elasticsearch use.

### 🔴 2. Stop offline edits being wiped on reload  (file: `public/index.html`)
- **Problem:** the dirty set (`_dirtyResorts`) is in-memory only. If a push fails
  (offline) and the tab is closed, `loadRemote()` overwrites `localStorage` with the
  older server copy on next load → offline edit lost.
- **Fix:** persist a pending-changes queue in `localStorage`; on `bootstrap()`, replay
  pending pushes, and when merging server vs local prefer the newer `updated_at` per
  resort instead of blindly trusting the server.

### 🔴 3. Prevent stale-tab overwrite of the same resort
  (files: `public/index.html`, `functions/api/resorts.js`, `schema.sql`)
- **Problem:** whole resort doc is pushed as one blob with no version check; a long-open
  tab can overwrite a teammate's newer edits.
- **Fix:** add `updated_at`/`version` per resort; `onRequestPut` rejects a write whose
  base version is older than what's stored (return 409). Client re-fetches a resort in
  `openResort()` and warns on conflict.

### 🔴 4. Guard "Clear all data"  (file: `public/index.html`, `doClear`/`clearAllData`)
- **Problem:** one click + one confirm now wipes the whole team's D1 data via
  `DELETE /api/resorts?all=true`.
- **Fix:** require typing a confirm phrase (e.g. "DELETE ALL"), or remove the button in
  the team build.

### 🟡 5. API defense-in-depth  (files: `functions/api/*.js`)
- **Problem:** functions trust Cloudflare Access entirely; if Access is misconfigured/off
  the DB/API is open.
- **Fix:** reject any request missing the `Cf-Access-Authenticated-User-Email` header
  (the `who()` helper already reads it). Allow a dev bypass for localhost.

### 🟡 6. Surface "last edited by · when"  (file: `public/index.html`)
- `updated_by`/`updated_at` are already stored. Show them in the sidebar/topbar.

### 🟡 7. Background refresh  (file: `public/index.html`)
- Poll `/api/resorts` every ~30s so open tabs see teammates' new/changed resorts.
  Merge by `updated_at`; don't clobber the resort being actively edited.

### 🟢 8. Safety net
- Enable **D1 Time Travel** (point-in-time restore) and/or a scheduled backup export.
- Add basic size/validation limits on the API `doc` payload.

---

## Quick reference — npm scripts
```
npm run dev            # local dev server (wrangler pages dev) on :8788
npm run deploy         # deploy to Cloudflare Pages
npm run db:init        # create tables in remote D1
npm run db:init:local  # create tables in local dev D1
```
