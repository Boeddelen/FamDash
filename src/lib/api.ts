import { toast } from './toast';

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

/** JSON fetch helper. Throws ApiError; surfaces a toast on failure unless told not to. */
export async function api<T = unknown>(
	path: string,
	opts: RequestInit & { quiet?: boolean } = {}
): Promise<T> {
	const { quiet, ...init } = opts;
	const res = await fetch(path, {
		...init,
		headers: {
			...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
			...init.headers
		}
	});
	const text = await res.text();
	const data = text ? JSON.parse(text) : null;
	if (!res.ok) {
		const message = data?.message ?? res.statusText;
		if (!quiet && res.status !== 401) toast(message, 'error');
		throw new ApiError(res.status, message);
	}
	return data as T;
}
