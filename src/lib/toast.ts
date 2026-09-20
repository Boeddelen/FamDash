import { writable } from 'svelte/store';

export type Toast = { id: number; message: string; kind: 'info' | 'error' | 'ok' };

export const toasts = writable<Toast[]>([]);

export function toast(message: string, kind: Toast['kind'] = 'info', ms = 3200) {
	const id = Date.now() + Math.random();
	toasts.update((t) => [...t, { id, message, kind }]);
	setTimeout(() => toasts.update((t) => t.filter((x) => x.id !== id)), ms);
}
