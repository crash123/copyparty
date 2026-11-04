/* copyparty modern ui -- translations
 *
 * English strings are the keys, so a missing translation degrades to english
 * instead of a placeholder. Only the languages below are shipped; copyparty's
 * own ~30 translations cover the classic ui, not this one.
 */

const DE = {
	"New folder": "Neuer Ordner",
	"New file": "Neue Datei",
	Upload: "Hochladen",
	"Uploading": "Wird hochgeladen",
	"Upload files": "Dateien hochladen",
	"Upload failed: ": "Upload fehlgeschlagen: ",
	"Cancel upload": "Upload abbrechen",
	"Retry upload": "Upload wiederholen",
	Retry: "Wiederholen",
	"Search files and folders": "Dateien und Ordner durchsuchen",
	Clear: "Leeren",
	"Toggle grid or list view": "Raster- oder Listenansicht",
	"Toggle dark or light theme": "Helles oder dunkles Farbschema",
	"Toggle folder sidebar": "Ordnerleiste umschalten",
	"Toggle theme": "Farbschema umschalten",
	Account: "Konto",
	"Account and sign in": "Konto und Anmeldung",
	Download: "Herunterladen",
	"Download .zip": "Als .zip herunterladen",
	Move: "Verschieben",
	"Move to…": "Verschieben nach…",
	Delete: "Löschen",
	Rename: "Umbenennen",
	Open: "Öffnen",
	"Open folder": "Ordner öffnen",
	"Edit text": "Text bearbeiten",
	"Share link": "Link teilen",
	Share: "Teilen",
	Save: "Speichern",
	Cancel: "Abbrechen",
	Close: "Schließen",
	Create: "Erstellen",
	"Create link": "Link erstellen",
	Name: "Name",
	Size: "Größe",
	Date: "Datum",
	Type: "Typ",
	Modified: "Geändert",
	Tags: "Tags",
	Folders: "Ordner",
	Home: "Start",
	Files: "Dateien",
	"Folder name": "Ordnername",
	"File name": "Dateiname",
	"New name": "Neuer Name",
	"Destination folder": "Zielordner",
	"Password (optional)": "Passwort (optional)",
	Expires: "Läuft ab",
	never: "nie",
	Username: "Benutzername",
	Password: "Passwort",
	"Sign in": "Anmelden",
	"Sign out": "Abmelden",
	"Signed in as": "Angemeldet als",
	Saved: "Gespeichert",
	Renamed: "Umbenannt",
	Moved: "Verschoben",
	Deleted: "Gelöscht",
	Created: "Erstellt",
	selected: "ausgewählt",
	clear: "zurücksetzen",
	"Empty folder": "Leerer Ordner",
	"Nothing here yet": "Noch nichts vorhanden",
	"Drop files anywhere to upload them.": "Dateien zum Hochladen hier ablegen.",
	"No matches": "Keine Treffer",
	"In this folder": "In diesem Ordner",
	"Everywhere on this server": "Überall auf diesem Server",
	results: "Ergebnisse",
	result: "Ergebnis",
	"Searching…": "Suche läuft…",
	"searching the whole server…": "der ganze Server wird durchsucht…",
	"Search failed: ": "Suche fehlgeschlagen: ",
	waiting: "wartet",
	done: "fertig",
	"done (resumed)": "fertig (fortgesetzt)",
	"done (already on server)": "fertig (schon auf dem Server)",
	cancelled: "abgebrochen",
	failed: "fehlgeschlagen",
	"Show more (": "Mehr anzeigen (",
	"remaining)": "verbleibend)",
	item: "Element",
	items: "Elemente",
	folder: "Ordner",
	folders: "Ordner",
	file: "Datei",
	files: "Dateien",
	"File contents": "Dateiinhalt",
	"Editing ": "Bearbeite ",
	"Include the extension, for example .md or .txt":
		"Mit Dateiendung, zum Beispiel .md oder .txt",
	"Absolute path on this server. The name is kept.":
		"Absoluter Pfad auf diesem Server. Der Name bleibt erhalten.",
	"Password cannot be blank": "Das Passwort darf nicht leer sein",
	"Link copied": "Link kopiert",
	"Press Ctrl/Cmd-C to copy": "Mit Strg/Cmd-C kopieren",
	"Save failed: ": "Speichern fehlgeschlagen: ",
	"Rename failed: ": "Umbenennen fehlgeschlagen: ",
	"Move failed: ": "Verschieben fehlgeschlagen: ",
	"Could not create folder: ": "Ordner konnte nicht erstellt werden: ",
	"Could not create file: ": "Datei konnte nicht erstellt werden: ",
	"Could not create share: ": "Freigabe konnte nicht erstellt werden: ",
	"Could not open file: ": "Datei konnte nicht geöffnet werden: ",
	"Could not load this folder": "Dieser Ordner konnte nicht geladen werden",
	"Sign-in failed: ": "Anmeldung fehlgeschlagen: ",
	"The file changed on the server; reopen it and try again":
		"Die Datei wurde auf dem Server geändert; bitte erneut öffnen",
	"No inline preview for this file type.":
		"Für diesen Dateityp gibt es keine Vorschau.",
	"loading…": "lädt…",
	"Are you sure": "Sicher",
	"This permanently deletes:": "Endgültig gelöscht wird:",
	"Folders are deleted recursively.": "Ordner werden samt Inhalt gelöscht.",
	"Creates a read-only link. You can add a password and an expiry.":
		"Erstellt einen Link mit Leserechten. Passwort und Ablauf sind optional.",
	"Share created. Anyone with this link can read it.":
		"Freigabe erstellt. Jeder mit diesem Link kann lesen.",
	Link: "Link",
	Language: "Sprache",
	"Sort direction": "Sortierrichtung",
	"You cannot move a folder into itself": "Ein Ordner kann nicht in sich selbst verschoben werden",
	"1 hour": "1 Stunde",
	"1 day": "1 Tag",
	"1 week": "1 Woche",
	"Global search needs the server's file index; on this server only the current folder can be searched.":
		"Die globale Suche braucht den Dateiindex des Servers; hier wird nur der aktuelle Ordner durchsucht.",
	"resumable uploads need https (or localhost)":
		"fortsetzbare Uploads brauchen https (oder localhost)",
	hashing: "Hashen",
};

