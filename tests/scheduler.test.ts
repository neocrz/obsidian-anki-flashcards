import { describe, expect, it } from 'vitest';
import { defaultSchedule } from '../src/model/metadata';
import {
	computeReviewIntervals,
	isDue,
	previewAnswers,
	scheduleAnswer,
} from '../src/scheduling/scheduler';
import { parseSteps } from '../src/scheduling/steps';
import type { Schedule, SchedulerConfig } from '../src/types';

const NOW = new Date('2026-01-01T09:00:00.000Z');
const MINUTE = 60_000;
const DAY = 86_400_000;

function config(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
	return {
		learningSteps: parseSteps('1m 10m'),
		relearningSteps: parseSteps('10m'),
		graduatingInterval: 1,
		easyInterval: 4,
		startingEase: 2500,
		minimumEase: 1300,
		hardIntervalFactor: 1.2,
		easyBonus: 1.3,
		intervalModifier: 1,
		lapseMultiplier: 0,
		maximumInterval: 36500,
		leechThreshold: 8,
		leechAction: 'tag',
		fuzz: false,
		...overrides,
	};
}

function newCard(overrides: Partial<Schedule> = {}): Schedule {
	return { ...defaultSchedule(NOW), ...overrides };
}

function reviewCard(overrides: Partial<Schedule> = {}): Schedule {
	return {
		...defaultSchedule(NOW),
		state: 'review',
		intervalDays: 10,
		ease: 2500,
		reps: 5,
		introduced: '2025-12-01T09:00:00.000Z',
		...overrides,
	};
}

function answer(
	schedule: Schedule,
	rating: 1 | 2 | 3 | 4,
	overrides: Partial<SchedulerConfig> = {},
) {
	return scheduleAnswer(schedule, rating, NOW, config(overrides), 'card-1');
}

function expectDueInMinutes(schedule: Schedule, minutes: number) {
	expect(new Date(schedule.due).getTime() - NOW.getTime()).toBe(minutes * MINUTE);
}

function expectDueInDays(schedule: Schedule, days: number) {
	expect(new Date(schedule.due).getTime() - NOW.getTime()).toBe(days * DAY);
}

describe('new cards', () => {
	it('Again starts step 0', () => {
		const next = answer(newCard(), 1);
		expect(next.state).toBe('learning');
		expect(next.step).toBe(0);
		expect(next.reps).toBe(1);
		expect(next.introduced).toBe(NOW.toISOString());
		expectDueInMinutes(next, 1);
	});

	it('Hard repeats with the average of current and next steps', () => {
		const next = answer(newCard(), 2);
		expect(next.state).toBe('learning');
		expect(next.step).toBe(0);
		expectDueInMinutes(next, 6);
	});

	it('Good advances to the next step', () => {
		const next = answer(newCard(), 3);
		expect(next.state).toBe('learning');
		expect(next.step).toBe(1);
		expectDueInMinutes(next, 10);
	});

	it('Good on the last step graduates', () => {
		const next = answer(newCard({ state: 'learning', step: 1, reps: 2 }), 3);
		expect(next.state).toBe('review');
		expect(next.step).toBe(0);
		expect(next.intervalDays).toBe(1);
		expect(next.ease).toBe(2500);
		expectDueInDays(next, 1);
	});

	it('Easy graduates immediately', () => {
		const next = answer(newCard(), 4);
		expect(next.state).toBe('review');
		expect(next.intervalDays).toBe(4);
		expect(next.ease).toBe(2500);
		expectDueInDays(next, 4);
	});

	it('applies a custom starting ease to new cards', () => {
		const next = answer(newCard(), 3, { startingEase: 2700 });
		expect(next.ease).toBe(2700);
		expect(next.state).toBe('learning');
	});

	it('uses a custom ease and graduating interval on graduation', () => {
		const next = answer(newCard({ state: 'learning', step: 1, reps: 1, ease: 2700 }), 3, {
			graduatingInterval: 3,
		});
		expect(next.ease).toBe(2700);
		expect(next.intervalDays).toBe(3);
	});
});

