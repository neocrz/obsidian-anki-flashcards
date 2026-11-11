import { describe, expect, it } from 'vitest';
import { extractTagsFromContent, resolveDeck, tagMatchesBase } from '../src/model/tags';

describe('deck tags', () => {
	it('resolves the most specific tag', () => {
		expect(resolveDeck(['#fc', '#fc/Japanese/Hiragana'], 'fc')).toEqual({
			path: 'japanese/hiragana',
			label: 'Japanese/Hiragana',
			tag: '#fc/Japanese/Hiragana',
		});
	});

	it('resolves the root deck', () => {
		expect(resolveDeck(['#fc'], 'fc')).toEqual({ path: '', label: 'fc', tag: '#fc' });
	});

	it('uses the first tag on a depth tie', () => {
		expect(resolveDeck(['#fc/spanish', '#fc/japanese'], 'fc')?.path).toBe('spanish');
	});

	it('ignores unrelated tags and normalizes the base', () => {
		expect(resolveDeck(['#other', '#fcc'], ' #FC/ ')).toBeNull();
		expect(resolveDeck(['#fc/math'], ' #FC/ ')?.path).toBe('math');
	});

	it('matches only whole tag segments', () => {
		expect(tagMatchesBase('#fc', 'fc')).toBe(true);
		expect(tagMatchesBase('#fc/math', 'fc')).toBe(true);
		expect(tagMatchesBase('#fcx', 'fc')).toBe(false);
		expect(tagMatchesBase('#other/fc', 'fc')).toBe(false);
	});
});

describe('content tag extraction', () => {
	it('reads inline tags', () => {
		expect(extractTagsFromContent('Text #fc/math and #other')).toEqual(['#fc/math', '#other']);
	});

	it('reads frontmatter lists and inline arrays', () => {
		const content = ['---', 'tags:', '  - fc/japanese', '  - other', '---', '', 'Body'].join(
			'\n',
		);
		expect(extractTagsFromContent(content)).toEqual(['#fc/japanese', '#other']);
		expect(extractTagsFromContent('---\ntags: [fc/a, fc/b]\n---\n')).toEqual([
			'#fc/a',
			'#fc/b',
		]);
	});

	it('skips fenced code blocks', () => {
		const content = ['```md', '#fc/not-a-tag', '```', '#fc/real'].join('\n');
		expect(extractTagsFromContent(content)).toEqual(['#fc/real']);
	});

	it('deduplicates case-insensitively', () => {
		expect(extractTagsFromContent('#fc/A #fc/a')).toEqual(['#fc/A']);
	});
});
