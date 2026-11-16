// main.ts — competition driver.
// Reads every case from <MAKEFUN_INPUT_DIR>/cases.json, renders it with the
// parser in ./parse.js, and writes <MAKEFUN_OUTPUT_DIR>/html.json as a JSON
// array of HTML strings in the cases' order. Node built-ins only; erasable
// TypeScript (type-stripped natively by node 22+).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from './parse.js';

interface Case {
  id: string;
  markdown: string;
}

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases: Case[] = JSON.parse(readFileSync(`${inputDir}/cases.json`, 'utf8'));
const html: string[] = cases.map((c) => parse(c.markdown));

mkdirSync(outputDir, { recursive: true });
writeFileSync(`${outputDir}/html.json`, JSON.stringify(html));
