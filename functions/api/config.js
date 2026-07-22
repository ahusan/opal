// Cloudflare Pages Function — /api/config
//   GET /api/config  → the single shared config row { doc }
//   PUT /api/config  → upsert it  { doc }
// `doc` holds { customSections, sectionOrder, hiddenSections } as a JSON string —
// the section/schema layout shared by the whole team. DB binding is `DB` (D1).

const J = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export async function onRequestGet({ env }) {
  const row = await env.DB.prepare("SELECT doc FROM app_config WHERE id = 'global'").first();
  return J(row || { doc: null });
}

export async function onRequestPut({ env, request }) {
  const b = await request.json().catch(() => null);
  if (!b || !b.doc) return J({ error: 'doc required' }, 400);
  if (typeof b.doc !== 'string' || b.doc.length > 1024 * 1024) return J({ error: 'doc must be a JSON string under 1MB' }, 400);
  try { JSON.parse(b.doc); } catch { return J({ error: 'doc is not valid JSON' }, 400); }
  await env.DB.prepare(
    `INSERT INTO app_config (id, doc) VALUES ('global', ?1)
     ON CONFLICT(id) DO UPDATE SET doc = ?1`
  ).bind(b.doc).run();
  return J({ ok: true });
}
