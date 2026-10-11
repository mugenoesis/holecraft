import { describe, expect, it } from 'vitest';
import { formatWhen } from './time.ts';

const now = new Date('2026-10-11T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatWhen', () => {
  it('says "just now" for the last minute', () => {
    expect(formatWhen(ago(0), now)).toBe('just now');
    expect(formatWhen(ago(45 * SECOND), now)).toBe('just now');
  });

  it('counts minutes and hours, with the right plurals', () => {
    expect(formatWhen(ago(MINUTE), now)).toBe('1 minute ago');
    expect(formatWhen(ago(5 * MINUTE), now)).toBe('5 minutes ago');
    expect(formatWhen(ago(HOUR), now)).toBe('1 hour ago');
    expect(formatWhen(ago(5 * HOUR), now)).toBe('5 hours ago');
  });

  it('says "yesterday" and counts days for the last week', () => {
    expect(formatWhen(ago(DAY), now)).toBe('yesterday');
    expect(formatWhen(ago(3 * DAY), now)).toBe('3 days ago');
  });

  it('gives a plain date for anything older', () => {
    expect(formatWhen(ago(30 * DAY), now)).toBe('11 Sep 2026');
  });

  it('copes with a time slightly in the future (clocks disagree)', () => {
    expect(formatWhen(new Date(now.getTime() + 5 * SECOND).toISOString(), now)).toBe('just now');
  });

  it('copes with a date it cannot read', () => {
    expect(formatWhen('whenever', now)).toBe('');
  });
});
