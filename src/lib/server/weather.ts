import { getHousehold, getSetting, setSetting } from './settings';

export type WeatherNow = {
	temperature: number;
	apparent: number;
	code: number;
	label: string;
	emoji: string;
	windSpeed: number;
	isDay: boolean;
};
export type WeatherHour = { time: string; temperature: number; code: number; emoji: string; precipProb: number };
export type WeatherDay = {
	date: string;
	tempMin: number;
	tempMax: number;
	code: number;
	label: string;
	emoji: string;
	precipProb: number;
	sunrise: string;
	sunset: string;
};
export type WeatherSnapshot = {
	label: string;
	fetchedAt: number;
	now: WeatherNow;
	hourly: WeatherHour[];
	daily: WeatherDay[];
};

// WMO weather interpretation codes → human label + emoji.
const WMO: Record<number, { label: string; emoji: string }> = {
	0: { label: 'Clear sky', emoji: '☀️' },
	1: { label: 'Mainly clear', emoji: '🌤️' },
	2: { label: 'Partly cloudy', emoji: '⛅' },
	3: { label: 'Overcast', emoji: '☁️' },
	45: { label: 'Fog', emoji: '🌫️' },
	48: { label: 'Rime fog', emoji: '🌫️' },
	51: { label: 'Light drizzle', emoji: '🌦️' },
	53: { label: 'Drizzle', emoji: '🌦️' },
	55: { label: 'Heavy drizzle', emoji: '🌧️' },
	56: { label: 'Freezing drizzle', emoji: '🌧️' },
	57: { label: 'Freezing drizzle', emoji: '🌧️' },
	61: { label: 'Light rain', emoji: '🌦️' },
	63: { label: 'Rain', emoji: '🌧️' },
	65: { label: 'Heavy rain', emoji: '🌧️' },
	66: { label: 'Freezing rain', emoji: '🌧️' },
	67: { label: 'Freezing rain', emoji: '🌧️' },
	71: { label: 'Light snow', emoji: '🌨️' },
	73: { label: 'Snow', emoji: '🌨️' },
	75: { label: 'Heavy snow', emoji: '❄️' },
	77: { label: 'Snow grains', emoji: '🌨️' },
	80: { label: 'Rain showers', emoji: '🌦️' },
	81: { label: 'Rain showers', emoji: '🌧️' },
	82: { label: 'Violent rain showers', emoji: '⛈️' },
	85: { label: 'Snow showers', emoji: '🌨️' },
	86: { label: 'Snow showers', emoji: '❄️' },
	95: { label: 'Thunderstorm', emoji: '⛈️' },
	96: { label: 'Thunderstorm + hail', emoji: '⛈️' },
	99: { label: 'Thunderstorm + hail', emoji: '⛈️' }
};
const wmo = (code: number) => WMO[code] ?? { label: 'Unknown', emoji: '❓' };

export type GeoResult = {
	name: string;
	country: string;
	admin1?: string;
	latitude: number;
	longitude: number;
	timezone: string;
};

/** Open-Meteo geocoding — used by the setup wizard / settings location picker. */
export async function geocode(query: string): Promise<GeoResult[]> {
	const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
	url.searchParams.set('name', query);
	url.searchParams.set('count', '8');
	url.searchParams.set('language', 'en');
	const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
	if (!res.ok) return [];
	const data = (await res.json()) as { results?: GeoResult[] };
	return data.results ?? [];
}

/** Fetch the current forecast for the household location and cache it. */
export async function refreshWeather(): Promise<WeatherSnapshot | null> {
	const house = await getHousehold();
	if (house.weatherLat == null || house.weatherLon == null) return null;

	const url = new URL('https://api.open-meteo.com/v1/forecast');
	url.searchParams.set('latitude', String(house.weatherLat));
	url.searchParams.set('longitude', String(house.weatherLon));
	url.searchParams.set('timezone', house.timezone || 'auto');
	url.searchParams.set(
		'current',
		'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day'
	);
	url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');
	url.searchParams.set(
		'daily',
		'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
	);
	url.searchParams.set('forecast_days', '7');

	const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
	if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
	const d = (await res.json()) as any;

	const nowCode = d.current.weather_code as number;
	const hourNow = Date.now();
	const hourly: WeatherHour[] = (d.hourly.time as string[])
		.map((time, i) => ({
			time,
			temperature: d.hourly.temperature_2m[i],
			code: d.hourly.weather_code[i],
			emoji: wmo(d.hourly.weather_code[i]).emoji,
			precipProb: d.hourly.precipitation_probability?.[i] ?? 0
		}))
		.filter((h) => new Date(h.time).getTime() >= hourNow - 3_600_000)
		.slice(0, 12);

	const daily: WeatherDay[] = (d.daily.time as string[]).map((date, i) => ({
		date,
		tempMin: d.daily.temperature_2m_min[i],
		tempMax: d.daily.temperature_2m_max[i],
		code: d.daily.weather_code[i],
		label: wmo(d.daily.weather_code[i]).label,
		emoji: wmo(d.daily.weather_code[i]).emoji,
		precipProb: d.daily.precipitation_probability_max?.[i] ?? 0,
		sunrise: d.daily.sunrise[i],
		sunset: d.daily.sunset[i]
	}));

	const snapshot: WeatherSnapshot = {
		label: house.weatherLabel ?? 'Home',
		fetchedAt: Math.floor(Date.now() / 1000),
		now: {
			temperature: d.current.temperature_2m,
			apparent: d.current.apparent_temperature,
			code: nowCode,
			label: wmo(nowCode).label,
			emoji: wmo(nowCode).emoji,
			windSpeed: d.current.wind_speed_10m,
			isDay: Boolean(d.current.is_day)
		},
		hourly,
		daily
	};

	await setSetting('weather', snapshot);
	return snapshot;
}

/** Cached snapshot for rendering; refreshes in the background when stale. */
export async function getWeather(): Promise<WeatherSnapshot | null> {
	const cached = await getSetting<WeatherSnapshot>('weather');
	const stale = !cached || Date.now() / 1000 - cached.fetchedAt > 3600;
	if (stale) {
		try {
			return (await refreshWeather()) ?? cached ?? null;
		} catch {
			return cached ?? null;
		}
	}
	return cached;
}
