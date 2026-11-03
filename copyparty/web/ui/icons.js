/* copyparty modern ui -- inline svg icon set (stroke, currentColor) */

const P = {
	folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h7A1.5 1.5 0 0 1 19 9.5v7A1.5 1.5 0 0 1 17.5 18h-13A1.5 1.5 0 0 1 3 16.5z"/>',
	file: '<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4"/>',
	image:
		'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-6 6"/>',
	video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
	audio:
		'<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
	archive:
		'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v4m0 2v2m0 2v2"/>',
	code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',
	pdf: '<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4"/><path d="M9 15h6"/>',
	text: '<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h4"/>',
	upload: '<path d="M12 16V4m0 0 4 4m-4-4L8 8"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
	search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
	grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
	list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
	moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	trash: '<path d="M4 7h16M10 11v6m4-6v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
	edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/>',
	download: '<path d="M12 4v12m0 0 4-4m-4 4-4-4"/><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/>',
	more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
	chevron: '<path d="m9 6 6 6-6 6"/>',
	close: '<path d="M6 6l12 12M18 6 6 18"/>',
	check: '<path d="m5 13 4 4L19 7"/>',
	user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
	login: '<path d="M15 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4"/><path d="M10 17l5-5-5-5M15 12H3"/>',
	logout: '<path d="M9 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
	refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
	"folder-plus": '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h7A1.5 1.5 0 0 1 19 9.5v7A1.5 1.5 0 0 1 17.5 18h-13A1.5 1.5 0 0 1 3 16.5z"/><path d="M11 12h4m-2-2v4"/>',
	home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
	play: '<path d="m7 4 13 8-13 8z"/>',
	info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
	shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
};

export function icon(name, size) {
	const d = P[name] || P.file;
	return (
		'<svg class="cpm-ico" viewBox="0 0 24 24" width="' +
		(size || 20) +
		'" height="' +
		(size || 20) +
		'" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
		d +
		"</svg>"
	);
}

export function kindIcon(kind) {
	if (kind === "dir") return icon("folder", 22);
	if (kind === "image") return icon("image", 22);
	if (kind === "video") return icon("video", 22);
	if (kind === "audio") return icon("audio", 22);
	if (kind === "archive") return icon("archive", 22);
	if (kind === "code") return icon("code", 22);
	if (kind === "markdown" || kind === "text") return icon("text", 22);
	if (kind === "pdf") return icon("pdf", 22);
	return icon("file", 22);
}
