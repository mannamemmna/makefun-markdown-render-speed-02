// parse.js — a dependency-free Markdown-to-HTML parser whose output is
// byte-identical to marked 18.1.3 with default options (gfm, no breaks).
// Written from scratch; marked's published behavior is the reference spec.

// ---------------------------------------------------------------------------
// Regex tables. Sources follow the GFM rule set of the reference implementation.
// Most block/inline rules are anchored and are driven with sticky ("y") clones
// so the lexer can advance an index instead of slicing per token.
// ---------------------------------------------------------------------------

const K = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';

const comment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;

const blockRules = {
  newline: /^(?:[ \t]*(?:\n|$))+/,
  code: /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,
  fences: /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}(?:(?=`)\1`*|(?=~)\1~*) *(?=\n|$)|$)/,
  heading: /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,
  hr: /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,
  blockquote: /^( {0,3}> ?(?:(?![ \t]*(?:\n|$))(([^\n]+(?:\n(?! {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)| {0,3}#{1,6}(?:\s|$)| {0,3}>| {0,3}(?:`{3,}(?=[^`\n]*(?:\n|$))|~~~)[^\n]*(?:\n|$)| {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)| {0,3}(?:<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?: +|\n|\/?>)|<(?:(?:script|pre|style|textarea)(?:[\s>]|$)|!--)|<\?|<![A-Za-z]|<!\[CDATA\[)|[ \t]+\n)[^\n]+)*))|[^\n]*)(?:\n|$))+/,
  list: /^( {0,3}(?:[*+-]|\d{1,9}[.)]))([ \t][^\n]*?)?(?:\n|$)/,
  html: new RegExp('^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:<\\/\\1>[^\\n]*\\n*|$)|' + comment.source + '[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|<\\/?(' + K + ')(?:[ \\t]+|\\n|\\/?>|$)[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?: +[a-zA-Z:_][\\w.:-]*(?: *= *"[^"\\n]*"| *= *\'[^\'\\n]*\'| *= *[^\\s"\'=<>`]+)?)*? *\\/?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|<\\/[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$))', 'i'),
  def: /^ {0,3}\[((?!\s*\])(?:\\[\s\S]|[^\[\]\\\n]|\n(?![ \t]*\n))+)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)((?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\\n]|\n(?!\n))*'|\((?:\\[\s\S]|[^()\\])*\))))? *(?:\n+|$)/,
  lheading: /^(?! {0,3}(?:[*+-]|\d{1,9}[.)]) |(?: {4}| {0,3}\t)| {0,3}(?:`{3,}|~{3,})| {0,3}>| {0,3}#{1,6}(?:\s|$)| {0,3}<[^>\n>]+>\n| {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n)((?:.|\n(?!\s*?\n| {0,3}(?:[*+-]|\d{1,9}[.)]) | {0,3}(?:`{3,}|~{3,})| {0,3}>| {0,3}#{1,6}(?:\s|$)| {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)| {0,3}<[^>\n>]+>\n| {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n))+?)\n {0,3}(=+|-+)[ \t]*(?:\n+|$)/,
  paragraph: /^([^\n]+(?:\n(?! {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)| {0,3}#{1,6}(?:\s|$)| {0,3}>| {0,3}(?:`{3,}(?=[^`\n]*(?:\n|$))|~~~)[^\n]*(?:\n|$)| {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]| {0,3}(?:<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?: +|\n|\/?>)|<(?:(?:script|pre|style|textarea)(?:[\s>]|$)|!--)|<\?|<![A-Za-z]|<!\[CDATA\[)| *([^\n ].*)\n {0,3}((?:\| *)?:?-+:? *(?:\| *:?-+:? *)*(?:\| *)?)(?:\n((?:(?! *\n| {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)| {0,3}#{1,6}(?:\s|$)| {0,3}>|(?: {4}| {0,3}\t)[^\n]| {0,3}(?:`{3,}(?=[^`\n]*(?:\n|$))|~~~)[^\n]*(?:\n|$)| {0,3}(?:[*+-]|1[.)])[ \t]| {0,3}(?:<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?: +|\n|\/?>)|<(?:(?:script|pre|style|textarea)(?:[\s>]|$)|!--)|<\?|<![A-Za-z]|<!\[CDATA\[)).*(?:\n|$))*)\n*|$)|[ \t]+\n)[^\n]+)*)/,
  table: /^ *([^\n ].*)\n {0,3}((?:\| *)?:?-+:? *(?:\| *:?-+:? *)*(?:\| *)?)(?:\n((?:(?! *\n| {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)| {0,3}#{1,6}(?:\s|$)| {0,3}>|(?: {4}| {0,3}\t)[^\n]| {0,3}(?:`{3,}(?=[^`\n]*(?:\n|$))|~~~)[^\n]*(?:\n|$)| {0,3}(?:[*+-]|1[.)])[ \t]| {0,3}(?:<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?: +|\n|\/?>)|<(?:(?:script|pre|style|textarea)(?:[\s>]|$)|!--)|<\?|<![A-Za-z]|<!\[CDATA\[)).*(?:\n|$))*)\n*|$)/,
  text: /^[^\n]+/
};

const tagInline = /^<!--(?:-?>|[\s\S]*?-->)|^<\/[a-zA-Z][a-zA-Z0-9-]*\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?)*?\s*\/?>|^<\?[\s\S]*?\?>|^<![a-zA-Z]+\s[\s\S]*?>|^<!\[CDATA\[[\s\S]*?\]\]>/;

const inlineRules = {
  escape: /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,
  code: /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,
  br: /^( {2,}|\\)\n(?!\s*$)[ \t]*/,
  tag: tagInline,
  autolink: /^<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s\x00-\x1f<>]*|[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_]))>/,
  link: /^!?\[((?:\[(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?)\]\([ \t\n]*(<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\)))(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\)))?[ \t\n]*\)/,
  reflink: /^!?\[((?:\[(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?)\]\[((?!\s*\])(?:\\[\s\S]|[^\[\]\\\n]|\n(?![ \t]*\n))+)\]/,
  nolink: /^!?\[((?!\s*\])(?:\\[\s\S]|[^\[\]\\\n]|\n(?![ \t]*\n))+)\](?:\[\])?/,
  emStrongLDelim: /^(?:\*+(?:((?!\*)(?!~)[\p{P}\p{S}])|([^\s*]))?)|^_+(?:((?!_)(?!~)[\p{P}\p{S}])|([^\s_]))?/u,
  emStrongRDelimAst: /^[^_*]*?__[^_*]*?\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\*)(?!~)[\p{P}\p{S}](\*+)(?=[\s]|$)|(?:[^\s\p{P}\p{S}]|~)(\*+)(?!\*)(?=(?!~)[\s\p{P}\p{S}]|$)|(?!\*)(?!~)[\s\p{P}\p{S}](\*+)(?=(?:[^\s\p{P}\p{S}]|~))|[\s](\*+)(?!\*)(?=(?!~)[\p{P}\p{S}])|(?!\*)(?!~)[\p{P}\p{S}](\*+)(?!\*)(?=(?!~)[\p{P}\p{S}])|(?:[^\s\p{P}\p{S}]|~)(\*+)(?=(?:[^\s\p{P}\p{S}]|~))/gu,
  emStrongRDelimUnd: /^[^_*]*?\*\*[^_*]*?_[^_*]*?(?=\*\*)|[^_]+(?=[^_])|(?!_)[\p{P}\p{S}](_+)(?=[\s]|$)|[^\s\p{P}\p{S}](_+)(?!_)(?=[\s\p{P}\p{S}]|$)|(?!_)[\s\p{P}\p{S}](_+)(?=[^\s\p{P}\p{S}])|[\s](_+)(?!_)(?=[\p{P}\p{S}])|(?!_)[\p{P}\p{S}](_+)(?!_)(?=[\p{P}\p{S}])/gu,
  delLDelim: /^~~?(?:((?!~)[\p{P}\p{S}])|[^\s~])/u,
  delRDelim: /^[^~]+(?=[^~])|(?!~)[\p{P}\p{S}](~~?)(?=[\s]|$)|[^\s\p{P}\p{S}](~~?)(?!~)(?=[\s\p{P}\p{S}]|$)|(?!~)[\s\p{P}\p{S}](~~?)(?=[^\s\p{P}\p{S}])|[\s](~~?)(?!~)(?=[\p{P}\p{S}])|(?!~)[\p{P}\p{S}](~~?)(?!~)(?=[\p{P}\p{S}])|[^\s\p{P}\p{S}](~~?)(?=[^\s\p{P}\p{S}])/gu,
  punctuation: /^((?![*_])[\s\p{P}\p{S}])/u,
  text: /^(?:[^a-zA-Z0-9](?=(?:mailto|xmpp):)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|[hH][tT][tT][pP][sS]?|[fF][tT][pP]:\/\/|(?<![^\s*_~(])www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=(?:mailto|xmpp):)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/,
  url: /^(?:mailto:[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])|xmpp:[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])(?:\/[A-Za-z0-9@.]+)?)|^((?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/
};

// Masks used by the emphasis pre-pass (global, non-sticky).
const blockSkip = /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\(\)])*\))*\)|(?<!`)()(?<b>`+)[^`]+\k<b>(?!`)|<(?! )[^<>]*?>/g;
const reflinkSearch = /!?\[((?:[^\[\]\\`]*(?:\[(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?)\]\[((?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999})\]|!?\[((?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999})\](?:\[\])?(?!\()/g;
const anyPunctOutsideCode = /(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\([\p{P}\p{S}])/gu;

// Delimiter-run candidates for * / _ / ~ (used as an early-out in em/del).
function maskInfo(src) {
  let lastAst = -1, lastUnd = -1, lastDel = -1;
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '*' || c === '_' || c === '~') {
      const prev = i === 0 ? '\n' : src[i - 1];
      if (prev !== ' ' && prev !== '\t' && prev !== '\n' && prev !== '\r' && prev !== '\f') {
        if (c === '~') lastDel = i;
        else if (c === '*') lastAst = i;
        else lastUnd = i;
      }
      let j = i + 1;
      while (j < n && src[j] === c) j++;
      i = j;
    } else i++;
  }
  return { ast: lastAst, und: lastUnd, del: lastDel };
}
// ---------------------------------------------------------------------------
// Small helpers (own implementations of the reference transformations).
// ---------------------------------------------------------------------------

function rtrim(src, ch, invert) {
  let n = src.length, s = 0;
  while (s < n) {
    const c = src.charAt(n - s - 1);
    if (c === ch && !invert) s++;
    else if (c !== ch && invert) s++;
    else break;
  }
  return src.slice(0, n - s);
}

// Strip trailing blank lines, but leave a single one alone (reference quirk).
function rstripBlock(src) {
  const lines = src.split('\n');
  let t = lines.length - 1;
  while (t >= 0 && /^[ \t]*$/.test(lines[t])) t--;
  return lines.length - t <= 2 ? src : lines.slice(0, t + 1).join('\n');
}

// Expand tabs, continuing the column count from column `start`.
function expandTabs(src, start) {
  let col = start, out = '';
  for (const ch of src) {
    if (ch === '\t') {
      const add = 4 - (col % 4);
      out += ' '.repeat(add);
      col += add;
    } else {
      out += ch;
      col++;
    }
  }
  return out;
}

// Normalize a link label for lookup.
function normalizeLabel(s) {
  return s.trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase().toLowerCase();
}

// Count unbalanced openers of a bracket pair; -2 means unbalanced closer.
function balanced(src, pair) {
  if (src.indexOf(pair[0]) === -1 && src.indexOf(pair[1]) === -1) return -1;
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === pair[0]) depth++;
    else if (src[i] === pair[1] && (depth--, depth < 0)) return i;
  }
  return depth > 0 ? -2 : -1;
}

function escapeHtml(s, encode) {
  if (encode) {
    if (/[&<>"']/.test(s)) return s.replace(/[&<>"']/g, c => (
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
    return s;
  }
  if (/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/.test(s)) {
    return s.replace(/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, c => (
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
  }
  return s;
}

const numRef = /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/;
const numRefOrAmp = /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;

function decodeEntities(s) {
  if (!numRef.test(s)) return s;
  return s.replace(numRefOrAmp, (m, dec, hex) => {
    if (dec === undefined && hex === undefined) return '&amp;';
    const code = dec === undefined ? parseInt(hex, 16) : parseInt(dec, 10);
    if (code === 0 || code > 1114111 || (code >= 55296 && code <= 57343)) return '\uFFFD';
    if (code === 38) return '&amp;';
    return String.fromCodePoint(code);
  });
}

// encodeURI leaves every char in this class alone except '%' (-> '%25'), and the
// next step turns '%25' back into '%': for these strings the round trip is the
// identity, so skip it. Anything else still goes through encodeURI.
const HREF_SAFE = /^[A-Za-z0-9;,/?:@&=+$_.!~*'()#%-]*$/;

function cleanUrl(href) {
  if (HREF_SAFE.test(href)) return href;
  try {
    return encodeURI(href).replace(/%25/g, '%');
  } catch {
    return null;
  }
}

// Split a table row on pipes, honoring escaped pipes and leading/trailing pipes.
function splitCells(row, count) {
  let masked = row.replace(/\|/g, (m, off, whole) => {
    let esc = false, p = off;
    while (--p >= 0 && whole[p] === '\\') esc = !esc;
    return esc ? '|' : ' |';
  });
  let cells = masked.split(/ \|/);
  if (cells[0].trim() || cells.shift(), cells.length > 0 && !cells[cells.length - 1]?.trim()) cells.pop();
  if (count) {
    if (cells.length > count) cells.splice(count);
    else for (; cells.length < count;) cells.push('');
  }
  for (let i = 0; i < cells.length; i++) cells[i] = cells[i].trim().replace(/\\\|/g, '|');
  return cells;
}

function firstCodePointLen(s) {
  const cp = s.codePointAt(0);
  return cp > 0xffff ? 2 : 1;
}

// Sticky ("y") clones of the anchored rules.
function sticky(re) {
  return new RegExp(re.source, re.flags + 'y');
}

const B = {};
for (const k in blockRules) B[k] = sticky(blockRules[k]);
// Sticky clones of inline rules must not keep "^" anchors: sticky already pins
// the match to lastIndex, and these rules are exec'd mid-string.
function stickyInline(re) {
  return new RegExp(re.source.replace(/(^|\|)\^/g, '$1'), re.flags + 'y');
}
const I = {};
for (const k in inlineRules) I[k] = stickyInline(inlineRules[k]);
// Delimiter-run scanners must scan forward (reference uses "gu" exec loops),
// so keep non-sticky global clones for them.
I.scan = {};
for (const k of ['emStrongRDelimAst', 'emStrongRDelimUnd', 'delRDelim']) {
  I.scan[k] = new RegExp(inlineRules[k].source, 'gu');
}

// Indent-dependent regexes, memoized like the reference: the argument is
// clamped to max(0, min(3, R-1)) before building / caching.
const nextBulletCache = [], hrCache = [], fencesBeginCache = [], headingBeginCache = [], htmlBeginCache = [], blockquoteBeginCache = [];
function cachedRe(cache, n, make) {
  let re = cache[n];
  if (!re) re = cache[n] = make(n);
  return re;
}
const clamped = R => Math.max(0, Math.min(3, R - 1));
const mkCached = (cache, make) => R => cachedRe(cache, clamped(R), n => make(n));
const nextBulletRegex = mkCached(nextBulletCache, n =>
  new RegExp('^ {0,' + n + '}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))'));
const hrRegex = mkCached(hrCache, n =>
  new RegExp('^ {0,' + n + '}((?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\\*[ \t]*){3,})(?:\\n+|$)'));
const fencesBeginRegex = mkCached(fencesBeginCache, n =>
  new RegExp('^ {0,' + n + '}(?:```|~~~)'));
const headingBeginRegex = mkCached(headingBeginCache, n =>
  new RegExp('^ {0,' + n + '}#{1,6}(?:\\s|$)'));
const htmlBeginRegex = mkCached(htmlBeginCache, n =>
  new RegExp('^ {0,' + n + '}(?:</?(?:' + K + ')(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)', 'i'));
const blockquoteBeginRegex = mkCached(blockquoteBeginCache, n =>
  new RegExp('^ {0,' + n + '}>'));
const listItemRegex = a => new RegExp('^( {0,3}' + a + ')((?:[\t ][^\\n]*)?(?:\\n|$))');
// ---------------------------------------------------------------------------
// Inline rendering: a segment of markdown text -> HTML string.
// Mirrors the reference emphasis/strikethrough delimiter-run algorithm,
// including its masking pre-pass and its quirks.
// ---------------------------------------------------------------------------

const PUNCT_CACHE = I.punctuation;

function punct1(s) {
  if (!s) return false;
  PUNCT_CACHE.lastIndex = 0;
  return PUNCT_CACHE.exec(s) !== null;
}

function lastCodePoint(s) {
  if (!s) return '';
  let i = s.length - 1;
  const c = s.charCodeAt(i);
  if (c >= 0xdc00 && c <= 0xdfff && i > 0) {
    const d = s.charCodeAt(i - 1);
    if (d >= 0xd800 && d <= 0xdbff) return s.slice(i - 1, i + 1);
  }
  return s[i];
}

// Build the masked copy of a segment used by the emphasis algorithm.
function buildMasked(lexer, src) {
  let masked = src;
  if (masked.includes('[')) {
    const links = lexer.links;
    const cb = (m) => {
      const o = m.lastIndexOf('[');
      if (!Object.prototype.hasOwnProperty.call(links, normalizeLabel(m.slice(o + 1, -1)))) return m;
      if (o > 1 && m.charAt(0) !== '!') {
        const inner = m.slice(1, o - 1);
        if (linkInText(lexer, inner)) {
          return '[' + inner.replace(reflinkSearch, cb) + '][' + 'a'.repeat(m.length - o - 2) + ']';
        }
      }
      return '[' + 'a'.repeat(m.length - 2) + ']';
    };
    masked = masked.replace(reflinkSearch, cb);
  }
  masked = masked.replace(anyPunctOutsideCode, (m, ticks, esc) => {
    if (esc) return '+'.repeat(m.length);
    if (ticks) return ticks + m.slice(ticks.length, m.length - ticks.length).replace(/`/g, '+') + ticks;
    return m;
  });
  masked = masked.replace(blockSkip, (m) => '[' + 'a'.repeat(m.length - 2) + ']');
  return masked;
}

function linkInText(lexer, e) {
  if (!e.includes('[')) return false;
  const linkRe = inlineRules.link;
  for (const m of e.matchAll(blockSkip)) {
    if (linkRe.test(m[0]) && e.charAt(m.index - 1) !== '!') return true;
  }
  for (const m of e.matchAll(reflinkSearch)) {
    const s = m[0], r = s.lastIndexOf('[');
    if (!(s.charAt(0) === '!' || !Object.prototype.hasOwnProperty.call(lexer.links, normalizeLabel(s.slice(r + 1, -1)))) &&
        !(r > 1 && linkInText(lexer, s.slice(1, r - 1)))) return true;
  }
  return false;
}

// Does a tag/autolink inside `label` extend beyond the label's end?
function tagExtendsBeyond(lexer, src, label, offset) {
  if (!label.includes('<')) return false;
  for (let s = 0; s < label.length; s++) {
    if (label[s] === '\\') { s++; continue; }
    if (label[s] === '`') {
      I.code.lastIndex = 0;
      const cm = I.code.exec(label.slice(s));
      if (cm) { s += cm[0].length - 1; continue; }
    }
    if (label[s] !== '<') continue;
    const rest = src.slice(offset + s);
    I.tag.lastIndex = 0;
    let m = I.tag.exec(rest);
    if (!m) { I.autolink.lastIndex = 0; m = I.autolink.exec(rest); }
    if (m) {
      if (m[0].length > label.length - s) return true;
      s += m[0].length - 1;
    }
  }
  return false;
}

// Shared "outputLink" behavior for inline links, images and reference links.
function makeLinkToken(lexer, m, href, title, raw, isImage, textMode) {
  const savedInLink = lexer.state.inLink;
  const savedEmitted = lexer.state.linkEmitted;
  const savedRaw = lexer.state.inRawBlock;
  lexer.state.inLink = true;
  lexer.state.linkEmitted = false;
  const label = m[1].replace(/\\([\[\]])/g, '$1');
  const inner = inlineParse(lexer, label, textMode);
  const emitted = lexer.state.linkEmitted;
  const afterInLink = lexer.state.inLink;
  const afterRaw = lexer.state.inRawBlock;
  let alt = '';
  if (isImage) {
    // Replay the label with plain-text rendering (reference textRenderer).
    lexer.state.inLink = true;
    lexer.state.inRawBlock = savedRaw;
    lexer.state.linkEmitted = false;
    alt = inlineParse(lexer, label, true);
    lexer.state.inLink = afterInLink;
    lexer.state.inRawBlock = afterRaw;
  }
  lexer.state.linkEmitted = savedEmitted;
  lexer.state.inLink = savedInLink;
  if (!isImage) {
    if (emitted) {
      lexer.state.inRawBlock = savedRaw;
      return null;
    }
    lexer.state.linkEmitted = true;
  }
  return { raw, href, title, inner, alt, isImage };
}

function renderLink(innerHtml, href, title, isImage, autolink, altHtml) {
  const cleaned = cleanUrl(href);
  if (cleaned === null) {
    if (isImage) return escapeHtml(altHtml);
    return innerHtml;
  }
  const h = escapeHtml(cleaned, autolink);
  if (isImage) {
    let out = '<img src="' + h + '" alt="' + escapeHtml(altHtml) + '"';
    if (title) out += ' title="' + escapeHtml(title) + '"';
    return out + '>';
  }
  let out = '<a href="' + h + '"';
  if (title) out += ' title="' + escapeHtml(title) + '"';
  return out + '>' + innerHtml + '</a>';
}

// The full inline tokenizer for one segment.
export function inlineParse(lexer, src, textMode) {
  const savedParen = lexer.state.linkParenPossible;
  lexer.state.linkParenPossible = savedParen && src.includes(')');
  const out = [];
  try {
    inlineLoop(lexer, src, out, textMode);
  } finally {
    lexer.state.linkParenPossible = savedParen;
  }
  return out.join('');
}

function inlineLoop(lexer, src, out, textMode) {
  const needMask = src.includes('*') || src.includes('_') || src.includes('~');
  const masked = needMask ? buildMasked(lexer, src) : src;
  const info = needMask ? maskInfo(masked) : { ast: -1, und: -1, del: -1 };
  const lenDiff = masked.length - src.length;

  let pos = 0;
  let min = Infinity;
  let r = '';
  let lastWasText = false;

  for (;;) {
    if (pos >= src.length) break;
    if (src.length - pos < min) min = src.length - pos;
    else break;
    if (!lastWasText) r = '';
    lastWasText = false;

    // escape
    if (src[pos] === '\\') {
      I.escape.lastIndex = pos;
      const m = I.escape.exec(src);
      if (m) {
        out.push(textMode ? m[1] : escapeHtml(m[1]));
        pos += m[0].length;
        continue;
      }
    }

    // tag
    if (src[pos] === '<') {
      I.tag.lastIndex = pos;
      const m = I.tag.exec(src);
      if (m) {
        const raw = m[0];
        if (!lexer.state.inLink && /^<a /i.test(raw)) lexer.state.inLink = true;
        else if (lexer.state.inLink && /^<\/a>/i.test(raw)) lexer.state.inLink = false;
        if (!lexer.state.inRawBlock && /^<(pre|code|kbd|script)(\s|>)/i.test(raw)) lexer.state.inRawBlock = true;
        else if (lexer.state.inRawBlock && /^<\/(pre|code|kbd|script)(\s|>)/i.test(raw)) lexer.state.inRawBlock = false;
        out.push(raw);
        pos += raw.length;
        continue;
      }
    }

    // inline link/image
    if (src[pos] === '!' ? src[pos + 1] === '[' : src[pos] === '[') {
      if (lexer.state.linkParenPossible !== false) {
        const res = tryLink(lexer, src, pos, textMode);
        if (res) {
          if (res.aborted) { /* fall through to later tokenizers */ }
          else {
            if (res.autolink) {
              out.push(renderLink(escapeHtml(res.inner, true), res.href, res.title, res.isImage, true, res.inner));
            } else if (res.isImage) {
              out.push(textMode ? res.inner : renderLink(res.inner, res.href, res.title, true, false, res.alt));
            } else {
              out.push(textMode ? res.inner : renderLink(res.inner, res.href, res.title, false, false));
            }
            pos += res.len;
            continue;
          }
        }
      }
    }

    // reflink / nolink
    if (src[pos] === '!' ? src[pos + 1] === '[' : src[pos] === '[') {
      const res = tryReflink(lexer, src, pos, textMode);
      if (res) {
        if (res.isText) {
          out.push(escapeHtml(decodeEntities(res.text)));
        } else if (res.isImage) {
          out.push(textMode ? res.inner : renderLink(res.inner, res.href, res.title, true, false, res.alt));
        } else {
          out.push(textMode ? res.inner : renderLink(res.inner, res.href, res.title, false, false));
        }
        pos += res.len;
        continue;
      }
    }

    // emphasis / strong
    if (needMask && (src[pos] === '*' || src[pos] === '_')) {
      const res = tryEmStrong(lexer, src, pos, masked, info, r, textMode);
      if (res) {
        out.push(res.html);
        pos += res.raw.length;
        continue;
      }
    }

    // codespan
    if (src[pos] === '`') {
      I.code.lastIndex = pos;
      const m = I.code.exec(src);
      if (m) {
        let text = m[2].replace(/\n/g, ' ');
        const hasNonSpace = /[^ ]/.test(text);
        if (hasNonSpace && /^ /.test(text) && / $/.test(text)) text = text.substring(1, text.length - 1);
        if (textMode) out.push(text);
        else out.push('<code>' + escapeHtml(text, true) + '</code>');
        pos += m[0].length;
        continue;
      }
    }

    // hard break
    I.br.lastIndex = pos;
    {
      const m = I.br.exec(src);
      if (m) {
        out.push(textMode ? '' : '<br>');
        pos += m[0].length;
        continue;
      }
    }

    // strikethrough
    if (needMask && src[pos] === '~') {
      const res = tryDel(lexer, src, pos, masked, info, r, textMode);
      if (res) {
        out.push(res.html);
        pos += res.len;
        continue;
      }
    }

    // autolink <scheme:...> / <mail@host>
    if (src[pos] === '<') {
      I.autolink.lastIndex = pos;
      const m = I.autolink.exec(src);
      if (m) {
        const text = m[1];
        const href = m[2] === '@' ? 'mailto:' + text : text;
        if (textMode) out.push(text);
        else out.push(renderLink(escapeHtml(text, true), href, null, false, true));
        pos += m[0].length;
        continue;
      }
    }

    // gfm extended autolink
    if (!lexer.state.inLink && urlStartChar(src.charCodeAt(pos))) {
      const res = tryUrl(src, pos);
      if (res) {
        if (textMode) out.push(res.text);
        else out.push(renderLink(escapeHtml(res.text, true), res.href, null, false, true));
        pos += res.len;
        continue;
      }
    }

    // plain text
    I.text.lastIndex = pos;
    {
      const m = I.text.exec(src);
      if (m) {
        const raw = m[0];
        const inRaw = lexer.state.inRawBlock;
        const text = inRaw ? raw : decodeEntities(raw);
        out.push(textMode ? text : escapeHtml(text));
        pos += raw.length;
        if (raw.slice(-1) !== '_') r = raw.slice(-1);
        lastWasText = true;
        continue;
      }
    }
    break;
  }
  return out.join('');
}

function urlStartChar(code) {
  // h H f F w W m M x X or any char that can start the url regex alternatives
  return code === 104 || code === 72 || code === 102 || code === 70 || code === 119 || code === 87 ||
         code === 109 || code === 77 || code === 120 || code === 88 ||
         (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) ||
         code === 46 || code === 95 || code === 43 || code === 45;
}

// --- inline link [label](href "title") -------------------------------------
function tryLink(lexer, src, pos, textMode) {
  I.link.lastIndex = pos;
  const m = I.link.exec(src);
  if (!m) return null;
  const raw = m[0];
  const isImage = raw.charAt(0) === '!';
  const labelOffset = pos + (isImage ? 2 : 1);
  if (tagExtendsBeyond(lexer, src, m[1], labelOffset)) return null;
  let href = m[2].trim();
  let newRaw = raw;
  let title = m[3] ? m[3].slice(1, -1) : '';
  if (/^</.test(href)) {
    if (!/>$/.test(href)) return null;
    const stripped = rtrim(href.slice(0, -1), '\\');
    if ((href.length - stripped.length) % 2 === 0) return null;
  } else {
    const bal = balanced(m[2], '()');
    if (bal === -2) return null;
    if (bal > -1) {
      const cut = (isImage ? 5 : 4) + m[1].length + bal;
      href = m[2].substring(0, bal);
      newRaw = raw.substring(0, cut).trim();
      title = '';
    }
  }
  const stripped2 = rtrim(newRaw.slice(0, -1), '\\');
  if ((newRaw.length - stripped2.length) % 2 === 0) return null;
  href = href.trim();
  if (/^</.test(href)) href = href.slice(1, -1);
  href = href && href.replace(/\\([\p{P}\p{S}])/gu, '$1');
  title = title && title.replace(/\\([\p{P}\p{S}])/gu, '$1');
  const res2 = makeLinkToken(lexer, { 1: m[1] }, href, title, newRaw, isImage, textMode);
  if (!res2) return { aborted: true, len: 0 };
  res2.len = newRaw.length;
  res2.autolink = false;
  return res2;
}

// --- reference link [label][ref] / [label][] / [label] ----------------------
function tryReflink(lexer, src, pos, textMode) {
  I.reflink.lastIndex = pos;
  let m = I.reflink.exec(src);
  if (!m) {
    I.nolink.lastIndex = pos;
    m = I.nolink.exec(src);
    if (!m) return null;
  }
  const raw = m[0];
  const isImage = raw.charAt(0) === '!';
  const labelOffset = pos + (isImage ? 2 : 1);
  if (tagExtendsBeyond(lexer, src, m[1], labelOffset)) return null;
  const def = lexer.links[normalizeLabel(m[2] || m[1])];
  if (!def) {
    return { isText: true, text: raw.charAt(0), len: 1 };
  }
  const res = makeLinkToken(lexer, { 1: m[1] }, def.href, def.title, raw, isImage, textMode);
  if (!res) return { isText: true, text: raw.charAt(0), len: 1 };
  res.len = raw.length;
  return res;
}
// Emphasis / strong, strikethrough and extended-autolink tokenizers.

function cpCount(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++, n++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i++;
    }
  }
  return n;
}

function tryEmStrong(lexer, src, pos, masked, info, r, textMode) {
  I.emStrongLDelim.lastIndex = pos;
  let s = I.emStrongLDelim.exec(src);
  if (!s || (!s[1] && !s[2] && !s[3] && !s[4])) return null;
  const delim = s[0][0];
  const o = r === delim;
  const i = masked.length - (src.length - pos);
  let l = i;
  while (l > 0 && masked[l - 1] === delim) l--;
  const seg = masked.slice(Math.max(0, l - 2), l);
  const p = lastCodePoint(seg);
  const h = p === '*' || p === '_' || punct1(p);
  let n = r;
  if (l < i) n = p;
  const u = l < i ? h : punct1(n);
  if (s[4] && /[\p{L}\p{N}]/u.test(n)) return null;
  const d = s[1] || s[3] || '';
  if (!d || !n || u) {
    const k = cpCount(s[0]) - 1;
    let m, b;
    let acc = k, f = 0;
    const y = i - l + k;
    const R = !!p.trim() && (!!d || (delim === '*' && !h));
    if (delim !== '*' && delim !== '_') return null;
    const A = delim === '*' ? I.scan.emStrongRDelimAst : I.scan.emStrongRDelimUnd;
    const v = delim === '*' ? info.ast : info.und;
    const Q = i + k;
    if (v < Q) return null;
    const t2 = masked.slice(i + k);
    const ee = v - Q;
    A.lastIndex = 0;
    while ((s = A.exec(t2)) !== null && !(s.index > ee)) {
      m = s[1] || s[2] || s[3] || s[4] || s[5] || s[6];
      if (!m) continue;
      b = m.length;
      if (s[3] || s[4]) { acc += b; continue; }
      else if (s[5] || s[6] || R) {
        if (o && (s[5] || s[6])) break;
        if (y % 3 && !((y + b) % 3)) { f += b; continue; }
      }
      acc -= b;
      if (acc > 0) continue;
      b = Math.min(b, b + acc + f);
      const te = firstCodePointLen(s[0]);
      const M = src.slice(pos, pos + k + s.index + te + b);
      if (Math.min(k, b) % 2) {
        const U = M.slice(1, -1);
        const h = inlineParse(lexer, U, textMode);
        return { html: textMode ? h : '<em>' + h + '</em>', raw: M };
      }
      const ne = M.slice(2, -2);
      const h2 = inlineParse(lexer, ne, textMode);
      return { html: textMode ? h2 : '<strong>' + h2 + '</strong>', raw: M };
    }
  }
  return null;
}

function tryDel(lexer, src, pos, masked, info, r, textMode) {
  I.delLDelim.lastIndex = pos;
  let s = I.delLDelim.exec(src);
  if (!s) return null;
  if (!(s[1] || '') || !r || punct1(r)) {
    const o = cpCount(s[0]) - 1;
    let p = o;
    const u = info.del;
    const dOff = masked.length - (src.length - pos) + o;
    if (u < dOff) return null;
    const t2 = masked.slice(dOff);
    const k = u - dOff;
    I.scan.delRDelim.lastIndex = 0;
    while ((s = I.scan.delRDelim.exec(t2)) !== null && !(s.index > k)) {
      const run = s[1] || s[2] || s[3] || s[4] || s[5] || s[6];
      if (!run) continue;
      const l = run.length;
      if (l !== o) continue;
      if (s[3] || s[4]) { p += l; continue; }
      p -= l;
      if (p > 0) continue;
      const ll = Math.min(l, l + p);
      const g = firstCodePointLen(s[0]);
      const M = src.slice(pos, pos + o + s.index + g + ll);
      const inner = M.slice(o, M.length - o);
      const h = inlineParse(lexer, inner, textMode);
      return { html: textMode ? h : '<del>' + h + '</del>', len: M.length };
    }
  }
  return null;
}

const backpedal = /(?:[^?!.,:;*_'\"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'\"~)]+(?!$))+/;

function tryUrl(src, pos) {
  I.url.lastIndex = pos;
  const m = I.url.exec(src);
  if (!m) return null;
  let text, href;
  if (m[2] === '@') {
    text = m[0];
    href = 'mailto:' + text;
  } else {
    let cur = m[0], prev;
    do {
      prev = cur;
      const bp = backpedal.exec(prev);
      cur = bp ? bp[0] : '';
    } while (prev !== cur);
    text = cur;
    href = m[1] === 'www.' ? 'http://' + cur : cur;
  }
  if (!text) return null;
  return { text, href, len: text.length };
}
// Block tokenizers. Each returns a token object or null; anchored rules are
// run with sticky clones at index 0 of the remaining source.

const anyPunct = /\\([\p{P}\p{S}])/gu;

function tokSpace(src) {
  B.newline.lastIndex = 0;
  const m = B.newline.exec(src);
  if (m && m[0].length > 0) return { type: 'space', raw: m[0] };
  return null;
}

function tokCode(src) {
  B.code.lastIndex = 0;
  const m = B.code.exec(src);
  if (!m) return null;
  const stripped = rstripBlock(m[0]);
  return { type: 'code', raw: stripped, text: stripped.replace(/^(?: {0,3}\t| {1,4})/gm, '') };
}

function tokFences(src) {
  B.fences.lastIndex = 0;
  const m = B.fences.exec(src);
  if (!m) return null;
  let text = m[3] || '';
  const cm = m[0].match(/^(\s+)(?:```)/);
  if (cm !== null) {
    const indent = cm[1];
    text = text.split('\n').map(line => {
      const ws = line.match(/^\s+/);
      if (ws === null) return line;
      return line.slice(Math.min(ws[0].length, indent.length));
    }).join('\n');
  }
  return { type: 'code', raw: m[0], lang: m[2] ? m[2].trim().replace(anyPunct, '$1') : m[2], text };
}

function tokHeading(lexer, src) {
  B.heading.lastIndex = 0;
  const m = B.heading.exec(src);
  if (!m) return null;
  let text = m[2].trim();
  if (/#$/.test(text)) {
    const s = rtrim(text, '#');
    if (!s || /[ \t]$/.test(s)) text = s.trim();
  }
  const tok = { type: 'heading', raw: rtrim(m[0], '\n'), depth: m[1].length, text };
  lexer.queue.push({ src: text, tok });
  return tok;
}

function tokHr(src) {
  B.hr.lastIndex = 0;
  const m = B.hr.exec(src);
  if (!m) return null;
  return { type: 'hr', raw: rtrim(m[0], '\n') };
}

function tokBlockquote(lexer, src) {
  B.blockquote.lastIndex = 0;
  const m = B.blockquote.exec(src);
  if (!m) return null;
  let chunks = rtrim(m[0], '\n').split('\n');
  let raw = '', text = '';
  const tokens = [];
  for (;;) {
    let found = false;
    const group = [];
    let p;
    for (p = 0; p < chunks.length; p++) {
      if (/^ {0,3}>/.test(chunks[p])) { group.push(chunks[p]); found = true; }
      else if (!found) group.push(chunks[p]);
      else break;
    }
    chunks = chunks.slice(p);
    const h = group.join('\n');
    const u = h.replace(/^( {0,3}>)([ \t]+)/gm, (mm, pre, ws) => pre + expandTabs(ws, pre.length))
      .replace(/\n {0,3}((?:=+|-+)[ \t]*)(?=\n|$)/g, '\n    $1')
      .replace(/^ {0,3}>[ \t]?/gm, '');
    raw = raw ? raw + '\n\n' + h : h;
    text = text ? text + '\n\n' + u : u;
    const savedTop = lexer.state.top;
    lexer.state.top = true;
    blockTokens(lexer, u, tokens, true);
    lexer.state.top = savedTop;
    if (chunks.length === 0) break;
    const last = tokens[tokens.length - 1];
    if (last && (last.type === 'code' || last.type === 'heading' || last.type === 'hr' || last.type === 'html' || last.type === 'table')) break;
    if (last && last.type === 'blockquote') {
      const g = last;
      const merged = g.raw + '\n' + chunks.join('\n').replace(/^ {0,3}>[ \t]?/gm, '');
      const re = tokBlockquote(lexer, merged);
      tokens[tokens.length - 1] = re;
      const rest = merged.substring(re.raw.length).replace(/^\n/, '');
      const nRest = rest ? rest.split('\n').length : 0;
      const keep = nRest ? chunks.slice(0, -nRest) : chunks;
      if (keep.length > 0) raw = raw + '\n\n' + keep.join('\n');
      text = text.substring(0, text.length - g.text.length) + re.text;
      chunks = chunks.slice(keep.length);
      if (chunks.length > 0 && /^ {0,3}>/.test(chunks[0])) continue;
      break;
    } else if (last && last.type === 'list') {
      const g = last;
      const merged = g.raw + '\n' + chunks.join('\n');
      const re = tokList(lexer, merged);
      tokens[tokens.length - 1] = re;
      const extra = re.raw.length > g.raw.length ? merged.slice(g.raw.length + 1, re.raw.length).split('\n').length : 0;
      if (extra > 0) {
        const y = chunks.slice(0, extra).join('\n');
        raw = raw + '\n\n' + y;
        text = text + '\n\n' + y;
      }
      chunks = chunks.slice(extra);
      continue;
    }
  }
  return { type: 'blockquote', raw, tokens, text };
}
// List tokenizer (loose/tight handling, task items, indentation).

function tokList(lexer, src) {
  B.list.lastIndex = 0;
  let m = B.list.exec(src);
  if (!m) return null;
  const orig = src;
  const consumed = () => orig.length - src.length;
  const bullet = m[1].trim();
  const ordered = bullet.length > 1;
  const list = { type: 'list', raw: '', ordered, start: ordered ? +bullet.slice(0, -1) : '', loose: false, items: [] };
  const bulletPat = ordered ? '\\d{1,9}\\' + bullet.slice(-1) : '\\' + bullet;
  const liRe = listItemRegex(bulletPat);
  liRe.lastIndex = 0;
  let loosePending = false;
  for (; src;) {
    let blank = false, d = '';
    if (!(m = liRe.exec(src)) || blockRules.hr.test(src)) break;
    const k = consumed();
    src = src.substring(m[0].length);
    const firstLine = m[2].split('\n', 1)[0];
    const indent = m[1].length;
    let cur = firstLine.replace(/^[ \t]+/, v => expandTabs(v, indent));
    let nextLine = src.split('\n', 1)[0];
    let y = !cur.trim();
    let R = 0;
    if (y) R = indent + 1;
    else {
      R = cur.search(/[^ ]/);
      R = R > 4 ? 1 : R;
      d = cur.slice(R);
      R += indent;
    }
    if (y && /^[ \t]*$/.test(nextLine)) {
      src = src.substring(nextLine.length + 1);
      blank = true;
    }
    if (!blank) {
      const nbRe = nextBulletRegex(R), hrRe = hrRegex(R), fbRe = fencesBeginRegex(R),
        hbRe = headingBeginRegex(R), htmRe = htmlBeginRegex(R), bqRe = blockquoteBeginRegex(R);
      for (;;) {
        if (!src) break;
        const line = src.split('\n', 1)[0];
        const Z = line.replace(/^[ \t]+/, v => expandTabs(v, 0));
        if (fbRe.test(line) || hbRe.test(line) || htmRe.test(line) || bqRe.test(line) || nbRe.test(line) || hrRe.test(line)) break;
        if (Z.search(/[^ ]/) >= R || !line.trim()) d += '\n' + Z.slice(R);
        else {
          if (y || cur.replace(/\t/g, '    ').search(/[^ ]/) >= 4 || fbRe.test(cur) || hbRe.test(cur) || htmRe.test(cur) || hrRe.test(cur)) break;
          const qe = /^ {0,3}(?:=+|-+) *$/.test(line) && blockRules.lheading.test(cur + '\n' + line + '\n')
            ? '    ' + line.replace(/^ {0,3}/, '') : line;
          d += '\n' + qe;
        }
        y = !line.trim();
        src = src.substring(line.length + 1);
        cur = Z.slice(R);
      }
    }
    const rawSlice = orig.slice(k, consumed());
    if (!list.loose) {
      if (loosePending) list.loose = true;
      else if (/\n[ \t]*\n[ \t]*$/.test(rawSlice)) loosePending = true;
    }
    list.items.push({
      type: 'list_item', raw: rawSlice,
      task: /^\[[ xX]\][ \t]+\S/.test(d),
      loose: false, text: d, tokens: []
    });
  }
  const lastItem = list.items[list.items.length - 1];
  if (lastItem) {
    lastItem.raw = lastItem.raw.trimEnd();
    lastItem.text = lastItem.text.trimEnd();
  } else return null;
  list.raw = orig.slice(0, consumed()).trimEnd();
  for (const item of list.items) {
    lexer.state.top = false;
    item.tokens = blockTokens(lexer, item.text, [], false);
    if (!list.loose) {
      const spaces = item.tokens.filter(t => t.type === 'space');
      list.loose = spaces.length > 0 && spaces.some(t => /\n.*\n/.test(t.raw));
    }
  }
  for (const item of list.items) {
    const first = item.tokens[0];
    if (item.task && first && (first.type === 'text' || first.type === 'paragraph')) {
      item.text = item.text.replace(/^\[[ xX]\][ \t]+/, '');
      first.raw = first.raw.replace(/^\[[ xX]\][ \t]+/, '');
      first.text = first.text.replace(/^\[[ xX]\][ \t]+/, '');
      for (let qi = lexer.queue.length - 1; qi >= 0; qi--) {
        if (/^\[[ xX]\][ \t]+\S/.test(lexer.queue[qi].src)) {
          lexer.queue[qi].src = lexer.queue[qi].src.replace(/^\[[ xX]\][ \t]+/, '');
          break;
        }
      }
      const cm = /\[[ xX]\]/.exec(item.raw);
      if (cm) {
        const cb = { type: 'checkbox', raw: cm[0] + ' ', checked: cm[0] !== '[ ]' };
        item.checked = cb.checked;
        if (list.loose) {
          if (first && (first.type === 'paragraph' || first.type === 'text')) {
            first.cbPrefix = cb;
          } else {
            item.tokens.unshift({ type: 'paragraph', raw: cb.raw, text: cb.raw, tokens: [cb], cbPrefix: cb, html: '' });
          }
        } else {
          item.tokens.unshift(cb);
        }
      }
    } else if (item.task) item.task = false;
  }
  if (list.loose) {
    for (const item of list.items) {
      item.loose = true;
      for (const t of item.tokens) if (t.type === 'text') t.type = 'paragraph';
    }
  }
  return list;
}
// Remaining block tokenizers + the block loop + rendering + public parse().

function tokHtml(src) {
  B.html.lastIndex = 0;
  const m = B.html.exec(src);
  if (!m) return null;
  const text = rstripBlock(m[0]);
  return { type: 'html', block: true, raw: text, pre: m[1] === 'pre' || m[1] === 'script' || m[1] === 'style', text };
}

function tokDef(src) {
  B.def.lastIndex = 0;
  const m = B.def.exec(src);
  if (!m) return null;
  if (!/^</.test(m[2]) && balanced(m[2], '()') !== -1) return null;
  return {
    type: 'def',
    tag: normalizeLabel(m[1]),
    raw: rtrim(m[0], '\n'),
    href: m[2] ? m[2].replace(/^<(.*)>$/, '$1').replace(anyPunct, '$1') : '',
    title: m[3] ? m[3].substring(1, m[3].length - 1).replace(anyPunct, '$1') : m[3]
  };
}

function tokTable(lexer, src) {
  B.table.lastIndex = 0;
  const m = B.table.exec(src);
  if (!m || !/[:|]/.test(m[2])) return null;
  const header = splitCells(m[1]);
  const alignSrc = m[2].replace(/^\||\| *$/g, '').split('|');
  const rowSrcs = m[3] && m[3].trim() ? m[3].replace(/\n[ \t]*$/, '').split('\n') : [];
  if (header.length !== alignSrc.length) return null;
  const align = alignSrc.map(a => /^ *-+: *$/.test(a) ? 'right' : /^ *:-+: *$/.test(a) ? 'center' : /^ *:-+ *$/.test(a) ? 'left' : null);
  const tok = { type: 'table', raw: rtrim(m[0], '\n'), header: [], align, rows: [] };
  for (let i = 0; i < header.length; i++) {
    const cell = { text: header[i], header: true, align: align[i] };
    lexer.queue.push({ src: header[i], tok: cell });
    tok.header.push(cell);
  }
  for (const row of rowSrcs) {
    const cells = splitCells(row, tok.header.length).map((c, i) => {
      const cell = { text: c, header: false, align: align[i] };
      lexer.queue.push({ src: c, tok: cell });
      return cell;
    });
    tok.rows.push(cells);
  }
  return tok;
}

function tokLheading(lexer, src) {
  B.lheading.lastIndex = 0;
  const m = B.lheading.exec(src);
  if (!m) return null;
  const text = m[1].trim();
  const tok = { type: 'heading', raw: rtrim(m[0], '\n'), depth: m[2].charAt(0) === '=' ? 1 : 2, text };
  lexer.queue.push({ src: text, tok });
  return tok;
}

function tokParagraph(lexer, src) {
  B.paragraph.lastIndex = 0;
  const m = B.paragraph.exec(src);
  if (!m) return null;
  const text = m[1].charAt(m[1].length - 1) === '\n' ? m[1].slice(0, -1) : m[1];
  const tok = { type: 'paragraph', raw: m[0], text };
  lexer.queue.push({ src: text, tok });
  return tok;
}

function tokText(lexer, src) {
  B.text.lastIndex = 0;
  const m = B.text.exec(src);
  if (!m) return null;
  const tok = { type: 'text', raw: m[0], text: m[0] };
  lexer.queue.push({ src: m[0], tok });
  return tok;
}

// ---------------------------------------------------------------------------
// The block loop.
// ---------------------------------------------------------------------------

function blockTokens(lexer, src, tokens, mergePara) {
  let min = Infinity;
  for (; src;) {
    if (src.length < min) min = src.length;
    else break;

    let m = tokSpace(src);
    if (m) {
      src = src.substring(m.raw.length);
      const last = tokens[tokens.length - 1];
      if (m.raw.length === 1 && last !== undefined) last.raw += '\n';
      else tokens.push(m);
      continue;
    }

    m = tokCode(src);
    if (m) {
      src = src.substring(m.raw.length);
      const last = tokens[tokens.length - 1];
      if (last && (last.type === 'paragraph' || last.type === 'text')) {
        last.raw += (last.raw.endsWith('\n') ? '' : '\n') + m.raw;
        last.text += '\n' + m.text;
        lexer.queue[lexer.queue.length - 1].src = last.text;
      } else tokens.push(m);
      continue;
    }

    m = tokFences(src);
    if (m) { src = src.substring(m.raw.length); tokens.push(m); continue; }

    m = tokHeading(lexer, src);
    if (m) { src = src.substring(m.raw.length); tokens.push(m); continue; }

    m = tokHr(src);
    if (m) { src = src.substring(m.raw.length); tokens.push(m); continue; }

    m = tokBlockquote(lexer, src);
    if (m) { src = src.substring(m.raw.length); tokens.push(m); continue; }

    m = tokList(lexer, src);
    if (m) { src = src.substring(m.raw.length); tokens.push(m); continue; }

    m = tokHtml(src);
    if (m) { src = src.substring(m.raw.length); tokens.push(m); continue; }

    m = tokDef(src);
    if (m) {
      src = src.substring(m.raw.length);
      const last = tokens[tokens.length - 1];
      if (last && (last.type === 'paragraph' || last.type === 'text')) {
        last.raw += (last.raw.endsWith('\n') ? '' : '\n') + m.raw;
        last.text += m.raw;
        lexer.queue[lexer.queue.length - 1].src = last.text;
      } else {
        if (!lexer.links[m.tag]) lexer.links[m.tag] = { href: m.href, title: m.title };
        tokens.push(m);
      }
      continue;
    }

    m = tokTable(lexer, src);
    if (m) { src = src.substring(m.raw.length); tokens.push(m); continue; }

    m = tokLheading(lexer, src);
    if (m) { src = src.substring(m.raw.length); tokens.push(m); continue; }

    if (lexer.state.top) {
      m = tokParagraph(lexer, src);
      if (m) {
        const last = tokens[tokens.length - 1];
        if (mergePara && last && last.type === 'paragraph') {
          last.raw += (last.raw.endsWith('\n') ? '' : '\n') + m.raw;
          last.text += '\n' + m.text;
          lexer.queue.pop();
          lexer.queue[lexer.queue.length - 1].src = last.text;
        } else tokens.push(m);
        mergePara = false;
        src = src.substring(m.raw.length);
        continue;
      }
    }

    m = tokText(lexer, src);
    if (m) {
      src = src.substring(m.raw.length);
      const last = tokens[tokens.length - 1];
      if (last && last.type === 'text') {
        last.raw += (last.raw.endsWith('\n') ? '' : '\n') + m.raw;
        last.text += '\n' + m.text;
        lexer.queue.pop();
        lexer.queue[lexer.queue.length - 1].src = last.text;
      } else tokens.push(m);
      continue;
    }
    break;
  }
  lexer.state.top = true;
  return tokens;
}
// Rendering and the public entry point.

function renderCheckbox(cb) {
  return '<input ' + (cb.checked ? 'checked="" ' : '') + 'disabled="" type="checkbox"> ';
}

function renderBlock(lexer, t) {
  switch (t.type) {
    case 'space': return '';
    case 'hr': return '<hr>\n';
    case 'code': {
      const lang = (t.lang || '').match(/^\S*/)[0];
      const text = t.text ? t.text.replace(/\n$/, '') + '\n' : '';
      if (lang) return '<pre><code class="language-' + escapeHtml(lang) + '">' + escapeHtml(text, true) + '</code></pre>\n';
      return '<pre><code>' + escapeHtml(text, true) + '</code></pre>\n';
    }
    case 'blockquote': return '<blockquote>\n' + renderTokens(lexer, t.tokens) + '</blockquote>\n';
    case 'html': return t.text;
    case 'def': return '';
    case 'heading': return '<h' + t.depth + '>' + t.html + '</h' + t.depth + '>\n';
    case 'list': {
      const tag = t.ordered ? 'ol' : 'ul';
      const startAttr = t.ordered && t.start !== 1 ? ' start="' + t.start + '"' : '';
      let body = '';
      for (const item of t.items) {
        body += '<li>' + renderTokens(lexer, item.tokens) + '</li>\n';
      }
      return '<' + tag + startAttr + '>\n' + body + '</' + tag + '>\n';
    }
    case 'paragraph': return '<p>' + (t.cbPrefix ? renderCheckbox(t.cbPrefix) : '') + t.html + '</p>\n';
    case 'text': return t.html;
    case 'table': {
      let head = '';
      for (const c of t.header) {
        head += (c.align ? '<th align="' + c.align + '">' : '<th>') + c.html + '</th>\n';
      }
      let body = '';
      for (const row of t.rows) {
        let line = '';
        for (const c of row) {
          line += (c.align ? '<td align="' + c.align + '">' : '<td>') + c.html + '</td>\n';
        }
        body += '<tr>\n' + line + '</tr>\n';
      }
      if (body) body = '<tbody>' + body + '</tbody>';
      return '<table>\n<thead>\n' + '<tr>\n' + head + '</tr>\n' + '</thead>\n' + body + '</table>\n';
    }
    case 'checkbox': return renderCheckbox(t);
    default: return '';
  }
}

function renderTokens(lexer, tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) out += renderBlock(lexer, tokens[i]);
  return out;
}

export function parse(markdown) {
  const lexer = {
    links: Object.create(null),
    state: { inLink: false, inRawBlock: false, linkEmitted: false, linkParenPossible: true, top: true },
    queue: []
  };
  const src = markdown.replace(/\r\n|\r/g, '\n');
  const tokens = blockTokens(lexer, src, [], false);
  for (let i = 0; i < lexer.queue.length; i++) {
    const q = lexer.queue[i];
    lexer.state.inRawBlock = false;
    q.tok.html = inlineParse(lexer, q.src, false);
  }
  return renderTokens(lexer, tokens);
}
