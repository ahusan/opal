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
