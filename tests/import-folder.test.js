// tests/import-folder.test.js — mgImportParts: folder-path fallback mapping.
// Wrapper folders (media / <resort folder, any name> / Image Gallery) never
// become categories; cut at the DEEPEST wrapper.
const { load } = require('./_extract');
const { mgImportParts } = load(['cleanSeg', 'mgImportParts']);

let fails = 0;
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`FAIL ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

// resort folder name ≠ app resort name — must still strip (the original bug)
eq('picked media/, name mismatch',
  mgImportParts('media/Ananea Madivaru Maldives/Image Gallery/Kids Club/a.jpg', 'bodumas resort and spa').parts,
  ['Kids Club']);
eq('picked resort folder',
  mgImportParts('Ananea Madivaru Maldives/Image Gallery/F&B_/Flores/a.jpg', 'x').parts,
  ['F&B', 'Flores']);
eq('picked Image Gallery',
  mgImportParts('Image Gallery/Accommodation/Beach Pool Villa_/a.jpg', 'x').parts,
  ['Accommodation', 'Beach Pool Villa']);
eq('no wrapper anywhere — only picked root dropped',
  mgImportParts('Holiday pics/Pool/a.jpg', 'x').parts,
  ['Pool']);
eq('resortSeg reported from segment above Image Gallery',
  mgImportParts('media/Ananea Madivaru Maldives/Image Gallery/Kids Club/a.jpg', 'x').resortSeg,
  'Ananea Madivaru Maldives');
process.exit(fails ? 1 : 0);
