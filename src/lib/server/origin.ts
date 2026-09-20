/**
 * The externally-reachable origin of the dashboard.
 *
 * adapter-node assumes https when no proxy header is present, so `event.url.origin`
 * is unreliable for a plain-http LAN deployment. We derive it from (in order):
 *   1. PUBLIC_ORIGIN env (set this if you put the dashboard behind TLS / a domain)
 *   2. the X-Forwarded-Proto + Host headers (reverse proxy)
 *   3. http + the Host header (the common self-hosted case)
 */
export function getPublicOrigin(request: Request): string {
	const configured = process.env.PUBLIC_ORIGIN;
	if (configured) return configured.replace(/\/$/, '');
	const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
	const proto = request.headers.get('x-forwarded-proto') ?? 'http';
	return `${proto}://${host}`;
}
