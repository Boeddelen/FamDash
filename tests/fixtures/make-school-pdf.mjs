/**
 * Generate tiny, valid PDFs used as fixtures for the PDF import pipeline. No
 * dependencies.
 *
 *  - school-calendar.pdf    one page — the happy path
 *  - school-newsletter.pdf  twelve pages — the one that matters for Android, where
 *                           rasterising a whole document at once is what exhausts
 *                           canvas memory on a cheap tablet
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const lines = [
	'Skoleruta 2025/2026 - Bjorkelia skole',
	'',
	'Skolestart for elevene: mandag 18.08.2025',
	'Hostferie: uke 40',
	'Planleggingsdag - skolen er stengt 13.10.2025',
	'Foreldremote 5. trinn 3. september kl. 18:00-19:30',
	'FN-dagen markeres 24.10.2025',
	'Siste skoledag for jul: fredag 19.12.2025',
	'Forste skoledag i 2026: 05.01.2026',
	'Vinterferie uke 9',
	'Paskeferie 30.03 - 06.04.2026',
	'Sommeravslutning 19.06.2026 kl. 09:00',
	'',
	'Kontakt: post@bjorkelia.no  -  www.bjorkelia.no  -  Side 1'
];

const esc = (s) => s.replace(/([()\\])/g, '\\$1');
let y = 780;
const textOps = lines
	.map((l) => {
		const op = `BT /F1 11 Tf 54 ${y} Td (${esc(l)}) Tj ET`;
		y -= 22;
		return op;
	})
	.join('\n');

/** Build a PDF of `n` pages, each with a heading so a rendered page is identifiable. */
function build(n, heading) {
	// Object layout: 1 catalog, 2 pages tree, then per page a /Page and a content
	// stream, and finally the shared font.
	const pageIds = Array.from({ length: n }, (_, i) => 3 + i * 2);
	const fontId = 3 + n * 2;
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${n} >>`
	];
	for (let i = 0; i < n; i++) {
		const ops =
			n === 1
				? textOps
				: `BT /F1 20 Tf 54 780 Td (${esc(`${heading} - side ${i + 1} av ${n}`)}) Tj ET`;
		objects.push(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`
		);
		objects.push(`<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`);
	}
	objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

	let pdf = '%PDF-1.4\n';
	const offsets = [];
	objects.forEach((body, i) => {
		offsets.push(pdf.length);
		pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
	});
	const xrefStart = pdf.length;
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
	return pdf;
}

for (const [name, pages, heading] of [
	['school-calendar.pdf', 1, 'Skoleruta'],
	['school-newsletter.pdf', 12, 'Manedsbrev']
]) {
	const pdf = build(pages, heading);
	const out = join(import.meta.dirname, name);
	writeFileSync(out, pdf, 'latin1');
	console.log('wrote', out, `(${pages} pages, ${pdf.length} bytes)`);
}
