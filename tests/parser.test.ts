import { describe, expect, it } from 'vitest';
import { parseNote, findInlineSeparator } from '../src/model/parser';

const NOW = new Date('2026-01-01T09:00:00.000Z');

function parse(content: string, deckPath = 'test') {
	return parseNote(content, { filePath: 'Note.md', deckPath, now: NOW });
}

describe('inline cards', () => {
	it('parses one-way and two-way cards', () => {
		const result = parse('Capital;:Tokyo\nTokyo;::Capital\n');

		expect(result.cards).toHaveLength(3);
		expect(result.cards.map((card) => [card.direction, card.front, card.back])).toEqual([
			['forward', 'Capital', 'Tokyo'],
			['forward', 'Tokyo', 'Capital'],
			['reverse', 'Capital', 'Tokyo'],
		]);
		expect(result.cards[0]?.kind).toBe('inline');
		expect(result.cards[0]?.deckPath).toBe('test');
		expect(result.cards[1]?.twoWay).toBe(true);
		expect(result.cards[2]?.twoWay).toBe(true);
	});

	it('ignores empty sides and prose without separators', () => {
		const result = parse(';:back\nfront;:\nno separator here\n#fc/test\n');
		expect(result.cards).toHaveLength(0);
	});

	it('supports escaped separators', () => {
		const result = parse('Use \\;: in prose;:a card');
		expect(result.cards).toHaveLength(1);
		expect(result.cards[0]?.front).toBe('Use \\;: in prose');
		expect(result.cards[0]?.back).toBe('a card');
	});

	it('ignores separators inside inline code', () => {
		const result = parse('Use `a;:b` here;:answer');
		expect(result.cards).toHaveLength(1);
		expect(result.cards[0]?.front).toBe('Use `a;:b` here');
		expect(result.cards[0]?.back).toBe('answer');
	});

	it('finds two-way separators first at the same position', () => {
		expect(findInlineSeparator('a;::b')).toEqual({ index: 1, length: 3, twoWay: true });
		expect(findInlineSeparator('a;:b')).toEqual({ index: 1, length: 2, twoWay: false });
	});
});

describe('multi-line cards', () => {
	it('parses one-way cards', () => {
		const result = parse('Front 1\nFront 2\n:;\nBack 1\nBack 2');
		expect(result.cards).toHaveLength(1);
		expect(result.cards[0]?.kind).toBe('multiline');
		expect(result.cards[0]?.front).toBe('Front 1\nFront 2');
		expect(result.cards[0]?.back).toBe('Back 1\nBack 2');
	});

	it('parses two-way cards', () => {
		const result = parse('Front\n:;:\nBack');
		expect(result.cards.map((card) => [card.direction, card.front, card.back])).toEqual([
			['forward', 'Front', 'Back'],
			['reverse', 'Back', 'Front'],
		]);
	});

	it('uses blank lines as block boundaries', () => {
		const result = parse('A\n:;\nB\n\nC\n:;\nD');
		expect(result.cards).toHaveLength(2);
		expect(result.cards[1]?.front).toBe('C');
	});

	it('ignores blocks with empty front or back', () => {
		const result = parse(':;\nBack\n\nFront\n:;');
		expect(result.cards).toHaveLength(0);
		expect(result.warnings).toHaveLength(2);
	});

	it('ignores blocks with multiple separators', () => {
		const result = parse('A\n:;\nB\n:;\nC');
		expect(result.cards).toHaveLength(0);
		expect(result.warnings[0]).toContain('multiple');
	});
});

describe('code fences and comments', () => {
	it('skips fenced code blocks', () => {
		const result = parse('```\na;:b\n:;\nc\n```\nreal;:card');
		expect(result.cards).toHaveLength(1);
		expect(result.cards[0]?.front).toBe('real');
	});

	it('skips html comments that are not metadata', () => {
		const result = parse('<!-- a;:b -->\nreal;:card');
		expect(result.cards).toHaveLength(1);
	});
});

