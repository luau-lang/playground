import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const grammarUrl =
  process.env.LUAU_TEXTMATE_GRAMMAR_URL ??
  'https://raw.githubusercontent.com/JohnnyMorganz/Luau.tmLanguage/main/Luau.tmLanguage.json';
const grammarPath = fileURLToPath(
  new URL('../src/lib/editor/Luau.tmLanguage.json', import.meta.url),
);
const temporaryPath = `${grammarPath}.tmp`;

const response = await fetch(grammarUrl, {
  headers: { 'User-Agent': 'luau-playground-grammar-sync' },
});

if (!response.ok) {
  throw new Error(
    `Unable to download Luau TextMate grammar: ${response.status} ${response.statusText}`,
  );
}

const grammarSource = await response.text();
const grammar = JSON.parse(grammarSource);

if (grammar.name !== 'Luau' || grammar.scopeName !== 'source.luau') {
  throw new Error('Downloaded file is not the expected Luau TextMate grammar');
}

let currentSource;
try {
  currentSource = await readFile(grammarPath, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const digest = createHash('sha256').update(grammarSource).digest('hex').slice(0, 12);

if (currentSource === grammarSource) {
  console.log(`TextMate grammar is already current (${digest})`);
} else {
  await writeFile(temporaryPath, grammarSource);
  await rename(temporaryPath, grammarPath);
  console.log(`Updated TextMate grammar from upstream (${digest})`);
}
