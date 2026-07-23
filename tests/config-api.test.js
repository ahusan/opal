// tests/config-api.test.js — /api/config optimistic concurrency (mirrors /api/resorts).
// Imports the real Pages Function (ESM) via a .mjs copy, drives it with a mock D1.
const fs = require('fs');
const os = require('os');
const path = require('path');

// D1 mock: .prepare(sql).bind(...).first()/run(); GET path calls .first() without bind.
function mockDB(row) {
  const calls = { writes: [] };
  const db = {
    row,
    calls,
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...a) { stmt.args = a; return stmt; },
        async first() { return db.row; },
        async run() {
          calls.writes.push({ sql, args: stmt.args });
          return { success: true };
        },
      };
      return stmt;
    },
  };
  return db;
}

const req = (body, email) => ({
  json: async () => body,
  headers: { get: (h) => (h === 'Cf-Access-Authenticated-User-Email' ? email || null : null) },
});

async function main() {
  const src = path.join(__dirname, '..', 'functions', 'api', 'config.js');
  const tmp = path.join(os.tmpdir(), 'opal-config-' + Date.now() + '.mjs');
  fs.copyFileSync(src, tmp);
  const mod = await import('file://' + tmp);
  fs.unlinkSync(tmp);

  let fails = 0;
  const t = (label, ok) => { if (!ok) { fails++; console.log('FAIL ' + label); } else console.log('ok   ' + label); };
  const jbody = async (res) => JSON.parse(await res.text());

  // GET returns doc + updated_at
  {
    const db = mockDB({ doc: '{"x":1}', updated_at: 'T1', updated_by: 'a@b.c' });
    const res = await mod.onRequestGet({ env: { DB: db } });
    const b = await jbody(res);
    t('GET returns doc', b.doc === '{"x":1}');
    t('GET returns updated_at', b.updated_at === 'T1');
  }
  // GET with no row
  {
    const db = mockDB(undefined);
    db.prepare = (sql) => ({ async first() { return null; }, bind() { return this; } });
    const b = await jbody(await mod.onRequestGet({ env: { DB: db } }));
    t('GET empty → doc null', b.doc === null);
  }
  // PUT without base → legacy last-write-wins still accepted
  {
    const db = mockDB({ doc: '{}', updated_at: 'T1' });
    const res = await mod.onRequestPut({ env: { DB: db }, request: req({ doc: '{"a":1}' }) });
    const b = await jbody(res);
    t('PUT no base → ok (legacy)', res.status === 200 && b.ok === true && typeof b.updated_at === 'string');
    t('PUT no base → wrote', db.calls.writes.length === 1);
  }
  // PUT with matching base → ok
  {
    const db = mockDB({ doc: '{}', updated_at: 'T1', updated_by: 'x' });
    const res = await mod.onRequestPut({ env: { DB: db }, request: req({ doc: '{"a":1}', base: 'T1' }, 'me@x.y') });
    const b = await jbody(res);
    t('PUT matching base → ok', res.status === 200 && b.ok === true);
    t('PUT stamps updated_by from Access header', db.calls.writes[0].args.includes('me@x.y'));
  }
  // PUT with stale base → 409 with server copy
  {
    const db = mockDB({ doc: '{"srv":true}', updated_at: 'T2', updated_by: 'them@x.y' });
    const res = await mod.onRequestPut({ env: { DB: db }, request: req({ doc: '{"a":1}', base: 'T1' }) });
    const b = await jbody(res);
    t('PUT stale base → 409', res.status === 409 && b.error === 'conflict');
    t('409 carries server doc+stamp+who', b.server && b.server.doc === '{"srv":true}' && b.server.updated_at === 'T2' && b.server.updated_by === 'them@x.y');
    t('PUT stale base → no write', db.calls.writes.length === 0);
  }
  // PUT base:null against a row someone already stamped → 409 (client thought it was new/unstamped)
  {
    const db = mockDB({ doc: '{"srv":true}', updated_at: 'T2', updated_by: 'them@x.y' });
    const res = await mod.onRequestPut({ env: { DB: db }, request: req({ doc: '{"a":1}', base: null }) });
    t('PUT base:null vs stamped row → 409', res.status === 409);
  }
  // PUT base:null against a legacy row with NULL updated_at (pre-migration) → ok
  {
    const db = mockDB({ doc: '{"srv":true}', updated_at: null, updated_by: null });
    const res = await mod.onRequestPut({ env: { DB: db }, request: req({ doc: '{"a":1}', base: null }) });
    t('PUT base:null vs pre-migration row → ok', res.status === 200);
  }
  // PUT base:null with no row at all → ok
  {
    const db = mockDB(null);
    const res = await mod.onRequestPut({ env: { DB: db }, request: req({ doc: '{"a":1}', base: null }) });
    t('PUT base:null, no row → ok', res.status === 200);
  }
  // Validation unchanged
  {
    const db = mockDB(null);
    const r1 = await mod.onRequestPut({ env: { DB: db }, request: req({}) });
    t('PUT missing doc → 400', r1.status === 400);
    const r2 = await mod.onRequestPut({ env: { DB: db }, request: req({ doc: 'not json' }) });
    t('PUT invalid JSON → 400', r2.status === 400);
  }

  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.log('FAIL (exception): ' + e.message); process.exit(1); });
