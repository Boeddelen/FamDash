import { GOOGLE_AUTH_URL, GOOGLE_SCOPE, GOOGLE_TOKEN_URL } from './types';

/** Build the Google consent URL. redirectUri must match the OAuth client config. */
export function googleAuthUrl(clientId: string, redirectUri: string, state: string): string {
	const u = new URL(GOOGLE_AUTH_URL);
	u.searchParams.set('client_id', clientId);
	u.searchParams.set('redirect_uri', redirectUri);
	u.searchParams.set('response_type', 'code');
	u.searchParams.set('scope', GOOGLE_SCOPE);
	u.searchParams.set('access_type', 'offline');
	u.searchParams.set('prompt', 'consent');
	u.searchParams.set('state', state);
	return u.toString();
}

/** Exchange an authorization code for tokens; returns the long-lived refresh token. */
export async function exchangeGoogleCode(
	clientId: string,
	clientSecret: string,
	code: string,
	redirectUri: string
): Promise<{ refreshToken: string }> {
	const res = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			grant_type: 'authorization_code',
			redirect_uri: redirectUri
		})
	});
	const data = (await res.json()) as { refresh_token?: string; error?: string };
	if (!res.ok || !data.refresh_token) {
		throw new Error(`Google token exchange failed: ${data.error ?? res.status}`);
	}
	return { refreshToken: data.refresh_token };
}
