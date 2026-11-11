import type {
	CardDirection,
	CardKind,
	Flashcard,
	NoteMetadataData,
	ParsedNote,
	Schedule,
} from '../types';
import {
	defaultSchedule,
	directionToKey,
	isMetadataLineLike,
	parseMetadataLine,
	recordToSchedule,
} from './metadata';
import { createBlockId } from './hash';

export interface ParseNoteOptions {
	filePath: string;
	deckPath: string;
	now?: Date;
}

interface LineInfo {
	index: number;
	text: string;
}

interface SeparatorInfo {
	index: number;
	twoWay: boolean;
}

interface Fence {
	char: string;
	length: number;
}

interface ParseState {
	options: ParseNoteOptions;
	now: Date;
	metadataByLine: Map<number, NoteMetadataData>;
	warnings: string[];
	occurrences: Map<string, number>;
	order: number;
	cards: Flashcard[];
}

export interface InlineSeparator {
	index: number;
	length: number;
	twoWay: boolean;
}

/**
 * Find the first unescaped card separator outside inline code.
 * `;::` wins over `;:` at the same position.
 */
export function findInlineSeparator(line: string): InlineSeparator | null {
	let inInlineCode = false;

	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];

		if (char === '\\') {
			index += 1;
			continue;
		}
		if (char === '`') {
			inInlineCode = !inInlineCode;
			continue;
		}
		if (inInlineCode) continue;

		if (char === ';' && line[index + 1] === ':') {
			if (line[index + 2] === ':') {
				return { index, length: 3, twoWay: true };
			}
			return { index, length: 2, twoWay: false };
		}
	}

	return null;
}

function fenceAt(line: string): Fence | null {
	const match = /^\s*(`{3,}|~{3,})/.exec(line);
	const marker = match?.[1];
	if (!marker) return null;
	return { char: marker[0] ?? '`', length: marker.length };
}

function isFenceClose(line: string, fence: Fence): boolean {
	const marker = fenceAt(line);
	return marker?.char === fence.char && marker.length >= fence.length;
}

function isHtmlComment(line: string): boolean {
	return /^\s*<!--/.test(line);
}

function collectMetadata(lines: readonly string[], state: ParseState): void {
	let fence: Fence | null = null;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';

		if (fence) {
			if (isFenceClose(line, fence)) fence = null;
			continue;
		}
		const marker = fenceAt(line);
		if (marker) {
			fence = marker;
			continue;
		}
		if (!line.includes('<!--')) continue;

		const metadata = parseMetadataLine(line);
		if (metadata) {
			state.metadataByLine.set(index, metadata);
			continue;
		}
		if (isMetadataLineLike(line)) {
			state.warnings.push(`Ignored malformed review data on line ${index + 1}.`);
		}
	}
}

function nextOccurrence(state: ParseState, signature: string): number {
	const occurrence = state.occurrences.get(signature) ?? 0;
	state.occurrences.set(signature, occurrence + 1);
	return occurrence;
}

function scheduleFor(
	metadata: NoteMetadataData | undefined,
	direction: CardDirection,
	now: Date,
): Schedule {
	const key = directionToKey(direction);
	const record = metadata?.cards?.[key];
	return recordToSchedule(record, defaultSchedule(now));
}

function pushCard(
	state: ParseState,
	input: {
		blockId: string;
		direction: CardDirection;
		kind: CardKind;
		twoWay: boolean;
		front: string;
		back: string;
		lineStart: number;
		lineEnd: number;
		metadataLine?: number;
		metadata?: NoteMetadataData;
	},
): void {
	const cardId = `${state.options.filePath}::${input.blockId}::${input.direction}`;
	const card: Flashcard = {
		id: cardId,
		blockId: input.blockId,
		filePath: state.options.filePath,
		deckPath: state.options.deckPath.toLowerCase(),
		direction: input.direction,
		kind: input.kind,
		twoWay: input.twoWay,
		front: input.front,
		back: input.back,
		schedule: scheduleFor(input.metadata, input.direction, state.now),
		order: state.order,
		lineStart: input.lineStart,
		lineEnd: input.lineEnd,
	};

	if (input.metadataLine !== undefined) card.metadataLine = input.metadataLine;
	if (input.metadata) card.rawMetadata = input.metadata;

	state.cards.push(card);
	state.order += 1;
}

function createCardsForBlock(
	state: ParseState,
	input: {
		blockId: string;
		front: string;
		back: string;
		twoWay: boolean;
		kind: CardKind;
		lineStart: number;
		lineEnd: number;
		metadataLine?: number;
		metadata?: NoteMetadataData;
	},
): void {
	const base = {
		blockId: input.blockId,
		kind: input.kind,
		twoWay: input.twoWay,
		front: input.front,
		back: input.back,
		lineStart: input.lineStart,
		lineEnd: input.lineEnd,
		metadataLine: input.metadataLine,
		metadata: input.metadata,
	};

	pushCard(state, { ...base, direction: 'forward' });
	if (input.twoWay) {
		pushCard(state, { ...base, direction: 'reverse', front: input.back, back: input.front });
	}
}

