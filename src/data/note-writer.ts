import { App, TFile } from 'obsidian';
import type { Flashcard, Schedule } from '../types';
import { targetFromCard, updateNoteScheduleContent } from '../model/note-edit';

/** Atomically update a card's hidden metadata line. */
export async function writeCardSchedule(
	app: App,
	card: Flashcard,
	schedule: Schedule,
): Promise<void> {
	const file = app.vault.getAbstractFileByPath(card.filePath);
	if (!(file instanceof TFile)) {
		throw new Error(`Note not found: ${card.filePath}`);
	}

	await app.vault.process(
		file,
		(data) => updateNoteScheduleContent(data, targetFromCard(card), schedule).content,
	);
}
