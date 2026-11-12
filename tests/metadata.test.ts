import { describe, expect, it } from 'vitest';
import {
	defaultSchedule,
	directionToKey,
	isMetadataLineLike,
	mergeSchedule,
	metadataToLine,
	parseMetadataLine,
	recordToSchedule,
	scheduleToRecord,
} from '../src/model/metadata';
import type { Schedule } from '../src/types';

const NOW = new Date('2026-01-01T09:00:00.000Z');

function schedule(overrides: Partial<Schedule> = {}): Schedule {
	return {
		...defaultSchedule(NOW),
		state: 'review',
		due: '2026-01-08T09:00:00.000Z',
		step: 0,
		intervalDays: 7,
		ease: 2500,
		reps: 4,
		lapses: 1,
		introduced: '2025-12-01T09:00:00.000Z',
		lastReviewed: NOW.toISOString(),
		reviewsToday: 2,
		reviewDay: '2026-01-01',
		...overrides,
	};
}

describe('metadata records', () => {
	it('round-trips a schedule', () => {
		const original = schedule();
		const record = scheduleToRecord(original);
		const parsed = recordToSchedule(record, defaultSchedule(NOW));
		expect(parsed).toEqual(original);
	});

	it('serializes optional flags only when set', () => {
		expect(scheduleToRecord(schedule())).not.toHaveProperty('leech');
		expect(scheduleToRecord(schedule())).not.toHaveProperty('suspended');
		expect(scheduleToRecord(schedule({ leech: true, suspended: true }))).toMatchObject({
			leech: true,
			suspended: true,
		});
	});

	it('defaults missing and invalid fields', () => {
		const fallback = defaultSchedule(NOW);
		const parsed = recordToSchedule(
			{ state: 'nonsense', due: 'not-a-date', step: -3, ivl: -5, ease: 'x' },
			fallback,
		);
		expect(parsed.state).toBe('new');
		expect(parsed.due).toBe(fallback.due);
		expect(parsed.step).toBe(0);
		expect(parsed.intervalDays).toBe(0);
		expect(parsed.ease).toBe(2500);
	});

	it('preserves unknown keys in records', () => {
		const record = { ...scheduleToRecord(schedule()), future: 42 };
		const next = recordToSchedule(record, defaultSchedule(NOW));
		expect(next.intervalDays).toBe(7);
		expect(record.future).toBe(42);
	});
});

describe('metadata lines', () => {
	it('serializes and parses a line', () => {
		const metadata = mergeSchedule(undefined, 'forward', schedule(), 'block1');
		const line = metadataToLine(metadata);
		expect(line.startsWith('<!-- fc-srs ')).toBe(true);
		expect(line.endsWith(' -->')).toBe(true);

		const parsed = parseMetadataLine(line);
		expect(parsed?.id).toBe('block1');
		expect(parsed?.v).toBe(1);
		expect(parsed?.cards?.fwd?.state).toBe('review');
	});

	it('preserves unknown top-level and per-record keys when merging', () => {
		const original = {
			v: 1,
			id: 'block1',
			custom: 'keep-me',
			cards: {
				fwd: { ...scheduleToRecord(schedule()), future: 'fwd-keep' },
			},
		};
		const merged = mergeSchedule(
			original,
			'reverse',
			schedule({ state: 'learning' }),
			'block1',
		);

		expect(merged.custom).toBe('keep-me');
		expect(merged.cards?.fwd?.future).toBe('fwd-keep');
		expect(merged.cards?.rev?.state).toBe('learning');
		expect(merged.id).toBe('block1');
	});

	it('uses fwd/rev direction keys', () => {
		expect(directionToKey('forward')).toBe('fwd');
		expect(directionToKey('reverse')).toBe('rev');
	});

	it('rejects non-metadata and malformed lines', () => {
		expect(parseMetadataLine('A;:B')).toBeNull();
		expect(parseMetadataLine('<!-- fc-srs {broken} -->')).toBeNull();
		expect(parseMetadataLine('<!-- fc-srs [1,2,3] -->')).toBeNull();
	});

	it('accepts extra whitespace', () => {
		const line = '  <!--   fc-srs   {"v":1,"id":"x","cards":{}}   -->  ';
		expect(parseMetadataLine(line)?.id).toBe('x');
	});
});

describe('metadata line detection', () => {
	it('only matches comments that start with the plugin marker', () => {
		const cases: Array<[string, boolean]> = [
			['<!-- fc-srs {"v":1,"id":"x","cards":{}} -->', true],
			['  <!--fc-srs {"v":1} -->', true],
			['<!-- fc-srs-extra -->', true],
			['<!-- fc-srsx -->', false],
			['<!-- comment -->', false],
			['text before <!-- fc-srs -->', false],
			['', false],
		];

		for (const [line, expected] of cases) {
			expect(isMetadataLineLike(line), line).toBe(expected);
		}
	});
});
