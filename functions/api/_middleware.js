// Runs before every /api/* function. Defense-in-depth: the app is meant to sit
// behind Cloudflare Access, which injects the verified user's email header. If
// Access is ever misconfigured, disabled, or the project is reached via a URL the
// Access policy doesn't cover, this stops the API (including DELETE all) from
// being wide open — an anonymous request gets a 401 instead of the database.
//
// Local dev (`wrangler pages dev` on localhost) has no Access in front, so
// localhost requests are allowed through and attributed to 'local'.
//
// Note: this checks header *presence*, which blocks accidental exposure but not
// a deliberate attacker spoofing the header on an Access-less deployment. For
// full protection, validate the `Cf-Access-Jwt-Assertion` JWT against your team's
// public keys (https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/).

export async function onRequest({ request, next }) {
  const { hostname } = new URL(request.url);
  const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (!isLocalDev && !email) {
    return new Response(JSON.stringify({ error: 'unauthorized — Cloudflare Access required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return next();
}
