// Cloudflare Pages Function — /api/resorts
//   GET    /api/resorts            → list every resort row
//   PUT    /api/resorts            → upsert one resort  { id, name, doc }
//   DELETE /api/resorts?id=<id>    → delete one resort
//   DELETE /api/resorts?all=true   → delete ALL resorts (used by "Clear all data")
// `doc` is the full resort object as a JSON string. The DB binding is `DB` (D1).

const J = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Cloudflare Access injects the verified user's email; falls back to 'local' in dev.
const who = (request) => request.headers.get('Cf-Access-Authenticated-User-Email') || 'local';

export async function onRequestGet({ env }) {
  const { results } = await env.DB
    .prepare('SELECT id, name, doc, updated_at, updated_by FROM resorts')
    .all();
  return J(results || []);
}

export async function onRequestPut({ env, request }) {
  const b = await request.json().catch(() => null);
  if (!b || !b.id || !b.doc) return J({ error: 'id and doc are required' }, 400);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO resorts (id, name, doc, updated_at, updated_by)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(id) DO UPDATE SET name = ?2, doc = ?3, updated_at = ?4, updated_by = ?5`
  ).bind(b.id, b.name || '', b.doc, now, who(request)).run();
  return J({ ok: true, updated_at: now });
}

export async function onRequestDelete({ env, request }) {
  const url = new URL(request.url);
  if (url.searchParams.get('all') === 'true') {
    await env.DB.prepare('DELETE FROM resorts').run();
    return J({ ok: true });
  }
  const id = url.searchParams.get('id');
  if (!id) return J({ error: 'id required' }, 400);
  await env.DB.prepare('DELETE FROM resorts WHERE id = ?1').bind(id).run();
  return J({ ok: true });
}
