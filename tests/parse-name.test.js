// tests/parse-name.test.js — mgParseName: filenames ARE the structure.
const { load } = require('./_extract');
const { mgParseName } = load(['cleanSeg', 'mgParseName']);

let fails = 0;
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`FAIL ${label}:\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

eq('standard name',
  mgParseName('Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg'),
  { cats: ['F&B', 'Restaurants & Bars', 'Flores'], label: '6',
    stripped: 'F&B - Restaurants & Bars - Flores - 6.jpg' });
eq('doubled resort prefix collapses',
  mgParseName('Ananea Madivaru Maldives - Ananea Madivaru Maldives - F&B - Restaurants & Bars - Flores - 6.jpg'),
  { cats: ['F&B', 'Restaurants & Bars', 'Flores'], label: '6',
    stripped: 'F&B - Restaurants & Bars - Flores - 6.jpg' });
eq('non-numeric label',
  mgParseName('Ananea Madivaru Maldives - Facilities - Wellness - Spa and Yoga Pavillion - Yoga.png'),
  { cats: ['Facilities', 'Wellness', 'Spa and Yoga Pavillion'], label: 'Yoga',
    stripped: 'Facilities - Wellness - Spa and Yoga Pavillion - Yoga.png' });
eq('deep hierarchy',
  mgParseName('Ananea Madivaru Maldives - F&B - Restaurants & Bars - Asia Street Food - Maldivian - Kaage - 5.jpg').cats,
  ['F&B', 'Restaurants & Bars', 'Asia Street Food', 'Maldivian', 'Kaage']);
eq('non-conforming name → cats null',
  mgParseName('plain-photo.jpg'),
  { cats: null, label: 'plain-photo.jpg', stripped: 'plain-photo.jpg' });
eq('two segments only (resort + label) → cats null, stripped drops resort',
  mgParseName('Ananea Madivaru Maldives - beach.jpg'),
  { cats: null, label: 'Ananea Madivaru Maldives - beach.jpg', stripped: 'beach.jpg' });
eq('empty input safe', mgParseName(''), { cats: null, label: '', stripped: '' });
process.exit(fails ? 1 : 0);