describe('review cards', () => {
	it('computes ordered hard/good/easy intervals', () => {
		const intervals = computeReviewIntervals(10, 2500, config(), 'seed');
		expect(intervals).toEqual({ hard: 12, good: 25, easy: 32 });
	});

	it('Hard lowers ease and uses the hard factor', () => {
		const next = answer(reviewCard(), 2);
		expect(next.state).toBe('review');
		expect(next.intervalDays).toBe(12);
		expect(next.ease).toBe(2350);
		expectDueInDays(next, 12);
	});

	it('Good keeps ease and uses the ease factor', () => {
		const next = answer(reviewCard(), 3);
		expect(next.intervalDays).toBe(25);
		expect(next.ease).toBe(2500);
	});

	it('Easy uses current ease for the interval then raises ease', () => {
		const next = answer(reviewCard(), 4);
		expect(next.intervalDays).toBe(32);
		expect(next.ease).toBe(2650);
	});

	it('Again lapses into relearning and preserves the old interval', () => {
		const next = answer(reviewCard({ lapses: 2 }), 1);
		expect(next.state).toBe('relearning');
		expect(next.intervalDays).toBe(10);
		expect(next.ease).toBe(2300);
		expect(next.lapses).toBe(3);
		expect(next.step).toBe(0);
		expectDueInMinutes(next, 10);
	});

	it('floors ease at the minimum', () => {
		const next = answer(reviewCard({ ease: 1400 }), 1);
		expect(next.ease).toBe(1300);
	});

	it('flags a leech at the threshold', () => {
		const next = answer(reviewCard({ lapses: 7 }), 1);
		expect(next.leech).toBe(true);
		expect(next.suspended).toBeUndefined();
	});

	it('suspends leeches when configured', () => {
		const next = answer(reviewCard({ lapses: 7 }), 1, { leechAction: 'suspend' });
		expect(next.leech).toBe(true);
		expect(next.suspended).toBe(true);
	});

	it('clamps intervals at the maximum', () => {
		const next = answer(reviewCard({ intervalDays: 36500 }), 3, { maximumInterval: 36500 });
		expect(next.intervalDays).toBe(36500);
	});

	it('counts review answers per local day', () => {
		const next = answer(reviewCard({ reviewDay: '2025-12-31', reviewsToday: 4 }), 3);
		expect(next.reviewsToday).toBe(1);
		expect(next.reviewDay).not.toBe('2025-12-31');
	});

	it('keeps the same-day review counter', () => {
		const first = answer(reviewCard(), 3);
		const second = answer({ ...first, due: NOW.toISOString() }, 3);
		expect(second.reviewsToday).toBe(2);
	});
});

describe('relearning', () => {
	const relearning = () =>
		reviewCard({
			state: 'relearning',
			step: 0,
			ease: 2300,
			lapses: 1,
			intervalDays: 10,
		});

	it('Again resets to the first relearning step', () => {
		const next = answer(relearning(), 1);
		expect(next.state).toBe('relearning');
		expect(next.step).toBe(0);
		expectDueInMinutes(next, 10);
	});

	it('Hard repeats the current step', () => {
		const next = answer(relearning(), 2);
		expect(next.state).toBe('relearning');
		expect(next.step).toBe(0);
		expectDueInMinutes(next, 15);
	});

	it('Good graduates with the lapse multiplier', () => {
		const next = answer(relearning(), 3);
		expect(next.state).toBe('review');
		expect(next.intervalDays).toBe(1);
		expect(next.ease).toBe(2300);
		expectDueInDays(next, 1);
	});

	it('applies a non-zero lapse multiplier', () => {
		const next = answer(relearning(), 3, { lapseMultiplier: 0.5 });
		expect(next.intervalDays).toBe(5);
	});

	it('Easy graduates with at least the easy interval', () => {
		const next = answer(relearning(), 4);
		expect(next.state).toBe('review');
		expect(next.intervalDays).toBe(4);
	});
});

describe('fuzz and previews', () => {
	it('is deterministic for the same seed', () => {
		const first = computeReviewIntervals(10, 2500, config({ fuzz: true }), 'seed');
		const second = computeReviewIntervals(10, 2500, config({ fuzz: true }), 'seed');
		expect(first).toEqual(second);
	});

	it('keeps hard < good < easy', () => {
		for (let index = 0; index < 50; index += 1) {
			const intervals = computeReviewIntervals(
				10,
				2500,
				config({ fuzz: true }),
				`seed-${index}`,
			);
			expect(intervals.hard).toBeLessThan(intervals.good);
			expect(intervals.good).toBeLessThan(intervals.easy);
		}
	});

	it('matches the preview to the saved answer', () => {
		const card = reviewCard();
		const preview = previewAnswers(card, NOW, config({ fuzz: true }), 'card-1');
		const saved = scheduleAnswer(card, 3, NOW, config({ fuzz: true }), 'card-1');
		expect(preview[3].schedule).toEqual(saved);
	});

	it('labels learning and graduated results', () => {
		const preview = previewAnswers(newCard(), NOW, config(), 'card-1');
		expect(preview[1].intervalLabel).toBe('1m');
		expect(preview[2].intervalLabel).toBe('6m');
		expect(preview[3].intervalLabel).toBe('10m');
		expect(preview[4].intervalLabel).toBe('4d');
	});
});

describe('due checks', () => {
	it('treats new cards as available', () => {
		expect(isDue(newCard(), NOW)).toBe(true);
	});

	it('respects timestamps and suspension', () => {
		expect(isDue(reviewCard({ due: NOW.toISOString() }), NOW)).toBe(true);
		expect(isDue(reviewCard({ due: new Date(NOW.getTime() + DAY).toISOString() }), NOW)).toBe(
			false,
		);
		expect(isDue(reviewCard({ suspended: true }), NOW)).toBe(false);
	});
});
