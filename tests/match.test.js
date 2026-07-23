// tests/match.test.js — mgMatch: Lightroom semantics.
const { load } = require('./_extract');
const { mgMatch } = load(['mgQTerms', 'mgMatch']);
const NAME = 'Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg';
let fails = 0;
const t = (label, got, want) => {
  if (got !== want) { fails++; console.log(`FAIL ${label}: got ${got}`); }
  else console.log(`ok   ${label}`);
};
t('single term', mgMatch('ananea', NAME), true);
t('case-insensitive', mgMatch('FLORES', NAME), true);
t('multi-term AND, both present', mgMatch('ananea f&b', NAME), true);
t('multi-term AND, one missing', mgMatch('ananea sunset', NAME), false);
t('quoted phrase present', mgMatch('"restaurants & bars"', NAME), true);
t('quoted phrase absent', mgMatch('"kids club"', NAME), false);
t('quotes + bare term', mgMatch('"restaurants & bars" flores', NAME), true);
t('empty query matches all', mgMatch('', NAME), true);
t('whitespace-only query matches all', mgMatch('   ', NAME), true);
t('no match on empty name', mgMatch('x', ''), false);
process.exit(fails ? 1 : 0);
