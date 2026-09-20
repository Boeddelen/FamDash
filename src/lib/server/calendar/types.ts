export type CalDavCredentials = { serverUrl: string; username: string; password: string };
export type GoogleCredentials = {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
};
export type IcsCredentials = { url: string };

export type AnyCredentials = CalDavCredentials | GoogleCredentials | IcsCredentials;

export type ConnectionConfig = {
	/** Remote calendar URLs (hrefs) the user has enabled for display. Empty = all. */
	calendars?: string[];
	/** Which remote calendar new events are written to (CalDAV/Google only). */
	writeTarget?: string;
};

export type RemoteCalendar = { url: string; displayName: string; color?: string };

export type NormalizedEvent = {
	uid: string;
	title: string;
	start: number; // unix seconds
	end: number;
	allDay: boolean;
	location?: string;
	description?: string;
};

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_CALDAV_URL = 'https://apidata.googleusercontent.com/caldav/v2/';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar';
export const ICLOUD_CALDAV_URL = 'https://caldav.icloud.com';
