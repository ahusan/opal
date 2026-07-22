# Resort Survey — Cloudflare data store

A self-contained data store for the Maldives Resort Survey app, all on Cloudflare's
free tier:

- **Pages** hosts the app (`public/index.html`)
- **Pages Functions** (`functions/api/*`) are the API
- **D1** (SQLite) stores the data
- **R2** (object storage) stores resort images (originals + thumbnails)
- **Cloudflare Access** (Zero Trust) handles team login — no login code in the app

The app still keeps a `localStorage` cache, so it loads instantly and keeps working
offline; edits sync to D1 in the background (watch the **● Synced** indicator in the
sidebar).

```
resort-data/
├─ public/index.html               # the app (survey + sync layer + image gallery)
├─ functions/api/resorts.js        # GET list / PUT upsert / DELETE
├─ functions/api/config.js         # shared section/schema config
├─ functions/api/media/[[path]].js # image upload/serve/delete on R2
├─ schema.sql                      # D1 tables
├─ wrangler.toml                   # Pages + D1 + R2 bindings
└─ package.json                    # convenience scripts
```

## Image storage (R2)

Each resort has an **🖼️ Image Gallery** section. Pick the resort's media folder
(e.g. `media/Ananea Madivaru Maldives/Image Gallery`) with **📁 Import media folder…**
and the app rebuilds your folder structure as categories (Accommodation → Beach Pool
Villa, F&B → Flores, …), makes a small thumbnail of every image in the browser, and
uploads both thumbnail and original to R2. Survey questions can then link images
straight from the gallery.

Setup (once):

1. **Create the bucket.** Dashboard → **R2 → Create bucket**, name it `resort-media`
   (or CLI: `npx wrangler r2 bucket create resort-media`).
2. **Bind it to the app.** Pages project → **Settings → Functions → R2 bucket
   bindings → Add** → variable name **`MEDIA`**, bucket **`resort-media`**. Redeploy.
   (Deploying with `wrangler.toml` in this folder does this automatically.)

Notes:

- Images are served through the app (`/api/media/...`), so Cloudflare Access
  protects them exactly like the rest of the site. The bucket needs no public access.
- The gallery structure (categories, names) lives in the resort's row in D1;
  R2 only holds the bytes. Deleting a resort also deletes its images.
- R2 free tier: 10 GB storage — roughly 500+ resort photos at typical sizes.
  Originals are stored untouched; thumbnails are ~50 KB each.

---

## Two ways to set up

- **Path A — Dashboard only (no Node/tooling needed).** Recommended if you don't have
  Node.js installed. You upload files, create the DB, and paste the schema all in the
  Cloudflare web dashboard. See **Path A** below.
- **Path B — CLI (`wrangler`).** Faster for repeat deploys, but needs Node.js. See
  **Path B** below.

---

## Path A — Dashboard only (no Node needed)

1. **Create the Pages project.** Cloudflare dashboard → **Workers & Pages → Create →
   Pages**. Either **Connect to Git** (push this folder to GitHub first) or
   **Upload assets** (zip/drag the project folder). Set **build output directory** to
   `public`. The `functions/` folder is picked up automatically.
2. **Create the database.** **Workers & Pages → D1 → Create database**, name it
   `resort-data`.
3. **Create the tables.** Open the new DB → **Console** tab → paste the contents of
   `schema.sql` → run.
4. **Bind the DB to the app.** Your Pages project → **Settings → Functions → D1 database
   bindings → Add** → variable name **`DB`**, database **`resort-data`**. Redeploy
   (Deployments → Retry/redeploy) so the binding takes effect.
5. **Lock it to your team** — see **Step 5** below.

That's the whole thing, no terminal required.

---

## Path B — CLI (`wrangler`)

Requires [Node.js](https://nodejs.org) (LTS). Then:

```bash
npm install
npx wrangler login
```

### 1. Create the D1 database

```bash
npx wrangler d1 create resort-data
```

Copy the printed `database_id` into **`wrangler.toml`** (replace
`REPLACE_WITH_YOUR_D1_DATABASE_ID`).

### 2. Create the tables

```bash
npm run db:init          # remote (production DB)
npm run db:init:local    # local dev DB (only needed if you run `npm run dev`)
```

### 3. Run locally (optional)

```bash
npm run dev
```

Opens at `http://localhost:8788`. Without Cloudflare Access in front, writes are
attributed to `local`.

### 4. Deploy

```bash
npm run deploy
```

First deploy will prompt to create the Pages project. After it finishes you get a
`https://resort-data.pages.dev` URL (or your custom domain).

> **Git option:** instead of `npm run deploy`, you can push this folder to GitHub and
> connect it in **Cloudflare → Workers & Pages → Create → Pages → Connect to Git**.
> Set the build output directory to `public` and add the D1 binding (name `DB`) in the
> project's **Settings → Functions → D1 database bindings**. Every push then deploys.

### 5. Lock it to your team (Cloudflare Access)

1. **Cloudflare dashboard → Zero Trust → Access → Applications → Add an application**
2. Type **Self-hosted**, set the domain to your Pages URL.
3. Add a policy: **Allow** → Include → *Emails* (list your team) or *Emails ending in*
   your company domain.
4. Save. Now visiting the site requires a login, and the API automatically records
   each writer's email in `updated_by`.

That's it — `$0/month` for this data volume.

---

## Migrating existing data

Your current data lives in one browser's `localStorage`. To move it in:

1. Open the **old** artifact → **Export → Download .json**.
2. Open the **new** deployed app → **Import** → drop that `.json` file.

The import pushes every resort straight into D1. (If you happen to open the new app in
a browser that already has local data and the DB is empty, it auto-seeds the DB from
that cache on first load.)

## Entering data

The form opens in **entry mode**: only answers, comments, and minimise controls are
visible. Click **🔧 Edit form** in the topbar to reveal the schema tools (rename or
delete questions, add fields/options/sections) and **✅ Done editing** to hide them
again. While entering: typing saves continuously (no need to click away), **Enter**
jumps to the next field, each tab shows its completion count, and Prev/Next buttons
at the bottom of a section move you through the survey in order.

## How sync works

- Every edit saves to `localStorage` instantly, then schedules a debounced push (~1.2s).
- Only the **active resort's** row is pushed (plus the shared section config) — so two
  people editing *different* resorts never overwrite each other. Same resort = last
  save wins on that one resort only.
- If the network is down, the indicator shows **● Offline — saved locally** and retries
  on the next edit; nothing is lost.

## Disaster recovery — D1 Time Travel

D1 keeps **30 days of point-in-time history automatically** (no setup needed). If data
is ever lost or corrupted (bad import, accidental "Clear all data", bug):

```bash
# See the current restore point / bookmark
npx wrangler d1 time-travel info resort-data

# Restore the database to how it was at a specific moment (UTC)
npx wrangler d1 time-travel restore resort-data --timestamp=2026-07-22T10:00:00Z
```

Restore as soon as possible after the incident — writes made *after* the restore point
are lost, and history only goes back 30 days. Note R2 images are not covered by Time
Travel; deleted images are gone (the app only deletes them when a resort is deleted).
