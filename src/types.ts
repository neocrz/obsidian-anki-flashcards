/** Shared domain types. This module must stay free of Obsidian imports. */

export type Rating = 1 | 2 | 3 | 4;

export const RATINGS: readonly Rating[] = [1, 2, 3, 4];

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export type CardDirection = 'forward' | 'reverse';

export type CardKind = 'inline' | 'multiline';

/** Direction key used inside the hidden metadata JSON. */
export type MetadataDirection = 'fwd' | 'rev';

export interface Schedule {
	/** ISO timestamp. New cards use the parse time; state decides availability. */
	due: string;
	state: CardState;
	/** Index into the current learning/relearning steps. */
	step: number;
	/** Review interval in days. Kept at the pre-lapse value while relearning. */
	intervalDays: number;
	/** Ease in permille (2500 = 250%). */
	ease: number;
	reps: number;
	lapses: number;
	/** ISO timestamp of the first answer. */
	introduced?: string;
	/** ISO timestamp of the most recent answer. */
	lastReviewed?: string;
	/** Review-state answers on `reviewDay`. */
	reviewsToday: number;
	/** Local YYYY-MM-DD for `reviewsToday`. */
	reviewDay?: string;
	leech?: boolean;
	suspended?: boolean;
}

/** Raw metadata object. Unknown keys are preserved on write. */
export interface NoteMetadataData {
	v?: number;
	id?: string;
	cards?: Partial<Record<MetadataDirection, Record<string, unknown>>>;
	[key: string]: unknown;
}

export interface Flashcard {
	id: string;
	blockId: string;
	filePath: string;
	/** Lowercase deck key. '' is the root deck. */
	deckPath: string;
	direction: CardDirection;
	kind: CardKind;
	twoWay: boolean;
	front: string;
	back: string;
	schedule: Schedule;
	/** Card order within the note, including direction cards. */
	order: number;
	lineStart: number;
	lineEnd: number;
	metadataLine?: number;
	rawMetadata?: NoteMetadataData;
}

export interface ParsedNote {
	cards: Flashcard[];
	warnings: string[];
}

export interface DeckStats {
	new: number;
	learning: number;
	review: number;
	total: number;
}

export interface DeckTreeNode {
	/** Lowercase deck key. */
	path: string;
	label: string;
	depth: number;
	children: DeckTreeNode[];
	directCards: Flashcard[];
	allCards: Flashcard[];
	stats: DeckStats;
}

export interface Step {
	minutes: number;
	label: string;
}

export interface SchedulerConfig {
	learningSteps: Step[];
	relearningSteps: Step[];
	graduatingInterval: number;
	easyInterval: number;
	/** Permille. */
	startingEase: number;
	/** Permille. */
	minimumEase: number;
	hardIntervalFactor: number;
	easyBonus: number;
	intervalModifier: number;
	lapseMultiplier: number;
	maximumInterval: number;
	leechThreshold: number;
	leechAction: 'tag' | 'suspend';
	fuzz: boolean;
}
