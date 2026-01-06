import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parser } from "../src/lib/codemirror-lang-luau/parser.js";

const source = readFileSync(new URL("./luau-corpus.luau", import.meta.url), "utf8");
const tree = parser.parse(source);

assert.ok(tree, "parser returned a tree");
assert.equal(tree.topNode.type.name, "Chunk", "root node is Chunk");

console.log(`Parsed Luau corpus: ${tree.topNode.type.name} (${tree.length} chars)`);
