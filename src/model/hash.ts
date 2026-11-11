/** Deterministic 32-bit FNV-1a. Stable across runtimes. */
export function hashString(value: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export function hashToBase36(value: string): string {
	return hashString(value).toString(36);
}

export function createBlockId(signature: string, occurrence: number): string {
	return `${hashToBase36(signature)}-${occurrence}`;
}
