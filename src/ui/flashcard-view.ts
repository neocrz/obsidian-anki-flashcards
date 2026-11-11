import { ItemView, Notice, TFile, WorkspaceLeaf, type ViewStateResult } from 'obsidian';
import type { FlashcardHost } from '../host';
import { VIEW_TYPE, RIBBON_ICON } from '../constants';
import { toSchedulerConfig } from '../settings';
import type { Flashcard, Rating } from '../types';
import { StudySession } from '../scheduling/queue';
import { previewAnswers, type RatingPreview } from '../scheduling/scheduler';
import { renderDeckBrowser } from './deck-browser';
import { renderReviewScreen } from './review-screen';

type Mode = 'decks' | 'review';

interface InitialState {
	mode: Mode;
	deckPath: string;
}

const RATING_KEYS: Record<string, Rating> = {
	'1': 1,
	a: 1,
	'2': 2,
	h: 2,
	'3': 3,
	g: 3,
	'4': 4,
	e: 4,
};

export class FlashcardView extends ItemView {
	private mode: Mode = 'decks';
	private deckPath = '';
	private initialState: InitialState | null = null;
	private session: StudySession | null = null;
	private currentId: string | null = null;
	private revealed = false;
	private busy = false;
	private nextDue: Date | null = null;
	private countdownTimer: number | null = null;
	private preparing = false;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: FlashcardHost,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Flashcards';
	}

	getIcon(): string {
		return RIBBON_ICON;
	}

	getState(): Record<string, unknown> {
		return { mode: this.mode, deckPath: this.deckPath };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const data = (state ?? {}) as { mode?: unknown; deckPath?: unknown };
		this.initialState = {
			mode: data.mode === 'review' ? 'review' : 'decks',
			deckPath: typeof data.deckPath === 'string' ? data.deckPath : '',
		};
		await super.setState(state, result);
		if (this.contentEl.isConnected) await this.prepare();
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('fc-view');
		this.contentEl.tabIndex = -1;
		this.registerDomEvent(activeDocument, 'keydown', (event) => this.handleKey(event));
		this.registerEvent(
			this.plugin.store.on('changed', () => {
				if (this.mode === 'decks') this.renderDecks();
			}),
		);
		await this.prepare();
	}

	async onClose(): Promise<void> {
		this.stopTimer();
		this.contentEl.empty();
	}

	private async prepare(): Promise<void> {
		if (this.preparing) return;
		this.preparing = true;
		try {
			await this.plugin.store.initialize();
		} catch (error) {
			new Notice('Could not index flashcards. Check the developer console.');
			console.error('[anki-flashcards] Indexing failed', error);
			this.preparing = false;
			return;
		}

		const initial = this.initialState;
		this.initialState = null;
		this.preparing = false;

		if (initial?.mode === 'review' && initial.deckPath !== undefined) {
			await this.startReview(initial.deckPath);
		} else {
			this.renderDecks();
		}
	}

	private deckLabel(path: string): string {
		const base = `#${this.plugin.settings.baseTag}`;
		if (!path) return base;
		return `${base}/${path}`;
	}

	private renderDecks(): void {
		this.stopTimer();
		this.mode = 'decks';
		this.session = null;
		this.currentId = null;
		this.revealed = false;
		this.busy = false;
		this.nextDue = null;

		this.contentEl.empty();
		const settings = this.plugin.settings;
		renderDeckBrowser(
			this.contentEl,
			{
				root: this.plugin.store.getDeckTree(),
				baseTag: `#${settings.baseTag}`,
				newCardsPerDay: settings.newCardsPerDay,
				reviewsPerDay: settings.reviewsPerDay,
				totalCards: this.plugin.store.getAllCards().length,
			},
			{
				onStudy: (path) => {
					void this.startReview(path);
				},
				onRefresh: () => {
					void this.rebuild();
				},
				onSettings: () => this.plugin.openSettings(),
			},
		);
	}

	private async rebuild(): Promise<void> {
		try {
			await this.plugin.store.rebuild();
			new Notice('Flashcard index rebuilt.');
			if (this.mode === 'decks') this.renderDecks();
		} catch (error) {
			console.error('[anki-flashcards] Rebuild failed', error);
			new Notice('Could not rebuild the flashcard index.');
		}
	}

	private async startReview(deckPath: string): Promise<void> {
		try {
			await this.plugin.store.initialize();
		} catch (error) {
			console.error('[anki-flashcards] Indexing failed', error);
			new Notice('Could not index flashcards.');
			return;
		}

		const cards = this.plugin.store.getCardsForDeck(deckPath);
		if (cards.length === 0) {
			new Notice('No flashcards in this deck.');
			this.renderDecks();
			return;
		}

		const settings = this.plugin.settings;
		this.mode = 'review';
		this.deckPath = deckPath;
		this.session = new StudySession(cards, {
			now: new Date(),
			newCardsPerDay: settings.newCardsPerDay,
			reviewsPerDay: settings.reviewsPerDay,
		});
		this.currentId = null;
		this.revealed = false;
		this.busy = false;
		this.nextDue = null;
		this.renderNext();
	}

	private renderNext(): void {
		this.stopTimer();
		if (!this.session) {
			this.renderDecks();
			return;
		}

		const pick = this.session.pick(new Date(), (id) => this.plugin.store.getCard(id));
		if (pick.card) {
			this.currentId = pick.card.id;
			this.revealed = false;
			this.nextDue = null;
			this.renderReview();
			return;
		}

		this.currentId = null;
		this.nextDue = pick.nextDue ?? null;
		this.renderReview();
		if (this.nextDue) this.startTimer();
	}

	private previews(card: Flashcard | undefined, now: Date): Record<Rating, RatingPreview> | null {
		if (!card) return null;
		return previewAnswers(card.schedule, now, toSchedulerConfig(this.plugin.settings), card.id);
	}

	private renderReview(): void {
		const now = new Date();
		const card = this.currentId ? this.plugin.store.getCard(this.currentId) : undefined;
		if (this.currentId && !card) {
			this.session?.pending.delete(this.currentId);
			this.currentId = null;
			this.renderNext();
			return;
		}

		this.contentEl.empty();
		renderReviewScreen(
			this.contentEl,
			{
				deckLabel: this.deckLabel(this.deckPath),
				card: card ?? null,
				revealed: this.revealed,
				previews: this.previews(card, now),
				remaining: this.session?.remaining() ?? 0,
				nextDue: this.nextDue,
				busy: this.busy,
				now,
			},
			{
				onBack: () => this.backToDecks(),
				onReveal: () => this.reveal(),
				onAnswer: (rating) => {
					void this.answer(rating);
				},
				onOpenNote: () => {
					void this.openCurrentNote();
				},
			},
			this.app,
			this,
		);
	}

	private reveal(): void {
		if (!this.currentId || this.revealed || this.busy) return;
		this.revealed = true;
		this.renderReview();
	}

	private async answer(rating: Rating): Promise<void> {
		if (!this.currentId || !this.revealed || this.busy) return;

		const cardId = this.currentId;
		this.busy = true;
		this.renderReview();

		try {
			const result = await this.plugin.store.answer(cardId, rating);
			this.session?.onAnswered(result.card, new Date());
			this.busy = false;
			this.currentId = null;
			this.revealed = false;
			this.renderNext();
		} catch (error) {
			this.busy = false;
			this.renderReview();
			console.error('[anki-flashcards] Could not save review', error);
			new Notice('Could not save this review. The card was not advanced.');
		}
	}

	private backToDecks(): void {
		this.stopTimer();
		this.renderDecks();
	}

	private async openCurrentNote(): Promise<void> {
		if (!this.currentId) return;
		const card = this.plugin.store.getCard(this.currentId);
		if (!card) return;
		const file = this.app.vault.getAbstractFileByPath(card.filePath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}

	private startTimer(): void {
		this.stopTimer();
		const target = this.nextDue;
		if (!target) return;

		const tick = () => {
			if (!this.contentEl.isConnected) {
				this.stopTimer();
				return;
			}
			const remaining = target.getTime() - Date.now();
			if (remaining <= 0) {
				this.stopTimer();
				this.renderNext();
				return;
			}
			const label = this.contentEl.querySelector<HTMLElement>('.fc-countdown');
			if (label) label.textContent = `Next card in ${this.formatCountdown(remaining)}`;
		};

		tick();
		this.countdownTimer = window.setInterval(tick, 1000);
	}

	private stopTimer(): void {
		if (this.countdownTimer !== null) {
			window.clearInterval(this.countdownTimer);
			this.countdownTimer = null;
		}
	}

	private formatCountdown(milliseconds: number): string {
		const seconds = Math.ceil(milliseconds / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.ceil(seconds / 60);
		return `${minutes}m`;
	}

	private handleKey(event: KeyboardEvent): void {
		if (this.app.workspace.getActiveViewOfType(FlashcardView) !== this) return;
		if (this.mode !== 'review') return;

		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		if (activeDocument.querySelector('.modal-container')) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			this.backToDecks();
			return;
		}
		if (this.busy || !this.currentId) return;

		if (event.key === ' ' || event.key === 'Enter') {
			if (!this.revealed) {
				event.preventDefault();
				this.reveal();
			}
			return;
		}

		if (!this.revealed) return;
		const rating = RATING_KEYS[event.key.toLowerCase()];
		if (!rating) return;

		event.preventDefault();
		void this.answer(rating);
	}
}
