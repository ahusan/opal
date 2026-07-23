// tests/parse.test.js — every non-JSON <script> block in index.html must parse.
const { html } = require('./_extract');
const blocks = [...html.matchAll(/<script(?![^>]*src)([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/application\/json/.test(m[1]));
if (!blocks.length) { console.log('FAIL: no script blocks found'); process.exit(1); }
blocks.forEach((m, i) => { new Function(m[2]); console.log(`ok   script block ${i} parses (${m[2].length} chars)`); });
