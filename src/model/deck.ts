import type { DeckStats, DeckTreeNode, Flashcard } from '../types';
import { localDateKey } from '../utils/dates';

export interface DeckTreeOptions {
	now: Date;
	newCardsPerDay: number;
	reviewsPerDay: number;
	rootLabel: string;
}

interface MutableNode {
	path: string;
	label: string;
	depth: number;
	children: Map<string, MutableNode>;
	directCards: Flashcard[];
}

function isSuspended(card: Flashcard): boolean {
	return card.schedule.suspended === true;
}

function isDue(card: Flashcard, now: Date): boolean {
	return new Date(card.schedule.due).getTime() <= now.getTime();
}

export function calculateDeckStats(
	cards: readonly Flashcard[],
	options: DeckTreeOptions,
): DeckStats {
	const today = localDateKey(options.now);
	const active = cards.filter((card) => !isSuspended(card));

	const newCards = active.filter((card) => card.schedule.state === 'new');
	const introducedToday = active.filter(
		(card) =>
			card.schedule.introduced !== undefined &&
			localDateKey(new Date(card.schedule.introduced)) === today,
	).length;
	const newAvailable = Math.max(
		0,
		Math.min(newCards.length, options.newCardsPerDay - introducedToday),
	);

	const learning = active.filter(
		(card) =>
			(card.schedule.state === 'learning' || card.schedule.state === 'relearning') &&
			isDue(card, options.now),
	).length;

	const reviewDue = active.filter(
		(card) => card.schedule.state === 'review' && isDue(card, options.now),
	).length;
	const reviewsToday = active.reduce(
		(sum, card) => (card.schedule.reviewDay === today ? sum + card.schedule.reviewsToday : sum),
		0,
	);
	const reviewAvailable = Math.max(0, Math.min(reviewDue, options.reviewsPerDay - reviewsToday));

	return {
		new: newAvailable,
		learning,
		review: reviewAvailable,
		total: newAvailable + learning + reviewAvailable,
	};
}

function ensureNode(nodes: Map<string, MutableNode>, path: string, rootLabel: string): MutableNode {
	const existing = nodes.get(path);
	if (existing) return existing;

	const segments = path.split('/').filter(Boolean);
	const label = segments.length === 0 ? rootLabel : (segments[segments.length - 1] ?? rootLabel);
	const node: MutableNode = {
		path,
		label,
		depth: segments.length,
		children: new Map(),
		directCards: [],
	};
	nodes.set(path, node);

	if (segments.length > 0) {
		const parentPath = segments.slice(0, -1).join('/');
		const parent = ensureNode(nodes, parentPath, rootLabel);
		parent.children.set(path, node);
	}

	return node;
}

/**
 * Build a deck tree. Parent nodes include their children's cards in `allCards`
 * and in their counts, matching Anki's parent-deck behavior.
 */
export function buildDeckTree(cards: readonly Flashcard[], options: DeckTreeOptions): DeckTreeNode {
	const nodes = new Map<string, MutableNode>();
	ensureNode(nodes, '', options.rootLabel);

	for (const card of cards) {
		const node = ensureNode(nodes, card.deckPath.toLowerCase(), options.rootLabel);
		node.directCards.push(card);
	}

	const finalize = (node: MutableNode): DeckTreeNode => {
		const children = [...node.children.values()]
			.sort((left, right) => left.label.localeCompare(right.label))
			.map(finalize);
		const allCards = [...node.directCards, ...children.flatMap((child) => child.allCards)];
		return {
			path: node.path,
			label: node.label,
			depth: node.depth,
			children,
			directCards: [...node.directCards],
			allCards,
			stats: calculateDeckStats(allCards, options),
		};
	};

	return finalize(nodes.get('') as MutableNode);
}

/** Cards in a deck and all its descendants. `path === ''` means every deck. */
export function cardsForDeck(cards: readonly Flashcard[], deckPath: string): Flashcard[] {
	const path = deckPath.toLowerCase();
	if (!path) return [...cards];
	return cards.filter((card) => card.deckPath === path || card.deckPath.startsWith(`${path}/`));
}

export function flattenDeckTree(root: DeckTreeNode): DeckTreeNode[] {
	const result: DeckTreeNode[] = [];
	const walk = (node: DeckTreeNode) => {
		result.push(node);
		for (const child of node.children) walk(child);
	};
	walk(root);
	return result;
}
