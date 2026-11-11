import { setIcon } from 'obsidian';
import type { DeckTreeNode } from '../types';
import { flattenDeckTree } from '../model/deck';

export interface DeckBrowserCallbacks {
	onStudy(path: string): void;
	onRefresh(): void;
	onSettings(): void;
}

export interface DeckBrowserModel {
	root: DeckTreeNode;
	baseTag: string;
	newCardsPerDay: number;
	reviewsPerDay: number;
	totalCards: number;
}

function countBadge(parent: HTMLElement, kind: 'new' | 'learning' | 'review', value: number): void {
	const badge = parent.createSpan({
		cls: `fc-count fc-count-${kind}`,
		text: String(value),
	});
	badge.setAttribute('title', `${value} ${kind}`);
}

function renderDeckRow(
	parent: HTMLElement,
	node: DeckTreeNode,
	callbacks: DeckBrowserCallbacks,
): void {
	const row = parent.createEl('button', { cls: 'fc-deck-row' });
	row.type = 'button';
	row.style.paddingLeft = `${12 + node.depth * 18}px`;
	row.setAttribute('aria-label', `Study deck ${node.path || node.label}`);

	const name = row.createSpan({ cls: 'fc-deck-name' });
	if (node.depth === 0) {
		name.createSpan({ cls: 'fc-deck-root', text: node.label });
	} else {
		name.createSpan({ cls: 'fc-deck-label', text: node.label });
	}

	const counts = row.createSpan({ cls: 'fc-deck-counts' });
	countBadge(counts, 'new', node.stats.new);
	countBadge(counts, 'learning', node.stats.learning);
	countBadge(counts, 'review', node.stats.review);

	if (node.stats.total === 0) {
		row.addClass('is-done');
		row.setAttribute('aria-label', `Deck ${node.path || node.label} has nothing due`);
	} else {
		row.addEventListener('click', () => callbacks.onStudy(node.path));
	}
}

function renderEmptyState(container: HTMLElement): void {
	const empty = container.createDiv({ cls: 'fc-empty' });
	empty.createEl('h3', { text: 'No flashcards yet' });
	empty.createEl('p', {
		text: 'Add the base tag to a note, then write cards with the separators below.',
	});

	const inline = empty.createEl('pre');
	inline.createEl('code', {
		text: [
			'#fc/japanese/hiragana',
			'',
			'Capital of Japan;:Tokyo',
			'Tokyo;::Capital of Japan',
		].join('\n'),
	});

	empty.createEl('p', { text: 'Multi-line cards use a separator line:' });
	const multiline = empty.createEl('pre');
	multiline.createEl('code', {
		text: ['What are the primary colors?', ':;', 'Red', 'Green', 'Blue'].join('\n'),
	});

	empty.createEl('p', {
		cls: 'fc-muted',
		text: 'Use ;:: or :;: for a two-way card. Blank lines delimit multi-line cards.',
	});
}

export function renderDeckBrowser(
	container: HTMLElement,
	model: DeckBrowserModel,
	callbacks: DeckBrowserCallbacks,
): void {
	const header = container.createDiv({ cls: 'fc-header' });
	const titleGroup = header.createDiv({ cls: 'fc-header-title' });
	titleGroup.createEl('h2', { text: 'Flashcards' });
	titleGroup.createEl('p', {
		cls: 'fc-muted',
		text: `${model.totalCards} card${model.totalCards === 1 ? '' : 's'} in ${model.baseTag}`,
	});

	const actions = header.createDiv({ cls: 'fc-header-actions' });
	const refresh = actions.createEl('button', { cls: 'fc-icon-button' });
	setIcon(refresh, 'refresh-cw');
	refresh.setAttribute('aria-label', 'Rebuild flashcard index');
	refresh.addEventListener('click', () => callbacks.onRefresh());

	const settings = actions.createEl('button', { cls: 'fc-icon-button' });
	setIcon(settings, 'settings');
	settings.setAttribute('aria-label', 'Open flashcard settings');
	settings.addEventListener('click', () => callbacks.onSettings());

	const flat = flattenDeckTree(model.root).filter(
		(node) => node.path === '' || node.allCards.length > 0,
	);

	if (model.totalCards === 0) {
		renderEmptyState(container);
		return;
	}

	const list = container.createDiv({ cls: 'fc-deck-list' });
	const labels = list.createDiv({ cls: 'fc-deck-columns' });
	labels.createSpan({ text: 'Deck' });
	const labelCounts = labels.createSpan({ cls: 'fc-deck-column-counts' });
	labelCounts.createSpan({ text: 'New' });
	labelCounts.createSpan({ text: 'Learn' });
	labelCounts.createSpan({ text: 'Due' });

	for (const node of flat) renderDeckRow(list, node, callbacks);

	const footer = container.createDiv({ cls: 'fc-footer' });
	footer.createSpan({
		text: `New cards/day ${model.newCardsPerDay} · Reviews/day ${model.reviewsPerDay}`,
	});
	footer.createSpan({ text: 'Due counts include subdecks.' });
}
