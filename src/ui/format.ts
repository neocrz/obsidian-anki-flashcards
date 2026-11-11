import type { Flashcard, Schedule } from '../types';
import { formatDelay, formatIntervalDays } from '../scheduling/steps';

export function formatDue(schedule: Schedule, now: Date): string {
	if (schedule.state === 'new') return 'new';
	const due = new Date(schedule.due);
	const delay = due.getTime() - now.getTime();
	if (delay <= 0) return 'due now';
	return `in ${formatDelay(delay)}`;
}

export function formatInterval(schedule: Schedule): string {
	if (schedule.state === 'review') return formatIntervalDays(schedule.intervalDays);
	if (schedule.state === 'new') return 'new';
	return `step ${schedule.step + 1}`;
}

export function formatEase(ease: number): string {
	return `${(ease / 10).toFixed(0)}%`;
}

export function stateLabel(schedule: Schedule): string {
	switch (schedule.state) {
		case 'new':
			return 'New';
		case 'learning':
			return 'Learning';
		case 'review':
			return 'Review';
		case 'relearning':
			return 'Relearning';
	}
}

export function directionLabel(card: Flashcard): string {
	if (!card.twoWay) return 'One-way';
	return card.direction === 'forward' ? 'Forward' : 'Reverse';
}

export function reviewDetails(card: Flashcard, now: Date): Array<[string, string]> {
	const schedule = card.schedule;
	const details: Array<[string, string]> = [
		['State', stateLabel(schedule)],
		['Due', formatDue(schedule, now)],
		['Interval', formatInterval(schedule)],
		['Ease', formatEase(schedule.ease)],
		['Reps', String(schedule.reps)],
		['Lapses', String(schedule.lapses)],
	];

	if (schedule.reviewsToday > 0) {
		details.push(['Reviewed today', String(schedule.reviewsToday)]);
	}
	if (schedule.leech) details.push(['Leech', 'Yes']);
	if (schedule.suspended) details.push(['Suspended', 'Yes']);

	return details;
}
