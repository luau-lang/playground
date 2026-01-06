/**
 * Output Formatting Utilities
 * 
 * Shared helpers for formatting execution output and timing.
 */

/** Special float values that can't be represented as JSON numbers */
export type SpecialFloat = 'inf' | '-inf' | 'nan';

export type LuauValue = 
  | { type: 'nil' }
  | { type: 'boolean'; value: boolean }
  | { type: 'number'; value: number | SpecialFloat }
  | { type: 'string'; value: string }
  | { type: 'table'; value: Record<string, LuauValue> | LuauValue[]; isArray: boolean }
  | { type: 'function' }
  | { type: 'userdata' }
  | { type: 'thread' }
  | { type: 'circular' }
  | { type: 'vector'; value: (number | SpecialFloat)[] }
  | { type: 'buffer'; size: number };

export interface OutputLine {
  type: 'log' | 'error' | 'warn';
  text: string;
  values?: LuauValue[];
}

/**
 * Format execution time for display.
 */
export function formatTime(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}μs`;
  } else if (ms < 1000) {
    return `${ms.toFixed(1)}ms`;
  } else {
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

/**
 * Check if a line is part of a stack trace.
 */
export function isStackTraceLine(text: string): boolean {
  return text.startsWith('\t') || text.startsWith('stack traceback:');
}

/**
 * Format stack trace line for display.
 */
export function formatStackLine(text: string): string {
  if (text.startsWith('\t')) {
    return text.substring(1); // Remove leading tab
  }
  return text;
}

