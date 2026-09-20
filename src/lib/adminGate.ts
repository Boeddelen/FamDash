import { writable } from 'svelte/store';
import { invalidateAll } from '$app/navigation';
import { api, ApiError } from './api';
import { toast } from './toast';

type Pending = { resolve: (ok: boolean) => void } | null;
export const adminPrompt = writable<Pending>(null);

/** Open the admin sign-in modal; resolves true once elevated, false if cancelled. */
export function ensureAdmin(): Promise<boolean> {
	return new Promise((resolve) => adminPrompt.set({ resolve }));
}

/**
 * Call an admin-gated endpoint. On 401 it prompts for sign-in and retries once.
 */
export async function apiAdmin<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
	try {
		return await api<T>(path, { ...opts, quiet: true });
	} catch (err) {
		if (err instanceof ApiError && err.status === 401) {
			const ok = await ensureAdmin();
			if (!ok) throw err;
			await invalidateAll();
			return api<T>(path, opts);
		}
		if (err instanceof ApiError) toast(err.message, 'error');
		throw err;
	}
}
