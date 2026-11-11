import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	type SettingDefinitionControl,
	type SettingDefinitionGroup,
	type SettingDefinitionItem,
} from 'obsidian';
import type { SettingsHost } from '../host';
import { DEFAULT_SETTINGS, normalizeBaseTag } from '../settings';
import {
	findSettingSpec,
	SETTINGS_GROUPS,
	type DropdownSettingSpec,
	type NumberSettingSpec,
	type SettingGroupSpec,
	type SettingSpec,
	type TextSettingSpec,
} from './settings-spec';

function textValue(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** Coerce a UI value into something safe to store, or `undefined` to reject it. */
function coerceValue(spec: SettingSpec, value: unknown): unknown {
	switch (spec.kind) {
		case 'number': {
			const parsed = typeof value === 'number' ? value : Number(value);
			if (!Number.isFinite(parsed)) return undefined;
			return Math.min(spec.max, Math.max(spec.min, parsed));
		}
		case 'toggle':
			return value === true;
		case 'dropdown':
			return value === 'suspend' ? 'suspend' : 'tag';
		case 'text': {
			const text = typeof value === 'string' ? value : '';
			return spec.key === 'baseTag'
				? normalizeBaseTag(text) || DEFAULT_SETTINGS.baseTag
				: text;
		}
	}
}

export class FlashcardsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly pluginHost: SettingsHost,
	) {
		super(app, plugin);
	}

	private get host(): SettingsHost {
		return this.pluginHost;
	}

	// --- Declarative settings (Obsidian 1.13+) ---------------------------------

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'How cards are stored',
				desc: 'Cards live in your notes. Review data is written below each card as a hidden comment.',
			},
			...SETTINGS_GROUPS.map((group) => this.groupDefinition(group)),
			this.maintenanceDefinition(),
		];
	}

	getControlValue(key: string): unknown {
		return this.read(key);
	}

	setControlValue(key: string, value: unknown): void {
		const spec = findSettingSpec(key);
		if (!spec) return;

		const next = coerceValue(spec, value);
		if (next === undefined) return;

		(this.host.settings as unknown as Record<string, unknown>)[key] = next;
		void this.host.saveSettings();
		if (key === 'baseTag') this.host.scheduleRebuild();
	}

	private groupDefinition(group: SettingGroupSpec): SettingDefinitionGroup {
		return {
			type: 'group',
			heading: group.heading,
			items: group.items.map((spec) => this.controlDefinition(spec)),
		};
	}

	private controlDefinition(spec: SettingSpec): SettingDefinitionControl {
		switch (spec.kind) {
			case 'number':
				return {
					name: spec.name,
					desc: spec.desc,
					control: {
						type: 'number',
						key: spec.key,
						min: spec.min,
						max: spec.max,
						step: spec.step ?? 1,
						validate: (value) => {
							if (!Number.isFinite(value)) return 'Enter a number.';
							if (value < spec.min || value > spec.max) {
								return `Enter a number between ${spec.min} and ${spec.max}.`;
							}
							return;
						},
					},
				};
			case 'text':
				return {
					name: spec.name,
					desc: spec.desc,
					control: {
						type: 'text',
						key: spec.key,
						placeholder: spec.placeholder,
					},
				};
			case 'toggle':
				return {
					name: spec.name,
					desc: spec.desc,
					control: { type: 'toggle', key: spec.key },
				};
			case 'dropdown':
				return {
					name: spec.name,
					desc: spec.desc,
					control: {
						type: 'dropdown',
						key: spec.key,
						options: spec.options,
					},
				};
		}
	}

	private maintenanceDefinition(): SettingDefinitionGroup {
		const { baseTag, newCardsPerDay, reviewsPerDay } = this.host.settings;
		return {
			type: 'group',
			heading: 'Maintenance',
			items: [
				{
					name: 'Reset settings',
					desc: 'Restore all scheduling and tag defaults. Cards and review data are untouched.',
					action: () => {
						void this.reset();
					},
				},
				{
					name: 'Review data format',
					desc: 'Schedules are stored in a hidden comment immediately below each card, like <!-- fc-srs {"v":1,"id":"a1b2c3","cards":{"fwd":{...}}} -->. Do not move the line away from its card; malformed data is treated as a new card.',
				},
				{
					name: 'Current limits',
					desc: `Base tag: #${baseTag} · New/day: ${newCardsPerDay} · Reviews/day: ${reviewsPerDay}`,
				},
			],
		};
	}

	// --- Imperative fallback (Obsidian < 1.13) ---------------------------------

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'Cards live in your notes. Review data is written below each card as a hidden comment.',
		});

		for (const group of SETTINGS_GROUPS) this.renderGroup(group);
		this.renderMaintenance();
	}

	private renderGroup(group: SettingGroupSpec): void {
		new Setting(this.containerEl).setName(group.heading).setHeading();
		for (const spec of group.items) {
			const setting = new Setting(this.containerEl).setName(spec.name).setDesc(spec.desc);
			switch (spec.kind) {
				case 'number':
					this.renderNumber(setting, spec);
					break;
				case 'text':
					this.renderText(setting, spec);
					break;
				case 'toggle':
					setting.addToggle((toggle) =>
						toggle.setValue(this.readBoolean(spec.key)).onChange((value) => {
							this.setControlValue(spec.key, value);
						}),
					);
					break;
				case 'dropdown':
					this.renderDropdown(setting, spec);
					break;
			}
		}
	}

	private renderNumber(setting: Setting, spec: NumberSettingSpec): void {
		setting.addText((text) => {
			text.inputEl.type = 'number';
			text.inputEl.min = String(spec.min);
			text.inputEl.max = String(spec.max);
			text.inputEl.step = String(spec.step ?? 1);
			text.setValue(String(this.read(spec.key))).onChange((value) => {
				this.setControlValue(spec.key, value);
			});
		});
	}

	private renderText(setting: Setting, spec: TextSettingSpec): void {
		setting.addText((text) => {
			if (spec.placeholder) text.setPlaceholder(spec.placeholder);
			text.setValue(textValue(this.read(spec.key))).onChange((value) => {
				this.setControlValue(spec.key, value);
			});
		});
	}

	private renderDropdown(setting: Setting, spec: DropdownSettingSpec): void {
		setting.addDropdown((dropdown) => {
			for (const [value, label] of Object.entries(spec.options)) {
				dropdown.addOption(value, label);
			}
			dropdown.setValue(textValue(this.read(spec.key))).onChange((value) => {
				this.setControlValue(spec.key, value);
			});
		});
	}

	private renderMaintenance(): void {
		const { containerEl } = this;
		new Setting(containerEl).setName('Maintenance').setHeading();

		new Setting(containerEl)
			.setName('Reset settings')
			.setDesc(
				'Restore all scheduling and tag defaults. Cards and review data are untouched.',
			)
			.addButton((button) =>
				button.setButtonText('Reset').onClick(async () => {
					await this.host.resetSettings();
					this.display();
				}),
			);

		const info = containerEl.createEl('details');
		info.createEl('summary', { text: 'Review data format' });
		info.createEl('p', {
			cls: 'setting-item-description',
			text: 'Schedules are stored in a hidden comment immediately below each card. Do not move the line away from its card; malformed data is treated as a new card.',
		});
		info.createEl('pre').createEl('code', {
			text: '<!-- fc-srs {"v":1,"id":"a1b2c3","cards":{"fwd":{...}}} -->',
		});

		const { baseTag, newCardsPerDay, reviewsPerDay } = this.host.settings;
		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text: `Base tag: #${baseTag} · New/day: ${newCardsPerDay} · Reviews/day: ${reviewsPerDay}`,
		});
	}

	// --- Shared helpers --------------------------------------------------------

	private read(key: string): unknown {
		return (this.host.settings as unknown as Record<string, unknown>)[key];
	}

	private readBoolean(key: string): boolean {
		return this.read(key) === true;
	}

	private async reset(): Promise<void> {
		await this.host.resetSettings();
		// `update()` is declarative-settings only (Obsidian 1.13+); older
		// versions still render through `display()`.
		if (typeof this.update === 'function') {
			this.update();
		} else {
			this.display();
		}
	}
}