describe('metadata association', () => {
	it('attaches a metadata line to the preceding inline card', () => {
		const content = [
			'Front;:Back',
			'<!-- fc-srs {"v":1,"id":"abc","cards":{"fwd":{"due":"2026-02-01T09:00:00.000Z","state":"review","step":0,"ivl":30,"ease":2600,"reps":5,"lapses":1,"rd":1,"rday":"2026-01-31"}}} -->',
		].join('\n');
		const result = parse(content);
		const card = result.cards[0];

		expect(result.cards).toHaveLength(1);
		expect(card?.blockId).toBe('abc');
		expect(card?.id).toBe('Note.md::abc::forward');
		expect(card?.metadataLine).toBe(1);
		expect(card?.schedule.state).toBe('review');
		expect(card?.schedule.intervalDays).toBe(30);
		expect(card?.schedule.ease).toBe(2600);
		expect(card?.schedule.lapses).toBe(1);
		expect(card?.schedule.reviewDay).toBe('2026-01-31');
	});

	it('attaches a metadata line to a multi-line card', () => {
		const content = [
			'Front',
			':;',
			'Back',
			'<!-- fc-srs {"v":1,"id":"m1","cards":{"fwd":{"state":"learning","due":"2026-01-01T09:10:00.000Z","step":1,"ivl":0,"ease":2500,"reps":2,"lapses":0,"rd":0}}} -->',
		].join('\n');
		const card = parse(content).cards[0];
		expect(card?.metadataLine).toBe(3);
		expect(card?.lineStart).toBe(0);
		expect(card?.lineEnd).toBe(2);
		expect(card?.schedule.state).toBe('learning');
		expect(card?.schedule.step).toBe(1);
	});

	it('merges direction records for two-way cards', () => {
		const content = [
			'A;::B',
			'<!-- fc-srs {"v":1,"id":"tw","cards":{"fwd":{"state":"review","due":"2026-02-01T09:00:00.000Z","step":0,"ivl":5,"ease":2500,"reps":3,"lapses":0,"rd":0},"rev":{"state":"learning","due":"2026-01-01T09:10:00.000Z","step":0,"ivl":0,"ease":2500,"reps":1,"lapses":0,"rd":0}}} -->',
		].join('\n');
		const cards = parse(content).cards;
		expect(cards).toHaveLength(2);
		expect(cards[0]?.schedule.state).toBe('review');
		expect(cards[1]?.schedule.state).toBe('learning');
		expect(cards[0]?.blockId).toBe(cards[1]?.blockId);
	});

	it('ignores malformed metadata but reports a warning', () => {
		const result = parse('A;:B\n<!-- fc-srs {broken} -->');
		expect(result.cards).toHaveLength(1);
		expect(result.cards[0]?.schedule.state).toBe('new');
		expect(result.warnings[0]).toContain('malformed');
	});
});

describe('identity and line handling', () => {
	it('gives duplicate content distinct block IDs', () => {
		const cards = parse('A;:B\nA;:B').cards;
		expect(cards).toHaveLength(2);
		expect(cards[0]?.blockId).not.toBe(cards[1]?.blockId);
	});

	it('keeps the persisted block ID', () => {
		const content = ['A;:B', '<!-- fc-srs {"v":1,"id":"kept","cards":{}} -->'].join('\n');
		expect(parse(content).cards[0]?.blockId).toBe('kept');
	});

	it('handles CRLF input', () => {
		const result = parse('A;:B\r\nC;:D\r\n');
		expect(result.cards).toHaveLength(2);
		expect(result.cards[1]?.front).toBe('C');
	});

	it('assigns stable order across directions', () => {
		const cards = parse('A;::B\nC;:D').cards;
		expect(cards.map((card) => card.order)).toEqual([0, 1, 2]);
	});
});
