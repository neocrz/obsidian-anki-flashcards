import type { App } from 'obsidian';
import type { FlashcardSettings } from './settings';
import type { CardStore } from './data/card-store';

/** The subset of the plugin that the view needs. Keeps the view decoupled from main.ts. */
export interface FlashcardHost {
	readonly app: App;
	readonly settings: FlashcardSettings;
	readonly store: CardStore;
	openSettings(): void;
}

/** The subset of the plugin that the settings tab needs. */
export interface SettingsHost {
	readonly app: App;
	readonly settings: FlashcardSettings;
	saveSettings(): Promise<void>;
	scheduleRebuild(): void;
	resetSettings(): Promise<void>;
}
