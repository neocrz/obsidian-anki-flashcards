import { METADATA_MARKER, METADATA_VERSION } from '../constants';
import type { CardDirection, MetadataDirection, NoteMetadataData, Schedule } from '../types';
import { parseIsoDate } from '../utils/dates';

const STATE_VALUES = new Set(['new', 'learning', 'review', 'relearning']);

const METADATA_LINE_START = new RegExp(`^\\s*<!--\\s*${METADATA_MARKER}\\b`);

function asFiniteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asNonNegativeInteger(value: unknown, fallback: number): number {
	const number = asFiniteNumber(value);
	if (number === undefined) return fallback;
	return Math.max(0, Math.round(number));
}

export function defaultSchedule(now: Date): Schedule {
	return {
		due: now.toISOString(),
		state: 'new',
		step: 0,
		intervalDays: 0,
		ease: 2500,
		reps: 0,
		lapses: 0,
		reviewsToday: 0,
	};
}

export function directionToKey(direction: CardDirection): MetadataDirection {
	return direction === 'forward' ? 'fwd' : 'rev';
}

export function keyToDirection(key: MetadataDirection): CardDirection {
	return key === 'fwd' ? 'forward' : 'reverse';
}

export function isMetadataLineLike(line: string): boolean {
	return METADATA_LINE_START.test(line);
}

export function parseMetadataLine(line: string): NoteMetadataData | null {
	const pattern = new RegExp(`^\\s*<!--\\s*${METADATA_MARKER}\\s+(\\{.*\\})\\s*-->\\s*$`);
	const match = pattern.exec(line);
	if (!match?.[1]) return null;

	try {
		const parsed: unknown = JSON.parse(match[1]);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

		const data = parsed as NoteMetadataData;
		if (data.cards && (typeof data.cards !== 'object' || Array.isArray(data.cards))) {
			delete data.cards;
		}
		if (data.id !== undefined && typeof data.id !== 'string') delete data.id;
		if (data.v !== undefined && typeof data.v !== 'number') delete data.v;
		return data;
	} catch {
		return null;
	}
}

/**
 * Merge a schedule into an existing metadata object. Unknown keys at both levels
 * are preserved so future fields survive round-trips.
 */
export function mergeSchedule(
	metadata: NoteMetadataData | undefined,
	direction: CardDirection,
	schedule: Schedule,
	blockId: string,
): NoteMetadataData {
	const key = directionToKey(direction);
	const cards = { ...(metadata?.cards ?? {}) };
	cards[key] = scheduleToRecord(schedule, cards[key]);

	return {
		...(metadata ?? {}),
		v: METADATA_VERSION,
		id: blockId,
		cards,
	};
}

export function serializeMetadataLine(metadata: NoteMetadataData): NoteMetadataData {
	const { v: _ignoredVersion, ...rest } = metadata;
	return {
		...rest,
		v: METADATA_VERSION,
		id: metadata.id,
		cards: metadata.cards,
	};
}

export function metadataToLine(metadata: NoteMetadataData): string {
	return `<!-- ${METADATA_MARKER} ${JSON.stringify(serializeMetadataLine(metadata))} -->`;
}

export function scheduleToRecord(
	schedule: Schedule,
	existing?: Record<string, unknown>,
): Record<string, unknown> {
	const record: Record<string, unknown> = { ...(existing ?? {}) };

	record.due = schedule.due;
	record.state = schedule.state;
	record.step = schedule.step;
	record.ivl = schedule.intervalDays;
	record.ease = schedule.ease;
	record.reps = schedule.reps;
	record.lapses = schedule.lapses;
	record.rd = schedule.reviewsToday;

	if (schedule.introduced) record.intro = schedule.introduced;
	else delete record.intro;
	if (schedule.lastReviewed) record.last = schedule.lastReviewed;
	else delete record.last;
	if (schedule.reviewDay) record.rday = schedule.reviewDay;
	else delete record.rday;
	if (schedule.leech) record.leech = true;
	else delete record.leech;
	if (schedule.suspended) record.suspended = true;
	else delete record.suspended;

	return record;
}

export function recordToSchedule(
	record: Record<string, unknown> | undefined,
	fallback: Schedule,
): Schedule {
	if (!record) return { ...fallback };

	const rawState = typeof record.state === 'string' ? record.state : '';
	const state = STATE_VALUES.has(rawState) ? (rawState as Schedule['state']) : fallback.state;
	const due = parseIsoDate(record.due) ?? fallback.due;

	const schedule: Schedule = {
		due,
		state,
		step: asNonNegativeInteger(record.step, fallback.step),
		intervalDays: Math.max(0, asFiniteNumber(record.ivl) ?? fallback.intervalDays),
		ease: Math.max(100, Math.round(asFiniteNumber(record.ease) ?? fallback.ease)),
		reps: asNonNegativeInteger(record.reps, fallback.reps),
		lapses: asNonNegativeInteger(record.lapses, fallback.lapses),
		reviewsToday: asNonNegativeInteger(record.rd, fallback.reviewsToday),
	};

	const introduced = parseIsoDate(record.intro);
	if (introduced) schedule.introduced = introduced;
	const lastReviewed = parseIsoDate(record.last);
	if (lastReviewed) schedule.lastReviewed = lastReviewed;
	if (typeof record.rday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.rday)) {
		schedule.reviewDay = record.rday;
	}
	if (record.leech === true) schedule.leech = true;
	if (record.suspended === true) schedule.suspended = true;

	return schedule;
}
