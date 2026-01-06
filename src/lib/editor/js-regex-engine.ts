/**
 * Minimal JavaScript regex engine for vscode-textmate.
 * Uses pre-compiled patterns from compile-grammar.ts vite plugin.
 *
 * Dynamically generated long-bracket end patterns (resolved backrefs) are
 * handled with a small custom matcher to avoid runtime oniguruma-to-es usage.
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

interface LongBracketEndMatcher {
  type: 'longBracketEnd';
  needle: string;
}

type PatternMatcher = RegExp | LongBracketEndMatcher | null;

const warnedPatterns = new Set<string>();

function createLongBracketEndMatcher(pattern: string): LongBracketEndMatcher | null {
  if (pattern.length < 4) return null;
  if (pattern[0] !== '\\' || pattern[1] !== ']') return null;
  if (pattern[pattern.length - 2] !== '\\' || pattern[pattern.length - 1] !== ']') return null;

  for (let i = 2; i < pattern.length - 2; i++) {
    if (pattern[i] !== '=') return null;
  }

  const equals = pattern.slice(2, -2);
  return { type: 'longBracketEnd', needle: `]${equals}]` };
}

/**
 * JavaScript-based scanner compatible with vscode-textmate's IOnigScanner interface.
 */
class JavaScriptScanner {
  private matchers: PatternMatcher[];

  constructor(patterns: string[]) {
    this.matchers = patterns.map((pattern) => {
      const compiled = compiledPatterns[pattern];
      if (compiled) {
        try {
          return new RegExp(compiled[0], compiled[1]);
        } catch {
          console.warn(`[JS Scanner] Failed to construct RegExp: ${pattern.slice(0, 50)}`);
          return null;
        }
      }

      if (compiled === null) {
        return null;
      }

      const longBracketMatcher = createLongBracketEndMatcher(pattern);
      if (longBracketMatcher) {
        return longBracketMatcher;
      }

      if (!warnedPatterns.has(pattern)) {
        warnedPatterns.add(pattern);
        console.warn(`[JS Scanner] No compiled pattern for: ${pattern.slice(0, 50)}`);
      }

      return null;
    });
  }

  findNextMatchSync(
    string: string | OnigString,
    startPosition: number
  ): Match | null {
    const str = typeof string === 'string' ? string : string.content;
    const pending: Array<
      | { index: number; match: RegExpExecArray; patternIndex: number }
      | { index: number; start: number; end: number; patternIndex: number }
    > = [];

    for (let i = 0; i < this.matchers.length; i++) {
      const matcher = this.matchers[i];
      if (!matcher) continue;

      if (matcher instanceof RegExp) {
        try {
          matcher.lastIndex = startPosition;
          const match = matcher.exec(str);
          if (!match) continue;

          if (match.index === startPosition) {
            return this.toResult(i, match);
          }
          pending.push({ index: match.index, match, patternIndex: i });
        } catch {
          continue;
        }
      } else if (matcher.type === 'longBracketEnd') {
        const index = str.indexOf(matcher.needle, startPosition);
        if (index === -1) continue;
        const end = index + matcher.needle.length;
        if (index === startPosition) {
          return this.toResultRange(i, index, end);
        }
        pending.push({ index, start: index, end, patternIndex: i });
      }
    }

    // Return the match with the earliest start position
    if (pending.length) {
      const minIndex = Math.min(...pending.map((m) => m.index));
      for (const entry of pending) {
        if (entry.index !== minIndex) continue;
        if ('match' in entry) {
          return this.toResult(entry.patternIndex, entry.match);
        }
        return this.toResultRange(entry.patternIndex, entry.start, entry.end);
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

  private toResultRange(index: number, start: number, end: number): Match {
    return {
      index,
      captureIndices: [{ start, end, length: end - start }],
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
