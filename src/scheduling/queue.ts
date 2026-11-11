import type { Flashcard } from '../types';
import { localDateKey } from '../utils/dates';

export interface StudySessionOptions {
	now: Date;
	newCardsPerDay: number;
	reviewsPerDay: number;
}

export interface StudyPick {
	card?: Flashcard;
	nextDue?: Date;
	remaining: number;
}

function dueTime(card: Flashcard): number {
	return new Date(card.schedule.due).getTime();
}

function compareCards(left: Flashcard, right: Flashcard): number {
	const dueDifference = dueTime(left) - dueTime(right);
	if (dueDifference !== 0) return dueDifference;
	if (left.filePath !== right.filePath) return left.filePath.localeCompare(right.filePath);
	return left.order - right.order;
}

function compareNewCards(left: Flashcard, right: Flashcard): number {
	if (left.filePath !== right.filePath) return left.filePath.localeCompare(right.filePath);
	return left.order - right.order;
}

/**
 * One study session for a deck subtree. The session stores only card IDs; card
 * state is read from the store after every answer.
 */
export class StudySession {
	readonly pending: Set<string> = new Set();
	readonly newLimit: number;
	readonly reviewLimit: number;

	constructor(cards: readonly Flashcard[], options: StudySessionOptions) {
		const today = localDateKey(options.now);
		const active = cards.filter((card) => !card.schedule.suspended);

		const introducedToday = active.filter(
			(card) =>
				card.schedule.introduced !== undefined &&
				localDateKey(new Date(card.schedule.introduced)) === today,
		).length;
		this.newLimit = Math.max(0, options.newCardsPerDay - introducedToday);

		const reviewsToday = active.reduce(
			(sum, card) =>
				card.schedule.reviewDay === today ? sum + card.schedule.reviewsToday : sum,
			0,
		);
		this.reviewLimit = Math.max(0, options.reviewsPerDay - reviewsToday);

		const learning = active.filter(
			(card) => card.schedule.state === 'learning' || card.schedule.state === 'relearning',
		);
		const reviewDue = active
			.filter(
				(card) =>
					card.schedule.state === 'review' && dueTime(card) <= options.now.getTime(),
			)
			.sort(compareCards)
			.slice(0, this.reviewLimit);
		const newCards = active
			.filter((card) => card.schedule.state === 'new')
			.sort(compareNewCards)
			.slice(0, this.newLimit);

		for (const card of [...learning, ...reviewDue, ...newCards]) {
			this.pending.add(card.id);
		}
	}

	pick(now: Date, getCard: (id: string) => Flashcard | undefined): StudyPick {
		const cards: Flashcard[] = [];
		for (const id of this.pending) {
			const card = getCard(id);
			if (!card || card.schedule.suspended) {
				this.pending.delete(id);
				continue;
			}
			cards.push(card);
		}

		const nowTime = now.getTime();
		const dueLearning = cards
			.filter(
				(card) =>
					(card.schedule.state === 'learning' || card.schedule.state === 'relearning') &&
					dueTime(card) <= nowTime,
			)
			.sort(compareCards);
		if (dueLearning[0]) {
			return { card: dueLearning[0], remaining: this.pending.size };
		}

		const dueReview = cards
			.filter((card) => card.schedule.state === 'review' && dueTime(card) <= nowTime)
			.sort(compareCards);
		if (dueReview[0]) {
			return { card: dueReview[0], remaining: this.pending.size };
		}

		const fresh = cards.filter((card) => card.schedule.state === 'new').sort(compareNewCards);
		if (fresh[0]) {
			return { card: fresh[0], remaining: this.pending.size };
		}

		const future = cards.filter((card) => dueTime(card) > nowTime).sort(compareCards);
		const nextDue = future[0] ? new Date(future[0].schedule.due) : undefined;

		return { nextDue, remaining: this.pending.size };
	}

	/** Remove cards that left the session (graduated to a future day). */
	onAnswered(card: Flashcard, now: Date): void {
		if (card.schedule.suspended) {
			this.pending.delete(card.id);
			return;
		}
		if (card.schedule.state === 'review' && dueTime(card) > now.getTime()) {
			this.pending.delete(card.id);
		}
	}

	remaining(): number {
		return this.pending.size;
	}
}
