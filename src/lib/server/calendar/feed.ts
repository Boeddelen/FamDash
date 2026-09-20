import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db';
import { choreInstances, chores, members } from '../db/schema';
import { addDays, isoDate, parseIsoDate } from '../date';

const fold = (line: string) =>
	line.length <= 74 ? line : line.replace(/(.{74})/g, '$1\r\n ');
const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const dateOnly = (iso: string) => iso.replace(/-/g, '');

/** Build a public .ics document of upcoming chores. */
export async function buildFeed(): Promise<string> {
	const today = isoDate(new Date());
	const horizon = isoDate(addDays(new Date(), 120));

	const instances = await db
		.select({
			inst: choreInstances,
			chore: chores,
			member: members
		})
		.from(choreInstances)
		.innerJoin(chores, eq(chores.id, choreInstances.choreId))
		.leftJoin(members, eq(members.id, chores.assignedMemberId))
		.where(and(gte(choreInstances.dueDate, today), inArray(choreInstances.status, ['todo', 'done'])));

	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Family Dashboard//Feed//EN',
		'CALSCALE:GREGORIAN',
		'X-WR-CALNAME:Family Dashboard'
	];

	for (const { inst, chore, member } of instances) {
		if (inst.dueDate > horizon) continue;
		const day = dateOnly(inst.dueDate);
		const who = member ? ` (${member.name})` : '';
		const check = inst.status === 'done' ? '✅ ' : '🧹 ';
		lines.push('BEGIN:VEVENT');
		lines.push(`UID:chore-${inst.id}@family-dashboard`);
		lines.push(`DTSTAMP:${stamp(new Date())}`);
		if (chore.time) {
			const [h, m] = chore.time.split(':').map(Number);
			const endMinutes = h * 60 + m + 30; // nominal 30-minute block
			const endH = Math.floor(endMinutes / 60) % 24;
			const endM = endMinutes % 60;
			const pad = (n: number) => String(n).padStart(2, '0');
			lines.push(`DTSTART:${day}T${pad(h)}${pad(m)}00`);
			lines.push(`DTEND:${day}T${pad(endH)}${pad(endM)}00`);
		} else {
			const next = dateOnly(isoDate(addDays(parseIsoDate(inst.dueDate), 1)));
			lines.push(`DTSTART;VALUE=DATE:${day}`);
			lines.push(`DTEND;VALUE=DATE:${next}`);
		}
		lines.push(fold(`SUMMARY:${check}${esc(chore.title + who)}`));
		lines.push('END:VEVENT');
	}

	lines.push('END:VCALENDAR');
	return lines.join('\r\n');
}
