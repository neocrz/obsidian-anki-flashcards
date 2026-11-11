import { describe, expect, it } from 'vitest';
import {
	formatDelay,
	formatIntervalDays,
	formatStepDuration,
	parseSteps,
} from '../src/scheduling/steps';
import { fuzzInterval, fuzzRangeFor } from '../src/scheduling/fuzz';

describe('step parsing', () => {
	it('parses minutes, hours, days, and weeks', () => {
		expect(parseSteps('1m 10m 1h 2d 1w')).toEqual([
			{ minutes: 1, label: '1m' },
			{ minutes: 10, label: '10m' },
			{ minutes: 60, label: '1h' },
			{ minutes: 2880, label: '2d' },
			{ minutes: 10080, label: '1w' },
		]);
	});

	it('accepts bare numbers as minutes and ignores invalid tokens', () => {
		expect(parseSteps('1 10 nonsense 0m -2m')).toEqual([
			{ minutes: 1, label: '1m' },
			{ minutes: 10, label: '10m' },
		]);
	});

	it('formats step durations', () => {
		expect(formatStepDuration(10)).toBe('10m');
		expect(formatStepDuration(90)).toBe('1.5h');
		expect(formatStepDuration(2880)).toBe('2d');
	});
});

describe('delay labels', () => {
	it('formats button labels', () => {
		expect(formatDelay(0)).toBe('now');
		expect(formatDelay(30_000)).toBe('<1m');
		expect(formatDelay(10 * 60_000)).toBe('10m');
		expect(formatDelay(90 * 60_000)).toBe('1.5h');
		expect(formatDelay(3 * 86_400_000)).toBe('3d');
		expect(formatIntervalDays(45)).toBe('1.5mo');
		expect(formatIntervalDays(730)).toBe('2y');
	});
});

describe('fuzz', () => {
	it('uses Anki-style brackets', () => {
		expect(fuzzRangeFor(1)).toBeNull();
		expect(fuzzRangeFor(2)).toEqual({ min: 2, max: 3 });
		expect(fuzzRangeFor(7)).toEqual({ min: 6, max: 8 });
		expect(fuzzRangeFor(8)).toEqual({ min: 7, max: 10 });
		expect(fuzzRangeFor(20)).toEqual({ min: 18, max: 22 });
		expect(fuzzRangeFor(100)).toEqual({ min: 95, max: 105 });
	});

	it('is deterministic and obeys the range', () => {
		for (let index = 0; index < 100; index += 1) {
			const value = fuzzInterval(20, `seed-${index}`, true);
			expect(value).toBeGreaterThanOrEqual(18);
			expect(value).toBeLessThanOrEqual(22);
			expect(fuzzInterval(20, `seed-${index}`, true)).toBe(value);
		}
	});

	it('is disabled by a flag and below two days', () => {
		expect(fuzzInterval(20, 'seed', false)).toBe(20);
		expect(fuzzInterval(1, 'seed', true)).toBe(1);
	});
});
