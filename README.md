# markdown-render-speed-02 — entry

A dependency-free Markdown → HTML parser written from scratch (`parse.js`),
plus a competition driver (`main.ts`). Parser output is byte-identical to the
vendored marked 18.1.3 baseline (default options: GFM, no breaks) on all 720
practice cases in the kit. marked 18.1.3 is credited as the behavioral
reference whose output this parser matches; nothing in this entry copies or
vendors marked's code.

## Usage

```js
import { parse } from './parse.js';

parse('# hello *world*\n\n- [x] done\n');
// '<h1>hello <em>world</em></h1>\n<ul>\n<li><input checked="" disabled="" type="checkbox"> done</li>\n</ul>\n'
```

`parse(markdown)` takes a CommonMark/GFM string and returns the HTML string
that marked would produce. No options, no dependencies, single module.

## Driver

`main.ts` (erasable TypeScript, node built-ins only) is the competition
entry point: it reads `cases.json` from `MAKEFUN_INPUT_DIR` (default
`/input`), renders each case with `parse`, and writes `html.json` — a JSON
array of the HTML strings in the cases' order — to `MAKEFUN_OUTPUT_DIR`
(default `/output`).

## Design

- **Sticky regex lexer.** All anchored block/inline rules run as `"y"`-flag
  clones, so the inline lexer advances an index instead of slicing the source
  per token (the reference implementation re-slices on every match).
- **Single-pass render.** Inline tokens are rendered to HTML as they are
  produced rather than being stored and re-walked by a separate parser class,
  with a text-mode render path used where the reference renders token lists
  with its plain-text renderer (image alt text).
- **Masked emphasis prepass.** Emphasis scanning runs against a masked copy of
  the source (known reference links, code spans, escapes and HTML blocks
  replaced with same-length fillers) and caches last-possible-closer indices
  per segment, like the reference.
- **Memoized indent regexes.** The list tokenizer's indent-dependent patterns
  are cached with the reference's `max(0, min(3, R-1))` key clamping.
- Inline state (`inLink`, `inRawBlock`, emitted-link suppression, link-paren
  gating, lazy paragraph merging, blockquote lazy-line re-grouping) mirrors the
  reference's edge-case behavior byte for byte.

## Correctness

`720 / 720` practice cases pass exact string-equality against the kit's
`practice/reference/expected.json` (block + inline + document suites,
verified over multiple consecutive full runs).

## Performance

Full 720-case set, node 26:

| parser        | cpu time      |
|---------------|---------------|
| marked 18.1.3 | ~1540–1710 ms |
| this entry    | ~1070–1245 ms (~25–35% faster) |

## License

MIT — see [LICENSE](./LICENSE).
