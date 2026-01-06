import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { highlightTree, tagHighlighter, tags as t } from "@lezer/highlight";
import { luauLanguage } from "../src/lib/codemirror-lang-luau/index.js";

const source = readFileSync(new URL("./luau-corpus.luau", import.meta.url), "utf8");
const tree = luauLanguage.parser.parse(source);

const testHighlighter = tagHighlighter([
  { tag: t.function(t.variableName), class: "fn" },
  { tag: t.definition(t.variableName), class: "var-def" },
  { tag: t.definition(t.typeName), class: "type-def" },
  { tag: t.variableName, class: "var" },
  { tag: t.typeName, class: "type" },
  { tag: t.controlKeyword, class: "kw" },
  { tag: t.definitionKeyword, class: "kw" },
  { tag: t.operatorKeyword, class: "kw" },
  { tag: t.keyword, class: "kw" },
  { tag: t.modifier, class: "modifier" },
  { tag: t.operator, class: "op" },
  { tag: t.definitionOperator, class: "op" },
  { tag: t.compareOperator, class: "op" },
  { tag: t.arithmeticOperator, class: "op" },
  { tag: t.bitwiseOperator, class: "op" },
  { tag: t.typeOperator, class: "op" },
  { tag: t.string, class: "string" },
  { tag: t.special(t.string), class: "string" },
  { tag: t.number, class: "number" },
  { tag: t.comment, class: "comment" },
  { tag: t.punctuation, class: "punct" },
  { tag: t.meta, class: "meta" },
]);

const classes = Array.from({ length: source.length }, () => new Set());

highlightTree(tree, testHighlighter, (from, to, cls) => {
  const names = cls.split(" ").filter(Boolean);
  for (let i = from; i < to; i++) {
    for (const name of names) {
      classes[i].add(name);
    }
  }
});

function findAnchor(anchor) {
  const start = source.indexOf(anchor);
  assert.ok(start >= 0, `anchor not found: ${anchor}`);
  return start;
}

function assertTokenClass({ anchor, token, className }) {
  const start = findAnchor(anchor);
  const tokenOffset = anchor.indexOf(token);
  let from;
  if (tokenOffset >= 0) {
    from = start + tokenOffset;
  } else {
    const found = source.indexOf(token, start);
    assert.ok(found >= 0, `token not found after anchor: ${token} in ${anchor}`);
    from = found;
  }
  const to = from + token.length;
  for (let i = from; i < to; i++) {
    assert.ok(
      classes[i].has(className),
      `expected ${className} on '${token}' at ${from}, got ${Array.from(classes[i]).join(", ")}`
    );
  }
}

const expectations = [
  { anchor: "local number = 10", token: "local", className: "kw" },
  { anchor: "local number = 10", token: "number", className: "var" },
  { anchor: "local number = 10", token: "=", className: "op" },
  { anchor: "local type = \"identifier\"", token: "type", className: "var" },
  { anchor: "local type = \"identifier\"", token: "identifier", className: "string" },
  { anchor: "local continue = 42", token: "continue", className: "var" },
  { anchor: "\n    continue\n", token: "continue", className: "kw" },
  { anchor: "local function makeFoo", token: "function", className: "kw" },
  { anchor: "local function makeFoo", token: "makeFoo", className: "fn" },
  { anchor: "makeFoo<T>(bar: number, ...: T): T", token: "T", className: "type-def" },
  { anchor: "makeFoo<T>(bar: number, ...: T): T", token: "bar", className: "var-def" },
  { anchor: "makeFoo<T>(bar: number, ...: T): T", token: "number", className: "type" },
  { anchor: "...: T): T", token: "T", className: "type" },
  { anchor: "local made = makeFoo(1)", token: "makeFoo", className: "fn" },
  { anchor: "type Vec2 =", token: "type", className: "kw" },
  { anchor: "type Vec2 =", token: "Vec2", className: "type-def" },
  { anchor: "export type Alias", token: "export", className: "kw" },
  { anchor: "export type Alias", token: "type", className: "kw" },
  { anchor: "export type Alias", token: "Alias", className: "type-def" },
  { anchor: "export type Alias", token: "Vec2", className: "type" },
  { anchor: "packer<T...>(...: T...): T...", token: "T", className: "type-def" },
  { anchor: "...: T...): T...", token: "T", className: "type" },
  { anchor: "type Callback = (x: number, y: string) -> number", token: "x", className: "var-def" },
  { anchor: "number, y: string", token: "y", className: "var-def" },
  { anchor: "type Callback = (x: number, y: string) -> number", token: "->", className: "op" },
  { anchor: "returnsTuple(): (number, string, ...boolean)", token: "number", className: "type" },
  { anchor: "read x: number", token: "read", className: "modifier" },
  { anchor: "write y: string", token: "write", className: "modifier" },
  { anchor: "local typed: typeof(number)", token: "typeof", className: "kw" },
  { anchor: "local typed: typeof(number)", token: "number", className: "var" },
  { anchor: "local casted = number :: Vec2", token: "::", className: "op" },
  { anchor: "local casted = number :: Vec2", token: "Vec2", className: "type" },
  { anchor: "number += 5", token: "+=", className: "op" },
  { anchor: "number //= 2", token: "//=", className: "op" },
  { anchor: "number ..= \"!\"", token: "..=", className: "op" },
  { anchor: "\n  return\nend\n\nlocal function packer", token: "return", className: "kw" },
  { anchor: "local msg = `value is", token: "`value is ", className: "string" },
  { anchor: "local long = [=[line one", token: "[=[line one\nline two]=]", className: "string" },
  { anchor: "-- regular comment", token: "-- regular comment", className: "comment" },
  { anchor: "--[=[\nlong comment", token: "--[=[\nlong comment with [=[ nested text\n]=]", className: "comment" },
  { anchor: "for _, n in numbers do", token: "_", className: "var-def" },
  { anchor: "for _, n in numbers do", token: "n", className: "var-def" },
];

for (const expectation of expectations) {
  assertTokenClass(expectation);
}

console.log(`Luau highlight test passed (${expectations.length} checks).`);
