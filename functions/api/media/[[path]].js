// Cloudflare Pages Function — /api/media/*
// Image storage on R2 (binding: MEDIA). Objects are keyed by
//   media/<resortId>/<imageId>/orig    — the original file
//   media/<resortId>/<imageId>/thumb   — a small JPEG preview made client-side
//
//   PUT    /api/media/<resortId>/<imageId>/<orig|thumb>   body = raw image bytes
//          (Content-Type header is stored and echoed back on GET)
//   GET    /api/media/<resortId>/<imageId>/<orig|thumb>   → the image (cached)
//   DELETE /api/media/<resortId>/<imageId>                → delete orig + thumb
//   DELETE /api/media/<resortId>                          → delete ALL images of a resort
//
// The gallery structure (categories, names, which image belongs where) lives in
// the resort's doc in D1 — R2 only holds the bytes.

const J = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const KINDS = new Set(['orig', 'thumb']);
const ID_OK = /^[A-Za-z0-9_.-]+$/; // resort + image ids are generated, keep keys safe

function parsePath(params) {
  // params.path is the [[path]] catch-all: array of segments after /api/media/
  const seg = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);
  const [resortId, imageId, kind] = seg;
  if (resortId && !ID_OK.test(resortId)) return null;
  if (imageId && !ID_OK.test(imageId)) return null;
  if (kind && !KINDS.has(kind)) return null;
  return { resortId, imageId, kind };
}

const key = (r, i, k) => `media/${r}/${i}/${k}`;

export async function onRequestPut({ env, request, params }) {
  if (!env.MEDIA) return J({ error: 'R2 binding MEDIA is not configured' }, 500);
  const p = parsePath(params);
  if (!p || !p.resortId || !p.imageId || !p.kind) return J({ error: 'bad path' }, 400);
  const ct = request.headers.get('Content-Type') || 'application/octet-stream';
  if (!ct.startsWith('image/')) return J({ error: 'only image uploads are allowed' }, 415);
  // Workers request bodies are capped (~100MB) well above any camera JPEG.
  await env.MEDIA.put(key(p.resortId, p.imageId, p.kind), request.body, {
    httpMetadata: { contentType: ct, cacheControl: 'public, max-age=31536000, immutable' },
  });
  return J({ ok: true });
}

export async function onRequestGet({ env, params }) {
  if (!env.MEDIA) return J({ error: 'R2 binding MEDIA is not configured' }, 500);
  const p = parsePath(params);
  if (!p || !p.resortId || !p.imageId || !p.kind) return J({ error: 'bad path' }, 400);
  const obj = await env.MEDIA.get(key(p.resortId, p.imageId, p.kind));
  if (!obj) return J({ error: 'not found' }, 404);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  if (!h.has('Cache-Control')) h.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers: h });
}

export async function onRequestDelete({ env, params }) {
  if (!env.MEDIA) return J({ error: 'R2 binding MEDIA is not configured' }, 500);
  const p = parsePath(params);
  if (!p || !p.resortId) return J({ error: 'bad path' }, 400);
  if (p.imageId) {
    await env.MEDIA.delete([key(p.resortId, p.imageId, 'orig'), key(p.resortId, p.imageId, 'thumb')]);
    return J({ ok: true });
  }
  // Delete every object under this resort (used when a resort is deleted).
  let cursor;
  do {
    const list = await env.MEDIA.list({ prefix: `media/${p.resortId}/`, cursor });
    if (list.objects.length) await env.MEDIA.delete(list.objects.map(o => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return J({ ok: true });
}
