/** Local-time day key (YYYY-MM-DD). Pure and timezone-aware. */
export function localDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function isValidDate(date: Date): boolean {
	return !Number.isNaN(date.getTime());
}

export function parseIsoDate(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.length === 0) return undefined;
	const date = new Date(value);
	return isValidDate(date) ? date.toISOString() : undefined;
}

export function addMilliseconds(date: Date, milliseconds: number): Date {
	return new Date(date.getTime() + milliseconds);
}
