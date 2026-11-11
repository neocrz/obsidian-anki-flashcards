import { hashString } from '../model/hash';

function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

export interface FuzzRange {
	min: number;
	max: number;
}

/** Anki-style fuzz brackets. Returns null when no fuzz applies. */
export function fuzzRangeFor(interval: number): FuzzRange | null {
	if (!Number.isFinite(interval) || interval < 2) return null;
	if (interval <= 7) {
		return { min: Math.max(2, interval - 1), max: interval + 1 };
	}
	if (interval <= 20) {
		return { min: Math.max(interval - 2, 7), max: interval + 2 };
	}
	const delta = Math.floor(interval * 0.05);
	return { min: interval - delta, max: interval + delta };
}

/**
 * Deterministic fuzz so previews and writes agree.
 * The seed should include card ID, repetition, and raw interval.
 */
export function fuzzInterval(interval: number, seed: string, enabled: boolean): number {
	if (!enabled) return interval;
	const range = fuzzRangeFor(interval);
	if (!range) return interval;

	const random = mulberry32(hashString(seed));
	const span = Math.max(0, range.max - range.min);
	return range.min + Math.floor(random() * (span + 1));
}
