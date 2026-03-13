import { insertNewlineAndIndent } from '@codemirror/commands';
import { getIndentUnit, indentService, indentString } from '@codemirror/language';
import { EditorSelection, type Extension, type StateCommand } from '@codemirror/state';

const TRAILING_COMMENT_RE = /\s*(?:--.*)?$/;
const EXPRESSION_CONTINUATION_RE =
  /(?:=|,|\(|\[|\{|\+|-|\*|\/|\/\/|%|\^|\.\.|==|~=|<=|>=|<|>|\band\b|\bor\b|\bnot\b|\breturn\b)\s*$/;
type BlockKind = 'block' | 'if';
interface DelimiterFrame {
  indent: number;
  open: string;
}
interface LineAnalysis {
  stack: BlockKind[];
  previousLine: string | null;
  delimiterFrames: DelimiterFrame[];
}
const PAIR_BY_OPEN: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
};
const OPEN_BY_CLOSE: Record<string, string> = {
  ')': '(',
  ']': '[',
  '}': '{',
};

function normalizeLine(text: string): string {
  return text.replace(TRAILING_COMMENT_RE, '').trim();
}

function isExpressionContinuation(line: string | null): boolean {
  return !!line && EXPRESSION_CONTINUATION_RE.test(line);
}

function isIfBlockOpener(line: string, previousLine: string | null): boolean {
  if (!/^if\b[\s\S]*\bthen$/.test(line)) return false;
  return !isExpressionContinuation(previousLine);
}

function isForBlockOpener(line: string): boolean {
  return /^for\b[\s\S]*\bdo$/.test(line);
}

function isWhileBlockOpener(line: string): boolean {
  return /^while\b[\s\S]*\bdo$/.test(line);
}

function isFunctionBlockOpener(line: string): boolean {
  if (!/\bfunction\b/.test(line)) return false;
  return /\)\s*(?::\s*.+)?$/.test(line);
}

function getBlockCloser(line: string, previousLine: string | null): string | null {
  if (line === 'repeat') return 'until ';
  if (line === 'do') return 'end';
  if (isIfBlockOpener(line, previousLine)) return 'end';
  if (isForBlockOpener(line)) return 'end';
  if (isWhileBlockOpener(line)) return 'end';
  if (isFunctionBlockOpener(line)) return 'end';
  return null;
}

function isIfMiddle(line: string): boolean {
  return /^elseif\b[\s\S]*\bthen$/.test(line) || /^else\b/.test(line);
}

function getPreviousSignificantLine(
  doc: { line: (lineNumber: number) => { text: string } },
  lineNumber: number,
): string | null {
  for (let current = lineNumber - 1; current >= 1; current -= 1) {
    const normalized = normalizeLine(doc.line(current).text);
    if (normalized) return normalized;
  }

  return null;
}

function hasExistingCloser(closer: string, nextLine: string | null): boolean {
  if (!nextLine) return false;
  if (closer === 'end') return /^end\b/.test(nextLine);
  if (closer === 'until ') return /^until\b/.test(nextLine);
  return false;
}

function hasMatchingCloserBelow(
  doc: { line: (lineNumber: number) => { text: string }; lines: number },
  lineNumber: number,
  currentIndent: number,
  closer: string,
  previousLine: string | null,
  tabSize: number,
): boolean {
  let depth = 1;
  let previousSignificantLine = previousLine;

  for (let current = lineNumber + 1; current <= doc.lines; current += 1) {
    const rawText = doc.line(current).text;
    const normalized = normalizeLine(rawText);

    if (!normalized) {
      continue;
    }

    const indent = countLeadingIndentColumns(rawText, tabSize);
    if (indent < currentIndent) {
      return false;
    }

    if (indent === currentIndent) {
      if (hasExistingCloser(closer, normalized)) {
        depth -= 1;
        if (depth === 0) {
          return true;
        }
      } else if (getBlockCloser(normalized, previousSignificantLine) === closer) {
        depth += 1;
      }
    }

    previousSignificantLine = normalized;
  }

  return false;
}

function analyzeLinesBeforeLine(
  doc: { line: (lineNumber: number) => { text: string } },
  lineNumber: number,
  tabSize: number,
  includedLineText?: string,
): LineAnalysis {
  const stack: BlockKind[] = [];
  const delimiterFrames: DelimiterFrame[] = [];
  let previousLine: string | null = null;
  let stringQuote: string | null = null;
  let escaped = false;

  const scanDelimiters = (text: string): void => {
    const lineIndent = countLeadingIndentColumns(text, tabSize);

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (stringQuote) {
        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === '\\') {
          escaped = true;
          continue;
        }

        if (char === stringQuote) {
          stringQuote = null;
        }

        continue;
      }

      if (char === '-' && next === '-') {
        break;
      }

      if (char === '"' || char === "'" || char === '`') {
        stringQuote = char;
        escaped = false;
        continue;
      }

      if (char === '(' || char === '[' || char === '{') {
        delimiterFrames.push({ indent: lineIndent, open: char });
        continue;
      }

      if (char === ')' || char === ']' || char === '}') {
        if (delimiterFrames[delimiterFrames.length - 1]?.open === OPEN_BY_CLOSE[char]) {
          delimiterFrames.pop();
        }
      }
    }
  };

  for (let current = 1; current < lineNumber; current += 1) {
    const text = doc.line(current).text;
    scanDelimiters(text);

    const normalized = normalizeLine(text);

    if (!normalized) {
      continue;
    }

    if (isIfMiddle(normalized)) {
      if (stack[stack.length - 1] === 'if') {
        previousLine = normalized;
        continue;
      }
    } else if (/^(?:end|until)\b/.test(normalized)) {
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      const closer = getBlockCloser(normalized, previousLine);
      if (closer === 'end') {
        stack.push(isIfBlockOpener(normalized, previousLine) ? 'if' : 'block');
      } else if (closer === 'until ') {
        stack.push('block');
      }
    }

    previousLine = normalized;
  }

  if (includedLineText !== undefined) {
    scanDelimiters(includedLineText);
  }

  return { stack, previousLine, delimiterFrames };
}

