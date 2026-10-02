import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEmbedSnippet } from './embedSnippet.ts';

const url = new URL('https://play.luau.org/?embed=true');

function iframe(html: string): string {
  const match = html.match(/<iframe[\s\S]*?<\/iframe>/);
  assert.ok(match, 'snippet contains an iframe');
  return match[0];
}

test('a snippet that fits is a plain sized iframe', () => {
  const html = buildEmbedSnippet(url, 400, 200);

  assert.match(iframe(html), /width="100%"/);
  assert.match(iframe(html), /height="400"/);
  assert.doesNotMatch(html, /<style>/);
  assert.doesNotMatch(html, /luau-embed-toggle/);
});

test('an expandable iframe keeps its size when the stylesheet is stripped', () => {
  const html = buildEmbedSnippet(url, 400, 828);
  const stripped = html.replace(/<style>[\s\S]*<\/style>/, '');

  assert.match(html, /height:\s*var\(--luau-collapsed\)/);
  assert.match(iframe(stripped), /width="100%"/);
  assert.match(iframe(stripped), /height="400"/);
  assert.doesNotMatch(stripped, /<style>/);
});
