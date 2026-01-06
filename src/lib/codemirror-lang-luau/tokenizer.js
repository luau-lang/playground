import { ExternalTokenizer, ContextTracker } from "@lezer/lr";
import {
  BraceL,
  BraceR,
  InterpChunk,
  InterpClose,
  InterpEnd,
  InterpOpen,
  InterpStart,
  LongComment,
  LongString,
} from "./parser.terms.js";

const dash = 45;
const backtick = 96;
const backslash = 92;
const bracketL = 91;
const bracketR = 93;
const braceL = 123;
const braceR = 125;
const eq = 61;

function isInInterpolatedString(context) {
  return context && (context.inString || context.inInterpolation);
}

function scanLongBracket(input, eqCount) {
  while (input.next > -1) {
    if (input.next == bracketR) {
      let offset = 1;
      while (input.peek(offset) == eq) offset++;
      if (offset - 1 == eqCount && input.peek(offset) == bracketR) {
        input.advance();
        for (let i = 0; i < eqCount; i++) input.advance();
        input.advance();
        return;
      }
    }
    input.advance();
  }
}

function matchLongBracketStart(input, startOffset) {
  let offset = startOffset;
  let eqCount = 0;
  while (input.peek(offset) == eq) {
    eqCount++;
    offset++;
  }
  if (input.peek(offset) != bracketL) return null;
  return { eqCount, endOffset: offset };
}

export const longBracket = new ExternalTokenizer((input, stack) => {
  if (isInInterpolatedString(stack.context)) return;

  if (input.next == dash && input.peek(1) == dash && input.peek(2) == bracketL) {
    const match = matchLongBracketStart(input, 3);
    if (!match) return;

    input.advance();
    input.advance();
    input.advance();
    for (let i = 0; i < match.eqCount; i++) input.advance();
    input.advance();

    scanLongBracket(input, match.eqCount);
    input.acceptToken(LongComment);
    return;
  }

  if (input.next != bracketL) return;
  const match = matchLongBracketStart(input, 1);
  if (!match) return;

  input.advance();
  for (let i = 0; i < match.eqCount; i++) input.advance();
  input.advance();

  scanLongBracket(input, match.eqCount);
  input.acceptToken(LongString);
}, { contextual: true });

export const luauContext = new ContextTracker({
  start: { inString: false, inInterpolation: false, braceDepth: 0 },
  shift(context, term) {
    if (term == InterpStart) return { inString: true, inInterpolation: false, braceDepth: 0 };
    if (term == InterpEnd) return { inString: false, inInterpolation: false, braceDepth: 0 };
    if (term == InterpOpen) return { inString: false, inInterpolation: true, braceDepth: 0 };
    if (term == InterpClose) return { inString: true, inInterpolation: false, braceDepth: 0 };

    if (context.inInterpolation) {
      if (term == BraceL) return { ...context, braceDepth: context.braceDepth + 1 };
      if (term == BraceR && context.braceDepth > 0) {
        return { ...context, braceDepth: context.braceDepth - 1 };
      }
    }

    return context;
  },
  strict: false,
});

export const backtickTokens = new ExternalTokenizer(
  (input, stack) => {
    const context = stack.context;
    if (!context || (!context.inString && !context.inInterpolation)) {
      if (input.next != backtick) return;
      input.advance();
      input.acceptToken(InterpStart);
      return;
    }

    if (context.inString) {
      if (input.next == backtick) {
        input.advance();
        input.acceptToken(InterpEnd);
        return;
      }
      if (input.next == braceL) {
        input.advance();
        input.acceptToken(InterpOpen);
        return;
      }

      let size = 0;
      while (input.next > -1 && input.next != backtick && input.next != braceL) {
        if (input.next == backslash) {
          input.advance();
          size++;
          if (input.next < 0) break;
        }
        input.advance();
        size++;
      }
      if (size > 0) input.acceptToken(InterpChunk);
      return;
    }

    if (context.inInterpolation) {
      if (input.next == braceR && context.braceDepth == 0 && stack.canShift(InterpClose)) {
        input.advance();
        input.acceptToken(InterpClose);
      }
    }
  },
  { contextual: true }
);
