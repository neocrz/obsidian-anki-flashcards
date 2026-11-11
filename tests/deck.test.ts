import { describe, expect, it } from 'vitest';
import {
	buildDeckTree,
	calculateDeckStats,
	cardsForDeck,
	flattenDeckTree,
} from '../src/model/deck';
import { defaultSchedule } from '../src/model/metadata';
import { StudySession } from '../src/scheduling/queue';
import type { Flashcard, Schedule } from '../src/types';
import { localDateKey } from '../src/utils/dates';

const NOW = new Date('2026-01-01T09:00:00.000Z');
const MINUTE = 60_000;
const DAY = 86_400_000;

function card(id: string, deckPath: string, overrides: Partial<Schedule> = {}): Flashcard {
	return {
		id,
		blockId: id,
		filePath: 'Note.md',
		deckPath,
		direction: 'forward',
		kind: 'inline',
		twoWay: false,
		front: 'Front',
		back: 'Back',
		schedule: { ...defaultSchedule(NOW), ...overrides },
		order: 0,
		lineStart: 0,
		lineEnd: 0,
	};
}

function options(overrides: Partial<Parameters<typeof calculateDeckStats>[1]> = {}) {
	return {
		now: NOW,
		newCardsPerDay: 20,
		reviewsPerDay: 200,
		rootLabel: 'fc',
		...overrides,
	};
}

describe('deck tree', () => {
	it('builds nested decks and aggregates counts', () => {
		const cards = [
			card('a', 'japanese/hiragana'),
			card('b', 'japanese/kanji'),
			card('c', 'spanish'),
		];
		const root = buildDeckTree(cards, options());
		const flat = flattenDeckTree(root);

		expect(root.stats.new).toBe(3);
		expect(root.allCards).toHaveLength(3);
		expect(flat.map((node) => node.path)).toEqual([
			'',
			'japanese',
			'japanese/hiragana',
			'japanese/kanji',
			'spanish',
		]);

		const japanese = flat.find((node) => node.path === 'japanese');
		expect(japanese?.allCards).toHaveLength(2);
		expect(japanese?.stats.new).toBe(2);
		expect(japanese?.children.map((node) => node.label)).toEqual(['hiragana', 'kanji']);
	});

	it('filters cards by deck subtree', () => {
		const cards = [card('a', 'japanese/hiragana'), card('b', 'spanish')];
		expect(cardsForDeck(cards, 'japanese')).toHaveLength(1);
		expect(cardsForDeck(cards, '')).toHaveLength(2);
	});

	it('applies the daily new limit', () => {
		const cards = [
			card('new1', 'fc'),
			card('new2', 'fc'),
			card('introduced', 'fc', {
				state: 'review',
				introduced: NOW.toISOString(),
				intervalDays: 3,
				due: new Date(NOW.getTime() + 3 * DAY).toISOString(),
			}),
		];
		const stats = calculateDeckStats(cards, options({ newCardsPerDay: 2 }));
		expect(stats.new).toBe(1);
	});

	it('applies the daily review limit', () => {
		const cards = [
			card('due1', 'fc', { state: 'review', due: NOW.toISOString() }),
			card('due2', 'fc', { state: 'review', due: NOW.toISOString() }),
			card('reviewed', 'fc', {
				state: 'review',
				due: new Date(NOW.getTime() + DAY).toISOString(),
				reviewsToday: 1,
				reviewDay: localDateKey(NOW),
			}),
		];
		const stats = calculateDeckStats(cards, options({ reviewsPerDay: 2 }));
		expect(stats.review).toBe(1);
	});

	it('counts due learning cards and ignores suspended cards', () => {
		const cards = [
			card('learning', 'fc', { state: 'learning', due: NOW.toISOString() }),
			card('future', 'fc', {
				state: 'learning',
				due: new Date(NOW.getTime() + 10 * MINUTE).toISOString(),
			}),
			card('suspended', 'fc', { suspended: true }),
		];
		const stats = calculateDeckStats(cards, options());
		expect(stats.learning).toBe(1);
		expect(stats.new).toBe(0);
	});
});

describe('study session', () => {
	const cards = [
		card('learning', 'fc', {
			state: 'learning',
			due: new Date(NOW.getTime() - MINUTE).toISOString(),
		}),
		card('review', 'fc', {
			state: 'review',
			due: new Date(NOW.getTime() - MINUTE).toISOString(),
			intervalDays: 10,
		}),
		card('new1', 'fc'),
		card('new2', 'fc'),
		card('futureLearning', 'fc', {
			state: 'learning',
			due: new Date(NOW.getTime() + 5 * MINUTE).toISOString(),
		}),
		card('futureReview', 'fc', {
			state: 'review',
			due: new Date(NOW.getTime() + DAY).toISOString(),
		}),
		card('suspended', 'fc', { suspended: true }),
	];
	const map = new Map(cards.map((entry) => [entry.id, entry]));
	const getCard = (id: string) => map.get(id);

	it('orders learning, then review, then new cards', () => {
		const session = new StudySession(cards, {
			now: NOW,
			newCardsPerDay: 1,
			reviewsPerDay: 1,
		});
		expect(session.pending.size).toBe(4);
		expect(session.pick(NOW, getCard).card?.id).toBe('learning');

		session.onAnswered(
			card('learning', 'fc', {
				state: 'review',
				due: new Date(NOW.getTime() + DAY).toISOString(),
			}),
			NOW,
		);
		expect(session.pick(NOW, getCard).card?.id).toBe('review');
	});

	it('returns the next due time when nothing is available', () => {
		const session = new StudySession([cards[4] as Flashcard], {
			now: NOW,
			newCardsPerDay: 0,
			reviewsPerDay: 0,
		});
		const pick = session.pick(NOW, getCard);
		expect(pick.card).toBeUndefined();
		expect(pick.nextDue?.getTime()).toBe(NOW.getTime() + 5 * MINUTE);
	});

	it('respects a zero new-card limit', () => {
		const fresh = [card('new1', 'fc')];
		const session = new StudySession(fresh, {
			now: NOW,
			newCardsPerDay: 0,
			reviewsPerDay: 0,
		});
		expect(session.pending.size).toBe(0);
	});

	it('removes graduated reviews but keeps waiting learning cards', () => {
		const waiting = card('waiting', 'fc', {
			state: 'learning',
			due: new Date(NOW.getTime() + 5 * MINUTE).toISOString(),
		});
		const graduated = card('graduated', 'fc', {
			state: 'review',
			due: new Date(NOW.getTime() + DAY).toISOString(),
		});
		const session = new StudySession([waiting, graduated], {
			now: NOW,
			newCardsPerDay: 0,
			reviewsPerDay: 0,
		});
		session.onAnswered(graduated, NOW);
		session.onAnswered(waiting, NOW);
		expect(session.remaining()).toBe(1);
	});

	it('drops suspended cards from the pending set', () => {
		const suspended = card('sus', 'fc', { state: 'learning', suspended: true });
		const session = new StudySession([suspended], {
			now: NOW,
			newCardsPerDay: 0,
			reviewsPerDay: 0,
		});
		expect(session.pending.size).toBe(0);
	});
});
