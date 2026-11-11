import { DAY_MS, MINUTE_MS } from '../constants';
import type { Rating, Schedule, SchedulerConfig, Step } from '../types';
import { localDateKey } from '../utils/dates';
import { fuzzInterval } from './fuzz';
import { formatDelay, formatIntervalDays } from './steps';

const FALLBACK_STEP: Step = { minutes: 1, label: '1m' };

export interface RatingPreview {
	schedule: Schedule;
	/** Label for the rating button, e.g. "10m", "3d". */
	intervalLabel: string;
	/** Human due label, e.g. "in 10m". */
	dueLabel: string;
}

interface ReviewIntervals {
	hard: number;
	good: number;
	easy: number;
}

function stepsOrFallback(steps: readonly Step[], fallback: Step): Step[] {
	return steps.length > 0 ? [...steps] : [fallback];
}

function clampStep(step: number, length: number): number {
	if (!Number.isFinite(step)) return 0;
	return Math.min(Math.max(0, Math.round(step)), Math.max(0, length - 1));
}

function dueAfterMinutes(now: Date, minutes: number): string {
	return new Date(now.getTime() + minutes * MINUTE_MS).toISOString();
}

function dueAfterDays(now: Date, days: number): string {
	return new Date(now.getTime() + days * DAY_MS).toISOString();
}

function clampDays(days: number, maximum: number): number {
	return Math.min(Math.max(1, Math.floor(days)), Math.max(1, Math.floor(maximum)));
}

function hardLearningDelay(step: number, steps: readonly Step[]): number {
	const current = steps[step] ?? steps[0] ?? FALLBACK_STEP;
	const next = steps[step + 1];
	if (next) return Math.max(1, Math.round((current.minutes + next.minutes) / 2));
	return Math.max(1, Math.round(current.minutes * 1.5));
}

function reviewEaseAfter(ease: number, rating: Rating, minimumEase: number): number {
	const delta = rating === 1 ? -200 : rating === 2 ? -150 : rating === 4 ? 150 : 0;
	return Math.max(minimumEase, Math.round(ease + delta));
}

/** Build the three day intervals. Exported for table-driven tests. */
export function computeReviewIntervals(
	previousDays: number,
	ease: number,
	config: SchedulerConfig,
	seed: string,
): ReviewIntervals {
	const previous = Math.max(1, previousDays || 1);
	const modifier = config.intervalModifier;
	const maximum = Math.max(1, Math.floor(config.maximumInterval));

	const hardRaw = Math.max(
		previous + 1,
		Math.floor(previous * config.hardIntervalFactor * modifier),
	);
	const goodRaw = Math.max(
		previous + 1,
		hardRaw + 1,
		Math.floor(previous * (ease / 1000) * modifier),
	);
	const easyRaw = Math.max(
		previous + 1,
		goodRaw + 1,
		Math.floor(previous * (ease / 1000) * config.easyBonus * modifier),
	);

	const hard = clampDays(
		Math.max(previous + 1, fuzzInterval(hardRaw, `${seed}:hard:${previous}`, config.fuzz)),
		maximum,
	);
	const good = clampDays(
		Math.max(hard + 1, fuzzInterval(goodRaw, `${seed}:good:${previous}`, config.fuzz)),
		maximum,
	);
	const easy = clampDays(
		Math.max(good + 1, fuzzInterval(easyRaw, `${seed}:easy:${previous}`, config.fuzz)),
		maximum,
	);

	return { hard, good, easy };
}

function touch(schedule: Schedule, now: Date): void {
	schedule.reps += 1;
	schedule.lastReviewed = now.toISOString();
	schedule.introduced ??= now.toISOString();
}

function countReviewAnswer(schedule: Schedule, now: Date): void {
	const day = localDateKey(now);
	if (schedule.reviewDay === day) {
		schedule.reviewsToday += 1;
	} else {
		schedule.reviewDay = day;
		schedule.reviewsToday = 1;
	}
}

function graduate(
	schedule: Schedule,
	now: Date,
	intervalDays: number,
	ease: number,
	maximumInterval: number,
): Schedule {
	const interval = clampDays(intervalDays, maximumInterval);
	schedule.state = 'review';
	schedule.step = 0;
	schedule.intervalDays = interval;
	schedule.ease = Math.round(ease);
	schedule.due = dueAfterDays(now, interval);
	return schedule;
}

function answerLearning(
	schedule: Schedule,
	rating: Rating,
	now: Date,
	config: SchedulerConfig,
): Schedule {
	const steps = stepsOrFallback(config.learningSteps, FALLBACK_STEP);
	const step = clampStep(schedule.step, steps.length);
	const current = steps[step] ?? FALLBACK_STEP;

	schedule.state = 'learning';

	if (rating === 1) {
		schedule.step = 0;
		schedule.due = dueAfterMinutes(now, steps[0]?.minutes ?? current.minutes);
		return schedule;
	}

	if (rating === 2) {
		schedule.step = step;
		schedule.due = dueAfterMinutes(now, hardLearningDelay(step, steps));
		return schedule;
	}

	if (rating === 3) {
		const next = step + 1;
		if (next >= steps.length) {
			return graduate(
				schedule,
				now,
				config.graduatingInterval,
				schedule.ease || config.startingEase,
				config.maximumInterval,
			);
		}
		schedule.step = next;
		schedule.due = dueAfterMinutes(now, steps[next]?.minutes ?? current.minutes);
		return schedule;
	}

	return graduate(
		schedule,
		now,
		config.easyInterval,
		schedule.ease || config.startingEase,
		config.maximumInterval,
	);
}

