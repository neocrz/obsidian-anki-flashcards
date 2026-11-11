import { App, Component, MarkdownRenderer, setIcon } from 'obsidian';
import type { Flashcard, Rating } from '../types';
import type { RatingPreview } from '../scheduling/scheduler';
import { directionLabel, reviewDetails } from './format';
import { formatDelay } from '../scheduling/steps';

export interface ReviewCallbacks {
	onBack(): void;
	onReveal(): void;
	onAnswer(rating: Rating): void;
	onOpenNote(): void;
}

export interface ReviewModel {
	deckLabel: string;
	card: Flashcard | null;
	revealed: boolean;
	previews: Record<Rating, RatingPreview> | null;
	remaining: number;
	nextDue: Date | null;
	busy: boolean;
	now: Date;
}

const RATING_META: Record<Rating, { label: string; className: string; hint: string }> = {
	1: { label: 'Again', className: 'fc-rating-again', hint: '1 or A' },
	2: { label: 'Hard', className: 'fc-rating-hard', hint: '2 or H' },
	3: { label: 'Good', className: 'fc-rating-good', hint: '3 or G' },
	4: { label: 'Easy', className: 'fc-rating-easy', hint: '4 or E' },
};

function renderMarkdown(
	el: HTMLElement,
	app: App,
	component: Component,
	sourcePath: string,
	markdown: string,
): void {
	el.empty();
	el.addClass('fc-markdown');
	void MarkdownRenderer.render(app, markdown, el, sourcePath, component);
}

function renderTopBar(
	container: HTMLElement,
	model: ReviewModel,
	callbacks: ReviewCallbacks,
): void {
	const top = container.createDiv({ cls: 'fc-review-top' });

	const back = top.createEl('button', { cls: 'fc-icon-button' });
	setIcon(back, 'arrow-left');
	back.setAttribute('aria-label', 'Back to decks');
	back.addEventListener('click', () => callbacks.onBack());

	const title = top.createDiv({ cls: 'fc-review-title' });
	title.createEl('strong', { text: model.deckLabel });
	if (model.card) {
		title.createSpan({
			cls: 'fc-muted',
			text: `${model.card.kind === 'inline' ? 'Inline' : 'Multi-line'} · ${directionLabel(model.card)}`,
		});
	}

	const right = top.createDiv({ cls: 'fc-review-actions' });
	if (model.remaining > 0) {
		right.createSpan({ cls: 'fc-remaining', text: `${model.remaining} left` });
	}
	if (model.card) {
		const note = right.createEl('button', { cls: 'fc-icon-button' });
		setIcon(note, 'file-text');
		note.setAttribute('aria-label', 'Open source note');
		note.addEventListener('click', () => callbacks.onOpenNote());
	}
}

function renderCard(
	container: HTMLElement,
	model: ReviewModel,
	callbacks: ReviewCallbacks,
	app: App,
	component: Component,
): void {
	const card = model.card;
	if (!card) return;

	const shell = container.createDiv({ cls: 'fc-card' });

	const meta = shell.createDiv({ cls: 'fc-card-meta' });
	meta.createSpan({
		cls: `fc-state fc-state-${card.schedule.state}`,
		text: card.schedule.state,
	});
	if (card.twoWay) {
		meta.createSpan({
			cls: 'fc-direction',
			text: card.direction === 'forward' ? 'Forward' : 'Reverse',
		});
	}
	meta.createSpan({ cls: 'fc-note-name', text: card.filePath });

	const front = shell.createDiv({ cls: 'fc-card-face' });
	front.createSpan({ cls: 'fc-face-label', text: 'Front' });
	renderMarkdown(
		front.createDiv({ cls: 'fc-card-content' }),
		app,
		component,
		card.filePath,
		card.front,
	);

	if (!model.revealed) {
		const reveal = shell.createEl('button', {
			cls: 'fc-show-answer mod-cta',
			text: 'Show answer',
		});
		reveal.addEventListener('click', () => callbacks.onReveal());
		shell.createDiv({ cls: 'fc-hint', text: 'Space or Enter to show answer' });
		return;
	}

	const back = shell.createDiv({ cls: 'fc-card-face fc-card-back' });
	back.createSpan({ cls: 'fc-face-label', text: 'Back' });
	renderMarkdown(
		back.createDiv({ cls: 'fc-card-content' }),
		app,
		component,
		card.filePath,
		card.back,
	);

	const ratingBar = shell.createDiv({ cls: 'fc-rating-bar' });
	for (const rating of [1, 2, 3, 4] as const) {
		const info = RATING_META[rating];
		const preview = model.previews?.[rating];
		const button = ratingBar.createEl('button', { cls: `fc-rating ${info.className}` });
		button.type = 'button';
		button.disabled = model.busy;
		button.createSpan({ cls: 'fc-rating-label', text: info.label });
		button.createSpan({
			cls: 'fc-rating-interval',
			text: preview?.intervalLabel ?? '',
		});
		button.setAttribute(
			'title',
			`${info.label} (${info.hint})${preview ? ` · ${preview.dueLabel}` : ''}`,
		);
		button.addEventListener('click', () => callbacks.onAnswer(rating));
	}

	shell.createDiv({
		cls: 'fc-hint',
		text: '1 Again · 2 Hard · 3 Good · 4 Easy · Esc to decks',
	});

	const details = shell.createEl('details', { cls: 'fc-card-info' });
	details.createEl('summary', { text: 'Card info' });
	const table = details.createEl('dl');
	for (const [label, value] of reviewDetails(card, model.now)) {
		table.createEl('dt', { text: label });
		table.createEl('dd', { text: value });
	}
}

function renderFinished(
	container: HTMLElement,
	model: ReviewModel,
	callbacks: ReviewCallbacks,
): void {
	const done = container.createDiv({ cls: 'fc-done' });
	done.createEl('h3', { text: 'All caught up' });
	if (model.nextDue) {
		const delay = model.nextDue.getTime() - model.now.getTime();
		const text = delay <= 0 ? 'Loading next card…' : `Next card in ${formatDelay(delay)}`;
		done.createEl('p', { cls: 'fc-countdown', text });
	} else {
		done.createEl('p', { text: 'No more cards in this deck right now.' });
	}

	const back = done.createEl('button', { cls: 'mod-cta', text: 'Back to decks' });
	back.addEventListener('click', () => callbacks.onBack());
}

export function renderReviewScreen(
	container: HTMLElement,
	model: ReviewModel,
	callbacks: ReviewCallbacks,
	app: App,
	component: Component,
): void {
	renderTopBar(container, model, callbacks);

	const body = container.createDiv({ cls: 'fc-review-body' });
	if (model.card) {
		renderCard(body, model, callbacks, app, component);
	} else {
		renderFinished(body, model, callbacks);
	}
}
