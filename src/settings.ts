import type { SchedulerConfig, Step } from './types';
import { parseSteps } from './scheduling/steps';

export interface FlashcardSettings {
	/** Base tag without '#'. */
	baseTag: string;
	/** Whitespace-separated step list, e.g. "1m 10m". */
	learningSteps: string;
	relearningSteps: string;
	graduatingInterval: number;
	easyInterval: number;
	/** Percent, e.g. 250. */
	startingEase: number;
	/** Percent, e.g. 130. */
	minimumEase: number;
	hardIntervalFactor: number;
	easyBonus: number;
	intervalModifier: number;
	lapseMultiplier: number;
	maximumInterval: number;
	leechThreshold: number;
	leechAction: 'tag' | 'suspend';
	fuzz: boolean;
	newCardsPerDay: number;
	reviewsPerDay: number;
	/** Collapse the plugin's hidden review-data lines to a small badge in Live Preview. */
	compactReviewData: boolean;
}

export const DEFAULT_SETTINGS: FlashcardSettings = {
	baseTag: 'fc',
	learningSteps: '1m 10m',
	relearningSteps: '10m',
	graduatingInterval: 1,
	easyInterval: 4,
	startingEase: 250,
	minimumEase: 130,
	hardIntervalFactor: 1.2,
	easyBonus: 1.3,
	intervalModifier: 1,
	lapseMultiplier: 0,
	maximumInterval: 36500,
	leechThreshold: 8,
	leechAction: 'tag',
	fuzz: true,
	newCardsPerDay: 20,
	reviewsPerDay: 200,
	compactReviewData: true,
};

export function normalizeBaseTag(value: string): string {
	return value.trim().replace(/^#+/, '').replace(/\/+$/, '').toLowerCase();
}

function finiteNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamped(value: unknown, fallback: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

/** Merge persisted data with defaults and coerce obvious invalid values. */
export function normalizeSettings(raw: unknown): FlashcardSettings {
	const data = raw && typeof raw === 'object' ? (raw as Partial<FlashcardSettings>) : {};
	const baseTag = normalizeBaseTag(
		typeof data.baseTag === 'string' ? data.baseTag : DEFAULT_SETTINGS.baseTag,
	);

	return {
		baseTag: baseTag || DEFAULT_SETTINGS.baseTag,
		learningSteps:
			typeof data.learningSteps === 'string' && parseSteps(data.learningSteps).length > 0
				? data.learningSteps
				: DEFAULT_SETTINGS.learningSteps,
		relearningSteps:
			typeof data.relearningSteps === 'string' && parseSteps(data.relearningSteps).length > 0
				? data.relearningSteps
				: DEFAULT_SETTINGS.relearningSteps,
		graduatingInterval: clamped(
			data.graduatingInterval,
			DEFAULT_SETTINGS.graduatingInterval,
			1,
			36500,
		),
		easyInterval: clamped(data.easyInterval, DEFAULT_SETTINGS.easyInterval, 1, 36500),
		startingEase: clamped(data.startingEase, DEFAULT_SETTINGS.startingEase, 100, 1000),
		minimumEase: clamped(data.minimumEase, DEFAULT_SETTINGS.minimumEase, 100, 1000),
		hardIntervalFactor: clamped(
			data.hardIntervalFactor,
			DEFAULT_SETTINGS.hardIntervalFactor,
			1,
			10,
		),
		easyBonus: clamped(data.easyBonus, DEFAULT_SETTINGS.easyBonus, 1, 10),
		intervalModifier: clamped(
			data.intervalModifier,
			DEFAULT_SETTINGS.intervalModifier,
			0.1,
			10,
		),
		lapseMultiplier: clamped(data.lapseMultiplier, DEFAULT_SETTINGS.lapseMultiplier, 0, 10),
		maximumInterval: clamped(data.maximumInterval, DEFAULT_SETTINGS.maximumInterval, 1, 365000),
		leechThreshold: Math.round(
			clamped(data.leechThreshold, DEFAULT_SETTINGS.leechThreshold, 1, 100),
		),
		leechAction: data.leechAction === 'suspend' ? 'suspend' : 'tag',
		fuzz: typeof data.fuzz === 'boolean' ? data.fuzz : DEFAULT_SETTINGS.fuzz,
		newCardsPerDay: Math.round(
			clamped(data.newCardsPerDay, DEFAULT_SETTINGS.newCardsPerDay, 0, 10000),
		),
		reviewsPerDay: Math.round(
			clamped(data.reviewsPerDay, DEFAULT_SETTINGS.reviewsPerDay, 0, 100000),
		),
		compactReviewData:
			typeof data.compactReviewData === 'boolean'
				? data.compactReviewData
				: DEFAULT_SETTINGS.compactReviewData,
	};
}

function nonEmptySteps(value: string, fallback: string): Step[] {
	const parsed = parseSteps(value);
	if (parsed.length > 0) return parsed;
	return parseSteps(fallback);
}

export function toSchedulerConfig(settings: FlashcardSettings): SchedulerConfig {
	return {
		learningSteps: nonEmptySteps(settings.learningSteps, DEFAULT_SETTINGS.learningSteps),
		relearningSteps: nonEmptySteps(settings.relearningSteps, DEFAULT_SETTINGS.relearningSteps),
		graduatingInterval: settings.graduatingInterval,
		easyInterval: settings.easyInterval,
		startingEase: Math.round(settings.startingEase * 10),
		minimumEase: Math.round(settings.minimumEase * 10),
		hardIntervalFactor: settings.hardIntervalFactor,
		easyBonus: settings.easyBonus,
		intervalModifier: settings.intervalModifier,
		lapseMultiplier: settings.lapseMultiplier,
		maximumInterval: settings.maximumInterval,
		leechThreshold: settings.leechThreshold,
		leechAction: settings.leechAction,
		fuzz: settings.fuzz,
	};
}
