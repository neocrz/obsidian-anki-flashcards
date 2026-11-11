import { App, Events, TFile } from 'obsidian';
import type { Flashcard, Schedule } from '../types';
import type { FlashcardSettings } from '../settings';
import { toSchedulerConfig } from '../settings';
import { buildDeckTree, cardsForDeck } from '../model/deck';
import { parseNote } from '../model/parser';
import { extractTagsFromContent, resolveDeck, tagMatchesBase } from '../model/tags';
import { scheduleAnswer } from '../scheduling/scheduler';
import { writeCardSchedule } from './note-writer';

export interface AnswerResult {
	card: Flashcard;
	previous: Schedule;
	next: Schedule;
}

function isMarkdown(file: TFile): boolean {
	return file.extension === 'md';
}

/**
 * In-memory index derived entirely from notes. No card state is persisted here;
 * settings are the only plugin data.
 */
export class CardStore extends Events {
	private cards = new Map<string, Flashcard>();
	private fileCards = new Map<string, string[]>();
	private fileVersions = new Map<string, number>();
	private epoch = 0;
	private ready: Promise<void> | null = null;

	constructor(
		private readonly app: App,
		private readonly getSettings: () => FlashcardSettings,
	) {
		super();
	}

	initialize(): Promise<void> {
		if (!this.ready) {
			this.ready = this.rebuild().catch((error: unknown) => {
				this.ready = null;
				throw error;
			});
		}
		return this.ready;
	}

	async rebuild(): Promise<void> {
		this.epoch += 1;
		const epoch = this.epoch;
		this.cards.clear();
		this.fileCards.clear();
		this.fileVersions.clear();

		const files = this.app.vault.getMarkdownFiles();
		const chunkSize = 40;
		for (let index = 0; index < files.length; index += chunkSize) {
			const chunk = files.slice(index, index + chunkSize);
			await Promise.all(chunk.map((file) => this.indexFile(file, false)));
			if (this.epoch !== epoch) return;
		}

		this.trigger('changed');
	}

	async indexFile(file: TFile, notify = true): Promise<void> {
		if (!isMarkdown(file)) return;

		const epoch = this.epoch;
		const version = (this.fileVersions.get(file.path) ?? 0) + 1;
		this.fileVersions.set(file.path, version);

		try {
			await this.indexFileNow(file, epoch, version, notify);
		} catch (error) {
			console.error(`[anki-flashcards] Failed to index ${file.path}`, error);
		}
	}

	private async indexFileNow(
		file: TFile,
		epoch: number,
		version: number,
		notify: boolean,
	): Promise<void> {
		const settings = this.getSettings();
		const cache = this.app.metadataCache.getFileCache(file);
		const cacheTags = (cache?.tags ?? []).map((tag) => tag.tag);

		// Fast path: the metadata cache knows this file has no matching tag.
		if (
			cache &&
			cacheTags.length > 0 &&
			!cacheTags.some((tag) => tagMatchesBase(tag, settings.baseTag))
		) {
			this.removeFile(file.path, notify);
			return;
		}

		const content = await this.app.vault.cachedRead(file);
		if (this.epoch !== epoch || this.fileVersions.get(file.path) !== version) return;

		const tags = [...cacheTags, ...extractTagsFromContent(content)];
		const deck = resolveDeck(tags, settings.baseTag);
		if (!deck) {
			this.removeFile(file.path, notify);
			return;
		}

		const parsed = parseNote(content, {
			filePath: file.path,
			deckPath: deck.path,
		});
		if (this.epoch !== epoch || this.fileVersions.get(file.path) !== version) return;

		for (const warning of parsed.warnings) {
			console.warn(`[anki-flashcards] ${file.path}: ${warning}`);
		}

		this.replaceFileCards(file.path, parsed.cards);
		if (notify) this.trigger('changed');
	}

	private replaceFileCards(filePath: string, cards: readonly Flashcard[]): void {
		const oldIds = this.fileCards.get(filePath) ?? [];
		for (const id of oldIds) this.cards.delete(id);

		const ids: string[] = [];
		for (const card of cards) {
			this.cards.set(card.id, card);
			ids.push(card.id);
		}
		this.fileCards.set(filePath, ids);
	}

	removeFile(filePath: string, notify = true): void {
		const oldIds = this.fileCards.get(filePath);
		if (!oldIds) return;

		for (const id of oldIds) this.cards.delete(id);
		this.fileCards.delete(filePath);
		if (notify) this.trigger('changed');
	}

	getCard(id: string): Flashcard | undefined {
		return this.cards.get(id);
	}

	getAllCards(): Flashcard[] {
		return [...this.cards.values()];
	}

	getCardsForDeck(deckPath: string): Flashcard[] {
		return cardsForDeck(this.getAllCards(), deckPath);
	}

	/** Notify views after a settings change that affects counts or previews. */
	notifyChanged(): void {
		this.trigger('changed');
	}

	getDeckTree() {
		const settings = this.getSettings();
		return buildDeckTree(this.getAllCards(), {
			now: new Date(),
			newCardsPerDay: settings.newCardsPerDay,
			reviewsPerDay: settings.reviewsPerDay,
			rootLabel: `#${settings.baseTag}`,
		});
	}

	async answer(cardId: string, rating: 1 | 2 | 3 | 4): Promise<AnswerResult> {
		const card = this.cards.get(cardId);
		if (!card) throw new Error('This card is no longer in the index. Refresh the deck list.');

		const settings = this.getSettings();
		const now = new Date();
		const next = scheduleAnswer(
			card.schedule,
			rating,
			now,
			toSchedulerConfig(settings),
			card.id,
		);

		await writeCardSchedule(this.app, card, next);

		const file = this.app.vault.getAbstractFileByPath(card.filePath);
		if (file instanceof TFile) {
			await this.indexFile(file, false);
		}
		this.trigger('changed');

		return {
			card: this.findUpdatedCard(card) ?? { ...card, schedule: next },
			previous: card.schedule,
			next,
		};
	}

	private findUpdatedCard(original: Flashcard): Flashcard | undefined {
		const ids = this.fileCards.get(original.filePath) ?? [];
		const candidates = ids
			.map((id) => this.cards.get(id))
			.filter((card): card is Flashcard => Boolean(card))
			.filter((card) => card.direction === original.direction);

		return (
			candidates.find((card) => card.blockId === original.blockId) ??
			candidates.find((card) => card.order === original.order) ??
			candidates.find((card) => card.front === original.front && card.back === original.back)
		);
	}
}