function parseMultilineBlock(
	state: ParseState,
	block: readonly LineInfo[],
	separator: SeparatorInfo,
): void {
	const front = block
		.slice(0, separator.index)
		.map((line) => line.text)
		.join('\n')
		.trim();
	const back = block
		.slice(separator.index + 1)
		.map((line) => line.text)
		.join('\n')
		.trim();

	if (!front || !back) {
		state.warnings.push(
			`Ignored multi-line card near line ${(block[0]?.index ?? 0) + 1}: front or back is empty.`,
		);
		return;
	}

	const lineEnd = block[block.length - 1]?.index ?? block[0]?.index ?? 0;
	const metadataLine = state.metadataByLine.has(lineEnd + 1) ? lineEnd + 1 : undefined;
	const metadata =
		metadataLine !== undefined ? state.metadataByLine.get(metadataLine) : undefined;

	const signature = ['multiline', separator.twoWay, front, back].join('\u0000');
	const occurrence = nextOccurrence(state, signature);
	const blockId = metadata?.id ?? createBlockId(signature, occurrence);
	const lineStart = block[0]?.index ?? 0;

	createCardsForBlock(state, {
		blockId,
		front,
		back,
		twoWay: separator.twoWay,
		kind: 'multiline',
		lineStart,
		lineEnd,
		metadataLine,
		metadata,
	});
}

function parseInlineLine(state: ParseState, line: LineInfo): void {
	const separator = findInlineSeparator(line.text);
	if (!separator) return;

	const front = line.text.slice(0, separator.index).trim();
	const back = line.text.slice(separator.index + separator.length).trim();
	if (!front || !back) return;

	const metadataLine = state.metadataByLine.has(line.index + 1) ? line.index + 1 : undefined;
	const metadata =
		metadataLine !== undefined ? state.metadataByLine.get(metadataLine) : undefined;
	const signature = ['inline', separator.twoWay, front, back].join('\u0000');
	const occurrence = nextOccurrence(state, signature);
	const blockId = metadata?.id ?? createBlockId(signature, occurrence);

	createCardsForBlock(state, {
		blockId,
		front,
		back,
		twoWay: separator.twoWay,
		kind: 'inline',
		lineStart: line.index,
		lineEnd: line.index,
		metadataLine,
		metadata,
	});
}

function parseBlock(state: ParseState, block: readonly LineInfo[]): void {
	if (block.length === 0) return;

	const separatorIndexes: number[] = [];
	for (let index = 0; index < block.length; index += 1) {
		const text = block[index]?.text.trim();
		if (text === ':;' || text === ':;:') separatorIndexes.push(index);
	}

	if (separatorIndexes.length === 1) {
		const separatorIndex = separatorIndexes[0] ?? 0;
		const text = block[separatorIndex]?.text.trim();
		parseMultilineBlock(state, block, {
			index: separatorIndex,
			twoWay: text === ':;:',
		});
		return;
	}

	if (separatorIndexes.length > 1) {
		state.warnings.push(
			`Ignored block near line ${(block[0]?.index ?? 0) + 1}: multiple multi-line separators.`,
		);
		return;
	}

	for (const line of block) parseInlineLine(state, line);
}

/**
 * Parse a note into cards. Pure: no Obsidian APIs, no DOM, no global clock
 * (pass `now` for reproducibility).
 */
export function parseNote(content: string, options: ParseNoteOptions): ParsedNote {
	const lines = content.split(/\r?\n/);
	const state: ParseState = {
		options,
		now: options.now ?? new Date(),
		metadataByLine: new Map(),
		warnings: [],
		occurrences: new Map(),
		order: 0,
		cards: [],
	};

	collectMetadata(lines, state);

	let block: LineInfo[] = [];
	let fence: Fence | null = null;

	const flush = () => {
		if (block.length > 0) parseBlock(state, block);
		block = [];
	};

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';

		if (fence) {
			if (isFenceClose(line, fence)) fence = null;
			flush();
			continue;
		}

		const marker = fenceAt(line);
		if (marker) {
			flush();
			fence = marker;
			continue;
		}

		if (state.metadataByLine.has(index)) {
			flush();
			continue;
		}

		if (line.trim() === '') {
			flush();
			continue;
		}

		if (isHtmlComment(line)) {
			flush();
			continue;
		}

		block.push({ index, text: line });
	}

	flush();

	return { cards: state.cards, warnings: state.warnings };
}
