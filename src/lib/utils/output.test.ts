import { describe, it, expect } from 'vitest';
import { formatTime, isStackTraceLine, formatStackLine } from './output';

describe('formatTime', () => {
  it('formats microseconds', () => {
    expect(formatTime(0.5)).toBe('500μs');
  });

  it('formats 1 microsecond', () => {
    expect(formatTime(0.001)).toBe('1μs');
  });

  it('formats zero', () => {
    expect(formatTime(0)).toBe('0μs');
  });

  it('formats milliseconds', () => {
    expect(formatTime(1)).toBe('1.0ms');
  });

  it('formats seconds', () => {
    expect(formatTime(1000)).toBe('1.00s');
  });
});

describe('isStackTraceLine', () => {
  it('detects stack trace tab', () => {
    expect(isStackTraceLine('\tat main:5')).toBe(true);
  });

  it('detects stack traceback', () => {
    expect(isStackTraceLine('stack traceback:')).toBe(true);
  });

  it('rejects non-stack line', () => {
    expect(isStackTraceLine('blablabla')).toBe(false);
  });
});

describe('formatStackLine', () => {
  it('strips leading tab', () => {
    expect(formatStackLine('\tat main:5')).toBe('at main:5');
  });

  it('preserves non-tab line', () => {
    expect(formatStackLine('stack traceback:')).toBe('stack traceback:');
  });
});
