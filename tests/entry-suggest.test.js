// tests/entry-suggest.test.js — entry-name → gallery image suggestions.
const { load } = require('./_extract');
const { mgEntrySuggest } = load(['mediaOf', 'mgEntrySuggest']);
let fails = 0;
const t = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`FAIL ${label}: got ${JSON.stringify(got)}`); }
  else console.log('ok   ' + label);
};
const r = { media: { cats: [], sets: [], secQ: {}, imgs: [
  { id: 'i1', name: 'Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg' },
  { id: 'i2', name: 'Ananea Madivaru Maldives - F&B - Restaurants & Bars - Asia Street Food - Maldivian - Kaage - 5.jpg' },
  { id: 'i3', name: 'Ananea Madivaru Maldives - Accommodation - Villas - Beach Pool Villa.jpg' },
] } };
t('matches by entry name', mgEntrySuggest(r, 'Flores').map(i => i.id), ['i1']);
t('case-insensitive', mgEntrySuggest(r, 'beach pool villa').map(i => i.id), ['i3']);
t('multi-word entry name', mgEntrySuggest(r, 'Beach Pool Villa').map(i => i.id), ['i3']);
t('no match', mgEntrySuggest(r, 'Sunset Bar').map(i => i.id), []);
t('short names give nothing (guard against noise)', mgEntrySuggest(r, 'a'), []);
t('empty name gives nothing', mgEntrySuggest(r, ''), []);
process.exit(fails ? 1 : 0);
