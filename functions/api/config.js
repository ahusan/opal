// Cloudflare Pages Function — /api/config
//   GET /api/config  → the single shared config row { doc, updated_at, updated_by }
//   PUT /api/config  → upsert it  { doc, base? }
// `doc` holds { customSections, sectionOrder, hiddenSections, globalSectionDefs }
// as a JSON string — the section/schema layout shared by the whole team.
// DB binding is `DB` (D1).

const J = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Cloudflare Access injects the verified user's email; falls back to 'local' in dev.
const who = (request) => request.headers.get('Cf-Access-Authenticated-User-Email') || 'local';

export async function onRequestGet({ env }) {
  const row = await env.DB.prepare("SELECT doc, updated_at, updated_by FROM app_config WHERE id = 'global'").first();
  return J(row || { doc: null, updated_at: null });
}

export async function onRequestPut({ env, request }) {
  const b = await request.json().catch(() => null);
  if (!b || !b.doc) return J({ error: 'doc required' }, 400);
  if (typeof b.doc !== 'string' || b.doc.length > 1024 * 1024) return J({ error: 'doc must be a JSON string under 1MB' }, 400);
  try { JSON.parse(b.doc); } catch { return J({ error: 'doc is not valid JSON' }, 400); }
  // Optimistic concurrency (same contract as /api/resorts): clients send `base` =
  // the updated_at they last saw (null when they've never pulled a stamped row).
  // A mismatch means another browser wrote the section layout in between — 409
  // with the server copy so the client can resolve, instead of letting the
  // stalest tab silently wipe the team's sections. Requests without `base`
  // (old clients) keep the legacy last-write-wins behavior.
  if ('base' in b) {
    const row = await env.DB.prepare("SELECT doc, updated_at, updated_by FROM app_config WHERE id = 'global'").first();
    if (row && (row.updated_at || null) !== b.base) {
      return J({ error: 'conflict', server: { doc: row.doc, updated_at: row.updated_at, updated_by: row.updated_by } }, 409);
    }
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO app_config (id, doc, updated_at, updated_by) VALUES ('global', ?1, ?2, ?3)
     ON CONFLICT(id) DO UPDATE SET doc = ?1, updated_at = ?2, updated_by = ?3`
  ).bind(b.doc, now, who(request)).run();
  return J({ ok: true, updated_at: now });
}
