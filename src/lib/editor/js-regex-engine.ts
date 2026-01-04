/**
 * Minimal JavaScript regex engine for vscode-textmate.
 * Uses pre-compiled patterns from compile-grammar.ts vite plugin
 * 
 * This eliminates the need for oniguruma-to-es, vscode-oniguruma and oniguruma WASM at runtime.
 */

import { compiledPatterns } from 'virtual:compiled-patterns';

const MAX = 4294967295;

interface CaptureIndex {
  start: number;
  end: number;
  length: number;
}

interface Match {
  index: number;
  captureIndices: CaptureIndex[];
}

interface OnigString {
  content: string;
}

/**
 * JavaScript-based scanner compatible with vscode-textmate's IOnigScanner interface.
 */
class JavaScriptScanner {
  private regexps: (RegExp | null)[];

  constructor(patterns: string[]) {
    this.regexps = patterns.map((pattern) => {
      const compiled = compiledPatterns[pattern];
      if (!compiled) {
        // Pattern not in cache - this shouldn't happen for Luau grammar
        console.warn(`[JS Scanner] Pattern not pre-compiled: ${pattern.slice(0, 50)}`);
        return null;
      }
      try {
        return new RegExp(compiled[0], compiled[1]);
      } catch (e) {
        console.warn(`[JS Scanner] Failed to construct RegExp: ${pattern.slice(0, 50)}`);
        return null;
      }
    });
  }

  findNextMatchSync(
    string: string | OnigString,
    startPosition: number
  ): Match | null {
    const str = typeof string === 'string' ? string : string.content;
    const pending: [number, RegExpExecArray][] = [];

    for (let i = 0; i < this.regexps.length; i++) {
      const regexp = this.regexps[i];
      if (!regexp) continue;

      try {
        regexp.lastIndex = startPosition;
        const match = regexp.exec(str);
        if (!match) continue;

        // If match starts at startPosition, return immediately
        if (match.index === startPosition) {
          return this.toResult(i, match);
        }
        pending.push([i, match]);
      } catch {
        continue;
      }
    }

    // Return the match with the earliest start position
    if (pending.length) {
      const minIndex = Math.min(...pending.map((m) => m[1].index));
      for (const [i, match] of pending) {
        if (match.index === minIndex) {
          return this.toResult(i, match);
        }
      }
    }

    return null;
  }

  private toResult(index: number, match: RegExpExecArray): Match {
    return {
      index,
      captureIndices: (match.indices || []).map((indice) => {
        if (indice == null) {
          return { start: MAX, end: MAX, length: 0 };
        }
        return {
          start: indice[0],
          end: indice[1],
          length: indice[1] - indice[0],
        };
      }),
    };
  }
}

/**
 * OnigString implementation (just wraps the string).
 */
class OnigStringImpl implements OnigString {
  constructor(public content: string) {}
}

/**
 * Create the onigLib object expected by vscode-textmate Registry.
 */
export function createJsOnigLib() {
  return Promise.resolve({
    createOnigScanner: (patterns: string[]) => new JavaScriptScanner(patterns),
    createOnigString: (str: string) => new OnigStringImpl(str),
  });
}

