import type { Step } from '../types';

const UNIT_MINUTES: Record<string, number> = {
	m: 1,
	h: 60,
	d: 1440,
	w: 10080,
};

function formatNumber(value: number): string {
	if (Number.isInteger(value)) return String(value);
	return String(Math.round(value * 10) / 10);
}

/** Parse "1m 10m 1h 2d" into minutes. Invalid tokens are ignored. */
export function parseSteps(input: string): Step[] {
	const steps: Step[] = [];
	for (const token of input.split(/[\s,]+/).filter(Boolean)) {
		const match = /^(\d+(?:\.\d+)?)([mhdw])?$/i.exec(token);
		if (!match) continue;

		const amount = Number(match[1]);
		const unit = (match[2] ?? 'm').toLowerCase();
		const multiplier = UNIT_MINUTES[unit];
		if (!multiplier || !Number.isFinite(amount) || amount <= 0) continue;

		const minutes = Math.round(amount * multiplier * 100) / 100;
		steps.push({ minutes, label: `${formatNumber(amount)}${unit}` });
	}
	return steps;
}

/** Compact human duration for a number of minutes. */
export function formatStepDuration(minutes: number): string {
	if (minutes < 60) return `${formatNumber(minutes)}m`;
	if (minutes < 1440) return `${formatNumber(minutes / 60)}h`;
	return `${formatNumber(minutes / 1440)}d`;
}

/** Compact label for a millisecond delay, used by rating buttons. */
export function formatDelay(milliseconds: number): string {
	if (milliseconds <= 0) return 'now';
	if (milliseconds < 60_000) return '<1m';

	const minutes = milliseconds / 60_000;
	if (minutes < 60) return `${Math.round(minutes)}m`;

	const hours = minutes / 60;
	if (hours < 24) return `${formatNumber(hours)}h`;

	const days = hours / 24;
	if (days < 30) return `${Math.round(days)}d`;

	const months = days / 30;
	if (months < 12) return `${formatNumber(months)}mo`;

	return `${formatNumber(days / 365)}y`;
}

/** Compact review interval label, e.g. 1d, 3d, 2.5mo. */
export function formatIntervalDays(days: number): string {
	if (!Number.isFinite(days) || days <= 0) return 'now';
	if (days < 1) return formatStepDuration(days * 1440);
	if (days < 30) return `${formatNumber(days)}d`;
	if (days < 365) return `${formatNumber(days / 30)}mo`;
	return `${formatNumber(days / 365)}y`;
}
