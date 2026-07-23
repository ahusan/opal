// tests/sec-query.test.js — section queries: override ?? seed ?? title-derived.
const { load } = require('./_extract');
const { mgSecQuery, mgTitleSeed, MG_SEED } = load(['mediaOf', 'mgTitleSeed', 'mgSecQuery'], ['MG_SEED', 'MG_STOP']);
let fails = 0;
const t = (label, got, want) => {
  if (got !== want) { fails++; console.log(`FAIL ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log('ok   ' + label);
};

const r = { media: { cats: [], imgs: [], sets: [], secQ: {} } };
t('bars seed', mgSecQuery(r, { id: 'bars', title: 'Bars' }), 'f&b');
t('restaurants seed', mgSecQuery(r, { id: 'restaurants', title: 'Restaurants' }), 'f&b');
t('villa types seed', mgSecQuery(r, { id: 'room_types', title: 'Villa / room types' }), 'accommodation');
t('family seed', mgSecQuery(r, { id: 'family', title: 'Family & kids' }), 'kids');
t('custom section → longest non-stopword of title',
  mgSecQuery(r, { id: 'cs123', title: 'Spa And Wellness' }), 'wellness');
t('custom watersports section',
  mgSecQuery(r, { id: 'cs456', title: 'Watersports, Scuba Diving, Island Sports / Activities / Kids Club / Teens Club' }), 'watersports');
t('stopword-only title → null', mgSecQuery(r, { id: 'cs789', title: 'The And For' }), null);
r.media.secQ.bars = 'beach bar';
t('override beats seed', mgSecQuery(r, { id: 'bars', title: 'Bars' }), 'beach bar');
r.media.secQ.bars = '';
t('empty override disables the query', mgSecQuery(r, { id: 'bars', title: 'Bars' }), null);
t('mgTitleSeed short words filtered', mgTitleSeed('Spa'), null);
t('seed table has no gallery/faq entries', MG_SEED.media_gallery === undefined && MG_SEED.faq === undefined, true);

// Seeds must actually hit the real filename convention (spec: "seeds against real filenames").
const { mgMatch } = load(['mgQTerms', 'mgMatch']);
t('bars seed hits F&B files', mgMatch(MG_SEED.bars, 'Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg'), true);
t('villa seed hits accommodation files', mgMatch(MG_SEED.room_types, 'Ananea Madivaru Maldives - Accommodation - Villas - Beach Pool Villa.jpg'), true);
t('family seed hits kids files', mgMatch(MG_SEED.family, 'Ananea Madivaru Maldives - Facilities - Activities - Kids Club - 25.jpg'), true);
t('wellness title-seed hits spa files', mgMatch('wellness', 'Ananea Madivaru Maldives - Facilities - Wellness - Spa and Yoga Pavillion - Yoga.png'), true);
t('profile seed hits general files', mgMatch(MG_SEED.resort_profile, 'Ananea Madivaru Maldives - General - Island Aerial - 19.jpg'), true);
t('bars seed does NOT hit kids files', mgMatch(MG_SEED.bars, 'Ananea Madivaru Maldives - Facilities - Activities - Kids Club - 25.jpg'), false);
process.exit(fails ? 1 : 0);