function getDelimiterIndentForCurrentLine(
  rawLine: string,
  frames: DelimiterFrame[],
  unit: number,
): number | null {
  const top = frames[frames.length - 1];
  if (!top) return null;

  const firstNonWhitespace = rawLine.trimStart()[0];
  if (firstNonWhitespace && OPEN_BY_CLOSE[firstNonWhitespace] === top.open) {
    return top.indent;
  }

  return top.indent + unit;
}

function countLeadingIndentColumns(text: string, tabSize: number): number {
  let columns = 0;

  for (const char of text) {
    if (char === ' ') {
      columns += 1;
      continue;
    }

    if (char === '\t') {
      columns += tabSize - (columns % tabSize);
      continue;
    }

    break;
  }

  return columns;
}

function getDelimiterIndentAfterLine(frames: DelimiterFrame[], unit: number): number | null {
  const top = frames[frames.length - 1];
  return top ? top.indent + unit : null;
}

function startsWithStructuralCloser(rawLine: string): boolean {
  const normalized = normalizeLine(rawLine);
  if (!normalized) return false;
  const first = rawLine.trimStart()[0];
  return first === ')' || first === ']' || first === '}' || /^end\b/.test(normalized) || /^until\b/.test(normalized);
}

function getIndentDepthForCurrentLine(currentLine: string, stack: BlockKind[]): number {
  if (/^(?:end|until)\b/.test(currentLine)) {
    return Math.max(0, stack.length - 1);
  }

  if (isIfMiddle(currentLine) && stack[stack.length - 1] === 'if') {
    return Math.max(0, stack.length - 1);
  }

  return stack.length;
}

function getIndentDepthAfterLine(currentLine: string, stack: BlockKind[], previousLine: string | null): number {
  if (/^(?:end|until)\b/.test(currentLine)) {
    return Math.max(0, stack.length - 1);
  }

  if (isIfMiddle(currentLine) && stack[stack.length - 1] === 'if') {
    return stack.length;
  }

  if (getBlockCloser(currentLine, previousLine)) {
    return stack.length + 1;
  }

  return stack.length;
}