function lapseInterval(schedule: Schedule, config: SchedulerConfig): number {
	const base = Math.max(1, schedule.intervalDays || 1);
	return clampDays(Math.floor(base * config.lapseMultiplier), config.maximumInterval);
}

function answerRelearning(
	schedule: Schedule,
	rating: Rating,
	now: Date,
	config: SchedulerConfig,
	seed: string,
): Schedule {
	const steps = stepsOrFallback(config.relearningSteps, FALLBACK_STEP);
	const step = clampStep(schedule.step, steps.length);
	const current = steps[step] ?? FALLBACK_STEP;

	if (rating === 1) {
		schedule.state = 'relearning';
		schedule.step = 0;
		schedule.due = dueAfterMinutes(now, steps[0]?.minutes ?? current.minutes);
		return schedule;
	}

	if (rating === 2) {
		schedule.state = 'relearning';
		schedule.step = step;
		schedule.due = dueAfterMinutes(now, hardLearningDelay(step, steps));
		return schedule;
	}

	if (rating === 3) {
		const next = step + 1;
		if (next < steps.length) {
			schedule.state = 'relearning';
			schedule.step = next;
			schedule.due = dueAfterMinutes(now, steps[next]?.minutes ?? current.minutes);
			return schedule;
		}

		const interval = clampDays(
			Math.max(
				1,
				fuzzInterval(lapseInterval(schedule, config), `${seed}:relearn-good`, config.fuzz),
			),
			config.maximumInterval,
		);
		return graduate(
			schedule,
			now,
			interval,
			schedule.ease || config.startingEase,
			config.maximumInterval,
		);
	}

	const interval = clampDays(
		Math.max(
			lapseInterval(schedule, config),
			config.easyInterval,
			fuzzInterval(config.easyInterval, `${seed}:relearn-easy`, config.fuzz),
		),
		config.maximumInterval,
	);
	return graduate(
		schedule,
		now,
		interval,
		schedule.ease || config.startingEase,
		config.maximumInterval,
	);
}

function answerReview(
	schedule: Schedule,
	rating: Rating,
	now: Date,
	config: SchedulerConfig,
	seed: string,
): Schedule {
	const previousDays = Math.max(1, schedule.intervalDays || 1);
	const easeBefore = schedule.ease || config.startingEase;

	countReviewAnswer(schedule, now);

	if (rating === 1) {
		schedule.state = 'relearning';
		schedule.step = 0;
		schedule.ease = reviewEaseAfter(easeBefore, rating, config.minimumEase);
		schedule.lapses += 1;
		schedule.due = dueAfterMinutes(now, config.relearningSteps[0]?.minutes ?? 10);

		if (schedule.lapses >= config.leechThreshold) {
			schedule.leech = true;
			if (config.leechAction === 'suspend') schedule.suspended = true;
		}
		return schedule;
	}

	const intervals = computeReviewIntervals(previousDays, easeBefore, config, seed);
	const interval = rating === 2 ? intervals.hard : rating === 3 ? intervals.good : intervals.easy;

	schedule.state = 'review';
	schedule.step = 0;
	schedule.intervalDays = interval;
	schedule.ease = reviewEaseAfter(easeBefore, rating, config.minimumEase);
	schedule.due = dueAfterDays(now, interval);
	return schedule;
}

/**
 * Apply one rating. Pure and deterministic; `seed` is normally the card ID.
 * The returned schedule is a new object.
 */
export function scheduleAnswer(
	input: Schedule,
	rating: Rating,
	now: Date,
	config: SchedulerConfig,
	seed: string,
): Schedule {
	const schedule: Schedule = { ...input };
	const previousState = schedule.state;
	const roundSeed = `${seed}:${schedule.reps + 1}`;

	if (previousState === 'new') {
		schedule.ease = config.startingEase;
	}

	if (previousState === 'review') {
		answerReview(schedule, rating, now, config, roundSeed);
	} else if (previousState === 'relearning') {
		answerRelearning(schedule, rating, now, config, roundSeed);
	} else {
		answerLearning(schedule, rating, now, config);
	}

	touch(schedule, now);
	return schedule;
}

export function previewAnswers(
	schedule: Schedule,
	now: Date,
	config: SchedulerConfig,
	seed: string,
): Record<Rating, RatingPreview> {
	const previews = {} as Record<Rating, RatingPreview>;

	for (const rating of [1, 2, 3, 4] as const) {
		const next = scheduleAnswer(schedule, rating, now, config, seed);
		const delay = new Date(next.due).getTime() - now.getTime();
		const intervalLabel =
			next.state === 'review' ? formatIntervalDays(next.intervalDays) : formatDelay(delay);

		previews[rating] = {
			schedule: next,
			intervalLabel,
			dueLabel: delay <= 0 ? 'now' : `in ${formatDelay(delay)}`,
		};
	}

	return previews;
}

export function isDue(schedule: Schedule, now: Date): boolean {
	if (schedule.suspended) return false;
	if (schedule.state === 'new') return true;
	return new Date(schedule.due).getTime() <= now.getTime();
}

export function isSuspended(schedule: Schedule): boolean {
	return schedule.suspended === true;
}
