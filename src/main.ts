import { App, Notice, Plugin, TAbstractFile, TFile } from 'obsidian';
import { COMMAND_IDS, PLUGIN_ID, RIBBON_ICON, VIEW_TYPE } from './constants';
import { CardStore } from './data/card-store';
import type { FlashcardHost, SettingsHost } from './host';
import { DEFAULT_SETTINGS, normalizeSettings, type FlashcardSettings } from './settings';
import { FlashcardView } from './ui/flashcard-view';
import { metadataLineDecorations, refreshMetadataDecorations } from './ui/metadata-decorations';
import { FlashcardsSettingTab } from './ui/settings-tab';

interface AppWithSettings extends App {
	setting?: {
		open(): void;
		openTabById(id: string): void;
	};
}

export default class AnkiFlashcardsPlugin extends Plugin implements FlashcardHost, SettingsHost {
	declare settings: FlashcardSettings;
	store!: CardStore;
	private rebuildTimer: number | null = null;
	private indexTimers = new Map<string, number>();

	async onload(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
		this.store = new CardStore(this.app, () => this.settings);

		this.registerView(VIEW_TYPE, (leaf) => new FlashcardView(leaf, this));

		this.addRibbonIcon(RIBBON_ICON, 'Open flashcards', () => {
			void this.openView();
		});

		this.addCommand({
			id: COMMAND_IDS.open,
			name: 'Open flashcards',
			callback: () => {
				void this.openView();
			},
		});
		this.addCommand({
			id: COMMAND_IDS.rebuild,
			name: 'Rebuild flashcard index',
			callback: () => {
				void this.rebuildIndex(true);
			},
		});

		this.addSettingTab(new FlashcardsSettingTab(this.app, this, this));
		this.registerEditorExtension(metadataLineDecorations(() => this.settings));
		this.registerVaultEvents();

		this.app.workspace.onLayoutReady(() => {
			void this.store.initialize().catch((error: unknown) => {
				console.error('[anki-flashcards] Initial index failed', error);
			});
		});

		this.register(() => {
			for (const timer of this.indexTimers.values()) window.clearTimeout(timer);
			this.indexTimers.clear();
			if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
		});
	}

	async openView(): Promise<void> {
		try {
			await this.store.initialize();
		} catch (error) {
			console.error('[anki-flashcards] Could not index cards', error);
			new Notice('Could not index flashcards. Check the developer console.');
			return;
		}

		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) {
			leaf = this.app.workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
		}
		await this.app.workspace.revealLeaf(leaf);
	}

	openSettings(): void {
		const app = this.app as AppWithSettings;
		app.setting?.openTabById(PLUGIN_ID);
		app.setting?.open();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		refreshMetadataDecorations();
		this.store.notifyChanged();
	}

	scheduleRebuild(): void {
		if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
		this.rebuildTimer = window.setTimeout(() => {
			this.rebuildTimer = null;
			void this.store.rebuild().catch((error: unknown) => {
				console.error('[anki-flashcards] Rebuild failed', error);
			});
		}, 700);
	}

	async resetSettings(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS };
		await this.saveSettings();
		await this.store.rebuild();
		new Notice('Flashcard settings reset.');
	}

	private async rebuildIndex(notify: boolean): Promise<void> {
		try {
			await this.store.rebuild();
			if (notify) new Notice('Flashcard index rebuilt.');
		} catch (error) {
			console.error('[anki-flashcards] Rebuild failed', error);
			if (notify) new Notice('Could not rebuild the flashcard index.');
		}
	}

	private registerVaultEvents(): void {
		const queueIndex = (file: TAbstractFile) => {
			if (!(file instanceof TFile) || file.extension !== 'md') return;

			const existing = this.indexTimers.get(file.path);
			if (existing !== undefined) window.clearTimeout(existing);

			const timer = window.setTimeout(() => {
				this.indexTimers.delete(file.path);
				void this.store.indexFile(file);
			}, 500);
			this.indexTimers.set(file.path, timer);
		};

		this.registerEvent(this.app.vault.on('create', queueIndex));
		this.registerEvent(this.app.vault.on('modify', queueIndex));
		this.registerEvent(this.app.metadataCache.on('changed', queueIndex));

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) this.store.removeFile(file.path);
			}),
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.store.removeFile(oldPath);
				queueIndex(file);
			}),
		);
	}
}
