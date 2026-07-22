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
  await env.DB.prepare(
    `INSERT INTO app_config (id, doc) VALUES ('global', ?1)
     ON CONFLICT(id) DO UPDATE SET doc = ?1`
  ).bind(b.doc).run();
  return J({ ok: true });
}
