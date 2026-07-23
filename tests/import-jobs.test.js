// tests/import-jobs.test.js — mgJobParts: filenames beat folders; identical
// category tree for the legacy folder tree and the flat one-folder dump.
const { load } = require('./_extract');
const { mgJobParts } = load(['cleanSeg', 'mgParseName', 'mgImportParts', 'mgJobParts']);

let fails = 0;
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`FAIL ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

const NAME = 'Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg';
const WANT = ['F&B', 'Restaurants & Bars', 'Flores'];
eq('flat dump (folder = resort name)', mgJobParts('Ananea Madivaru Maldives/' + NAME, NAME, 'x'), WANT);
eq('legacy folder tree — filename still wins', mgJobParts('media/Ananea Madivaru Maldives/Image Gallery/F&B_/Flores/' + NAME, NAME, 'x'), WANT);
eq('no folders at all', mgJobParts(NAME, NAME, 'x'), WANT);
eq('non-conforming name falls back to folders',
  mgJobParts('Image Gallery/Kids Club/holiday.jpg', 'holiday.jpg', 'x'), ['Kids Club']);
eq('non-conforming name, no folders → uncategorised',
  mgJobParts('holiday.jpg', 'holiday.jpg', 'x'), []);
process.exit(fails ? 1 : 0);
