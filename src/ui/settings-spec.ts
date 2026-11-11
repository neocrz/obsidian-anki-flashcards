/**
 * Declarative description of the settings UI.
 *
 * The list is the single source of truth for both the classic `display()`
 * renderer (Obsidian < 1.13) and the declarative `getSettingDefinitions()`
 * API (Obsidian >= 1.13) used for settings search.
 */

export type NumericSettingKey =
	| 'graduatingInterval'
	| 'easyInterval'
	| 'startingEase'
	| 'minimumEase'
	| 'hardIntervalFactor'
	| 'easyBonus'
	| 'intervalModifier'
	| 'lapseMultiplier'
	| 'maximumInterval'
	| 'leechThreshold'
	| 'newCardsPerDay'
	| 'reviewsPerDay';

export type TextSettingKey = 'baseTag' | 'learningSteps' | 'relearningSteps';
export type ToggleSettingKey = 'fuzz';
export type DropdownSettingKey = 'leechAction';

export interface NumberSettingSpec {
	kind: 'number';
	key: NumericSettingKey;
	name: string;
	desc: string;
	min: number;
	max: number;
	step?: number;
}

export interface TextSettingSpec {
	kind: 'text';
	key: TextSettingKey;
	name: string;
	desc: string;
	placeholder?: string;
}

export interface ToggleSettingSpec {
	kind: 'toggle';
	key: ToggleSettingKey;
	name: string;
	desc: string;
}

export interface DropdownSettingSpec {
	kind: 'dropdown';
	key: DropdownSettingKey;
	name: string;
	desc: string;
	options: Record<string, string>;
}

export type SettingSpec =
	NumberSettingSpec | TextSettingSpec | ToggleSettingSpec | DropdownSettingSpec;

export interface SettingGroupSpec {
	heading: string;
	items: SettingSpec[];
}

export const SETTINGS_GROUPS: SettingGroupSpec[] = [
	{
		heading: 'Decks and limits',
		items: [
			{
				kind: 'text',
				key: 'baseTag',
				name: 'Base tag',
				desc: 'Tag that opts a note in. Subtags name decks, e.g. #fc/japanese.',
				placeholder: 'fc',
			},
			{
				kind: 'number',
				key: 'newCardsPerDay',
				name: 'New cards per day',
				desc: 'Per deck subtree.',
				min: 0,
				max: 10000,
			},
			{
				kind: 'number',
				key: 'reviewsPerDay',
				name: 'Reviews per day',
				desc: 'Per deck subtree.',
				min: 0,
				max: 100000,
			},
		],
	},
	{
		heading: 'Learning',
		items: [
			{
				kind: 'text',
				key: 'learningSteps',
				name: 'Learning steps',
				desc: 'Whitespace-separated steps, e.g. 1m 10m. Units: m, h, d, w.',
				placeholder: '1m 10m',
			},
			{
				kind: 'text',
				key: 'relearningSteps',
				name: 'Relearning steps',
				desc: 'Steps after a lapse, e.g. 10m.',
				placeholder: '10m',
			},
			{
				kind: 'number',
				key: 'graduatingInterval',
				name: 'Graduating interval',
				desc: 'Days when a learning card graduates with Good.',
				min: 1,
				max: 36500,
			},
			{
				kind: 'number',
				key: 'easyInterval',
				name: 'Easy interval',
				desc: 'Days when a new card is answered Easy.',
				min: 1,
				max: 36500,
			},
		],
	},
	{
		heading: 'Review algorithm',
		items: [
			{
				kind: 'number',
				key: 'startingEase',
				name: 'Starting ease',
				desc: 'Percent for new cards.',
				min: 100,
				max: 1000,
			},
			{
				kind: 'number',
				key: 'minimumEase',
				name: 'Minimum ease',
				desc: 'Percent floor after lapses and Hard answers.',
				min: 100,
				max: 1000,
			},
			{
				kind: 'number',
				key: 'hardIntervalFactor',
				name: 'Hard interval factor',
				desc: 'Multiplier for Hard on review cards.',
				min: 1,
				max: 10,
				step: 0.05,
			},
			{
				kind: 'number',
				key: 'easyBonus',
				name: 'Easy bonus',
				desc: 'Extra multiplier for Easy.',
				min: 1,
				max: 10,
				step: 0.05,
			},
			{
				kind: 'number',
				key: 'intervalModifier',
				name: 'Interval modifier',
				desc: 'Global multiplier for Hard/Good/Easy intervals.',
				min: 0.1,
				max: 10,
				step: 0.05,
			},
			{
				kind: 'number',
				key: 'lapseMultiplier',
				name: 'Lapse multiplier',
				desc: 'Fraction of the old interval after relearning. 0 means 1 day.',
				min: 0,
				max: 10,
				step: 0.05,
			},
			{
				kind: 'number',
				key: 'maximumInterval',
				name: 'Maximum interval',
				desc: 'Days. Anki default is 36500.',
				min: 1,
				max: 365000,
			},
			{
				kind: 'number',
				key: 'leechThreshold',
				name: 'Leech threshold',
				desc: 'Lapses before a card is marked as a leech.',
				min: 1,
				max: 100,
			},
			{
				kind: 'dropdown',
				key: 'leechAction',
				name: 'Leech action',
				desc: 'What to do when a card reaches the leech threshold.',
				options: { tag: 'Mark only', suspend: 'Suspend' },
			},
			{
				kind: 'toggle',
				key: 'fuzz',
				name: 'Interval fuzz',
				desc: 'Add deterministic jitter to day intervals to avoid review spikes.',
			},
		],
	},
];

const SPECS_BY_KEY = new Map<string, SettingSpec>(
	SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => [item.key, item])),
);

export function findSettingSpec(key: string): SettingSpec | undefined {
	return SPECS_BY_KEY.get(key);
}
