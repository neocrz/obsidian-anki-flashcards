import { describe, expect, it } from 'vitest';
import { defaultSchedule } from '../src/model/metadata';
import { parseNote } from '../src/model/parser';
import { targetFromCard, updateNoteScheduleContent } from '../src/model/note-edit';
import type { Schedule } from '../src/types';

const NOW = new Date('2026-01-01T09:00:00.000Z');

function learningSchedule(): Schedule {
	return {
		...defaultSchedule(NOW),
		state: 'learning',
		step: 1,
		due: '2026-01-01T09:10:00.000Z',
		reps: 2,
		introduced: NOW.toISOString(),
		lastReviewed: NOW.toISOString(),
	};
}

function reviewSchedule(): Schedule {
	return {
		...defaultSchedule(NOW),
		state: 'review',
		intervalDays: 10,
		ease: 2500,
		due: '2026-01-11T09:00:00.000Z',
		reps: 4,
		lapses: 1,
		introduced: '2025-12-01T09:00:00.000Z',
		lastReviewed: NOW.toISOString(),
		reviewsToday: 1,
		reviewDay: '2026-01-01',
	};
}

function parseCard(content: string, direction: 'forward' | 'reverse' = 'forward') {
	const parsed = parseNote(content, { filePath: 'Note.md', deckPath: 'test', now: NOW });
	return parsed.cards.find((card) => card.direction === direction);
}

describe('note edits', () => {
	it('inserts a metadata line below an inline card', () => {
		const content = '#fc/test\n\nFront;:Back\n\nOther text\n';
		const card = parseNote(content, {
			filePath: 'Note.md',
			deckPath: 'test',
			now: NOW,
		}).cards[0];
		expect(card).toBeDefined();
		if (!card) return;

		const result = updateNoteScheduleContent(
			content,
			targetFromCard(card),
			learningSchedule(),
			NOW,
		);
		const lines = result.content.split('\n');
		expect(lines[2]).toBe('Front;:Back');
		expect(lines[3]).toContain('<!-- fc-srs ');
		expect(lines[4]).toBe('');

		const updated = parseCard(result.content);
		expect(updated?.schedule.state).toBe('learning');
		expect(updated?.schedule.step).toBe(1);
		expect(updated?.metadataLine).toBe(3);
	});

	it('inserts below a multi-line card back', () => {
		const content = 'Front\n:;\nBack 1\nBack 2\n';
		const card = parseNote(content, {
			filePath: 'Note.md',
			deckPath: 'test',
			now: NOW,
		}).cards[0];
		if (!card) throw new Error('missing card');

		const result = updateNoteScheduleContent(
			content,
			targetFromCard(card),
			learningSchedule(),
			NOW,
		);
		const lines = result.content.split('\n');
		expect(lines[3]).toBe('Back 2');
		expect(lines[4]).toContain('<!-- fc-srs ');
	});

	it('replaces an existing line instead of duplicating it', () => {
		const content = 'Front;:Back\n';
		const firstCard = parseNote(content, {
			filePath: 'Note.md',
			deckPath: 'test',
			now: NOW,
		}).cards[0];
		if (!firstCard) throw new Error('missing card');

		const first = updateNoteScheduleContent(
			content,
			targetFromCard(firstCard),
			learningSchedule(),
			NOW,
		);
		const secondCard = parseCard(first.content);
		if (!secondCard) throw new Error('missing updated card');

		const second = updateNoteScheduleContent(
			first.content,
			targetFromCard(secondCard),
			reviewSchedule(),
			NOW,
		);
		expect(second.content.match(/<!-- fc-srs/g)).toHaveLength(1);
		expect(parseCard(second.content)?.schedule.state).toBe('review');
	});

	it('preserves the other direction and unknown fields', () => {
		const content = [
			'Front;::Back',
			'<!-- fc-srs {"v":1,"id":"tw","custom":"keep","cards":{"rev":{"state":"review","due":"2026-01-11T09:00:00.000Z","step":0,"ivl":5,"ease":2500,"reps":3,"lapses":0,"rd":0,"future":1}}} -->',
			'',
		].join('\n');
		const card = parseNote(content, {
			filePath: 'Note.md',
			deckPath: 'test',
			now: NOW,
		}).cards.find((entry) => entry.direction === 'forward');
		if (!card) throw new Error('missing card');

		const result = updateNoteScheduleContent(
			content,
			targetFromCard(card),
			learningSchedule(),
			NOW,
		);
		const updated = parseNote(result.content, {
			filePath: 'Note.md',
			deckPath: 'test',
			now: NOW,
		});
		const forward = updated.cards.find((entry) => entry.direction === 'forward');
		const reverse = updated.cards.find((entry) => entry.direction === 'reverse');

		expect(forward?.schedule.state).toBe('learning');
		expect(reverse?.schedule.state).toBe('review');
		expect(reverse?.schedule.intervalDays).toBe(5);
		expect(result.content).toContain('"custom":"keep"');
		expect(result.content).toContain('"future":1');
	});

	it('preserves CRLF line endings', () => {
		const content = 'Front;:Back\r\n\r\nText\r\n';
		const card = parseNote(content, {
			filePath: 'Note.md',
			deckPath: 'test',
			now: NOW,
		}).cards[0];
		if (!card) throw new Error('missing card');

		const result = updateNoteScheduleContent(
			content,
			targetFromCard(card),
			learningSchedule(),
			NOW,
		);
		expect(result.content).toContain('\r\n');
		expect(result.content.split('\r\n')[1]).toContain('<!-- fc-srs ');
		expect(result.content.replace(/\r\n/g, '')).not.toContain('\n');
	});

	it('still finds a card after its content is edited (persisted ID)', () => {
		const content = [
			'Old front;:Back',
			'<!-- fc-srs {"v":1,"id":"stable","cards":{}} -->',
		].join('\n');
		const card = parseNote(content, {
			filePath: 'Note.md',
			deckPath: 'test',
			now: NOW,
		}).cards[0];
		if (!card) throw new Error('missing card');

		const edited = content.replace('Old front', 'New front');
		const result = updateNoteScheduleContent(
			edited,
			targetFromCard(card),
			learningSchedule(),
			NOW,
		);
		expect(result.content).toContain('"id":"stable"');
		expect(parseCard(result.content)?.schedule.state).toBe('learning');
	});

	it('throws when the card is gone', () => {
		const content = 'Front;:Back\n';
		const card = parseNote(content, {
			filePath: 'Note.md',
			deckPath: 'test',
			now: NOW,
		}).cards[0];
		if (!card) throw new Error('missing card');

		expect(() =>
			updateNoteScheduleContent(
				'Different;:Card\n',
				targetFromCard(card),
				learningSchedule(),
				NOW,
			),
		).toThrow(/Could not find/);
	});
});