export function luauIndentation(): Extension {
  return indentService.of((context, pos) => {
    const simulatedBreak = context.simulatedBreak;

    if (simulatedBreak === pos) {
      const beforeBreak = context.lineAt(pos, -1);
      const afterBreak = context.lineAt(pos, 1);
      const lineNumber = context.state.doc.lineAt(pos).number;
      const { stack, previousLine, delimiterFrames } = analyzeLinesBeforeLine(
        context.state.doc,
        lineNumber,
        context.state.tabSize,
        beforeBreak.text,
      );
      const currentLine = normalizeLine(beforeBreak.text);
      if (startsWithStructuralCloser(afterBreak.text)) {
        const closingLine = normalizeLine(afterBreak.text);
        const blockIndent = getIndentDepthForCurrentLine(closingLine, stack) * context.unit;
        const delimiterIndent = getDelimiterIndentForCurrentLine(afterBreak.text, delimiterFrames, context.unit);
        return Math.max(blockIndent, delimiterIndent ?? 0);
      }

      const blockIndent = getIndentDepthAfterLine(currentLine, stack, previousLine) * context.unit;
      const delimiterIndent = getDelimiterIndentAfterLine(delimiterFrames, context.unit);
      return Math.max(blockIndent, delimiterIndent ?? 0);
    }

    const line = context.lineAt(pos, 1);
    const lineNumber = context.state.doc.lineAt(line.from).number;
    const { stack, delimiterFrames } = analyzeLinesBeforeLine(context.state.doc, lineNumber, context.state.tabSize);
    const currentLine = normalizeLine(line.text);
    const blockIndent = getIndentDepthForCurrentLine(currentLine, stack) * context.unit;
    const delimiterIndent = getDelimiterIndentForCurrentLine(line.text, delimiterFrames, context.unit);
    return Math.max(blockIndent, delimiterIndent ?? 0);
  });
}

const insertLuauPair: StateCommand = ({ state, dispatch }) => {
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
    return false;
  }

  const { from } = state.selection.main;
  if (from === 0 || from >= state.doc.length) {
    return false;
  }

  const openChar = state.doc.sliceString(from - 1, from);
  const closeChar = state.doc.sliceString(from, from + 1);
  if (PAIR_BY_OPEN[openChar] !== closeChar) {
    return false;
  }

  const line = state.doc.lineAt(from);
  const baseIndent = countLeadingIndentColumns(line.text, state.tabSize);
  const innerIndent = baseIndent + getIndentUnit(state);
  const insertText = `\n${indentString(state, innerIndent)}\n${indentString(state, baseIndent)}`;
  const cursor = from + 1 + indentString(state, innerIndent).length;

  dispatch(
    state.update({
      changes: { from, to: from, insert: insertText },
      selection: EditorSelection.cursor(cursor),
      scrollIntoView: true,
      userEvent: 'input',
    }),
  );

  return true;
};

export const insertLuauBlock: StateCommand = ({ state, dispatch }) => {
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
    return false;
  }

  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  const offset = from - line.from;
  const beforeCursor = line.text.slice(0, offset);
  const afterCursor = line.text.slice(offset);

  if (/\S/.test(afterCursor)) {
    return false;
  }

  const previousLine = getPreviousSignificantLine(state.doc, line.number);
  const closer = getBlockCloser(normalizeLine(beforeCursor), previousLine);
  if (!closer) {
    return false;
  }

  const baseIndent = countLeadingIndentColumns(line.text, state.tabSize);
  if (hasMatchingCloserBelow(state.doc, line.number, baseIndent, closer, previousLine, state.tabSize)) {
    return false;
  }

  const innerIndent = baseIndent + getIndentUnit(state);
  const innerIndentText = indentString(state, innerIndent);
  const outerIndentText = indentString(state, baseIndent);
  const insertText = `\n${innerIndentText}\n${outerIndentText}${closer}`;
  const cursor = from + 1 + innerIndentText.length;

  dispatch(
    state.update({
      changes: { from, to: line.to, insert: insertText },
      selection: EditorSelection.cursor(cursor),
      scrollIntoView: true,
      userEvent: 'input',
    }),
  );

  return true;
};

const insertLuauSmartEnter: StateCommand = (target) => {
  return insertLuauBlock(target) || insertLuauPair(target);
};

export const luauEnterKeymap = [{ key: 'Enter', run: insertLuauSmartEnter, shift: insertNewlineAndIndent }];
