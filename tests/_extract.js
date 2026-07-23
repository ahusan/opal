// tests/_extract.js — pull real function/const definitions out of public/index.html
// so tests run the shipped code without duplicating logic.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function fnSrc(name) {
  const i0 = html.indexOf('function ' + name + '(');
  if (i0 < 0) throw new Error('function ' + name + ' not found in index.html');
  let i = html.indexOf('{', i0), d = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') d++;
    else if (html[i] === '}') { d--; if (!d) break; }
  }
  return html.slice(i0, i + 1);
}

function constSrc(name) {
  const i0 = html.indexOf('const ' + name + '=');
  if (i0 < 0) throw new Error('const ' + name + ' not found in index.html');
  let i = html.indexOf('{', i0);
  if (i < 0 || i > html.indexOf(';', i0)) return html.slice(i0, html.indexOf(';', i0) + 1);
  let d = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') d++;
    else if (html[i] === '}') { d--; if (!d) break; }
  }
  return html.slice(i0, html.indexOf(';', i) + 1);
}

function load(fns, consts = []) {
  const src = [...consts.map(constSrc), ...fns.map(fnSrc)].join('\n');
  const ctx = {};
  new Function('ctx', src + '\n' + fns.map(n => `ctx.${n}=${n};`).join('') +
    consts.map(n => `ctx.${n}=${n};`).join(''))(ctx);
  return ctx;
}

module.exports = { html, fnSrc, constSrc, load };