const DICTS = { eng: {}, deu: DE };

let LANG = "eng";

export function langs() {
	return Object.keys(DICTS);
}

export function curLang() {
	return LANG;
}

/** translate; vars replace {name} placeholders */
export function t(s, vars) {
	const d = DICTS[LANG] || {};
	let out = Object.prototype.hasOwnProperty.call(d, s) ? d[s] : s;
	if (vars)
		out = out.replace(/\{(\w+)\}/g, function (m, k) {
			return vars[k] != null ? String(vars[k]) : m;
		});
	return out;
}

export function setLang(code) {
	LANG = DICTS[code] ? code : "eng";
	try {
		document.cookie = "cplng=" + LANG + ";path=/;max-age=31536000;samesite=lax";
	} catch (e) {}
	return LANG;
}

/** pick the language the classic ui would use: page var, cookie, browser */
export function initLang() {
	let code = typeof globalThis.lang === "string" ? globalThis.lang : "";
	if (!code) {
		const m = (document.cookie || "").match(/(?:^|;\s*)cplng=([^;]+)/);
		if (m) code = decodeURIComponent(m[1]);
	}
	if (!code && navigator.language) {
		code = navigator.language.toLowerCase().slice(0, 3).replace("-", "");
		if (code === "ger") code = "deu";
	}
	if (DICTS[code] && code !== "eng") LANG = code;
	else LANG = "eng";
	return LANG;
}
