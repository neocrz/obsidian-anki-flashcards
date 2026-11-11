import type { CardDirection, Flashcard, Schedule } from '../types';
import { parseNote } from './parser';
import { mergeSchedule, metadataToLine } from './metadata';

export interface NoteEditTarget {
	filePath: string;
	deckPath: string;
	blockId: string;
	direction: CardDirection;
	order: number;
	front: string;
	back: string;
}

export interface NoteEditResult {
	content: string;
	cardId: string;
	line: string;
}

function splitContent(content: string): { lines: string[]; eol: string } {
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	return { lines: content.split(eol), eol };
}

/**
 * Rewrite the metadata line for one card. Pure: operates on the provided text.
 * Re-parses first so line numbers are always current.
 */
export function updateNoteScheduleContent(
	content: string,
	target: NoteEditTarget,
	schedule: Schedule,
	now: Date = new Date(),
): NoteEditResult {
	const parsed = parseNote(content, {
		filePath: target.filePath,
		deckPath: target.deckPath,
		now,
	});

	const sameDirection = parsed.cards.filter((card) => card.direction === target.direction);
	const found =
		sameDirection.find((card) => card.blockId === target.blockId) ??
		sameDirection.find((card) => card.front === target.front && card.back === target.back);

	if (!found) {
		throw new Error(
			`Could not find the ${target.direction} card for block ${target.blockId} in ${target.filePath}.`,
		);
	}

	const merged = mergeSchedule(found.rawMetadata, found.direction, schedule, found.blockId);
	const line = metadataToLine(merged);
	const { lines, eol } = splitContent(content);

	if (found.metadataLine !== undefined && found.metadataLine < lines.length) {
		lines[found.metadataLine] = line;
	} else {
		const insertAt = Math.min(found.lineEnd + 1, lines.length);
		lines.splice(insertAt, 0, line);
	}

	return {
		content: lines.join(eol),
		cardId: found.id,
		line,
	};
}

export function targetFromCard(card: Flashcard): NoteEditTarget {
	return {
		filePath: card.filePath,
		deckPath: card.deckPath,
		blockId: card.blockId,
		direction: card.direction,
		order: card.order,
		front: card.front,
		back: card.back,
	};
}
