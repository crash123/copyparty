/* copyparty modern ui -- tiny dom / format helpers */

export function esc(s) {
	return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
		return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
	});
}

export function el(tag, attrs, html) {
	const n = document.createElement(tag);
	if (attrs)
		for (const k in attrs) {
			if (k === "class") n.className = attrs[k];
			else if (k === "text") n.textContent = attrs[k];
			else if (k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]);
			else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
		}
	if (html != null) n.innerHTML = html;
	return n;
}

export function qs(sel, root) {
	return (root || document).querySelector(sel);
}

export function qsa(sel, root) {
	return Array.prototype.slice.call((root || document).querySelectorAll(sel));
}

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export function fmtSize(n) {
	n = Number(n) || 0;
	if (n < 1024) return n + " B";
	let i = 0;
	while (n >= 1024 && i < UNITS.length - 1) {
		n /= 1024;
		i++;
	}
	return (n < 10 ? n.toFixed(1) : Math.round(n)) + " " + UNITS[i];
}

export function fmtDate(ts) {
	if (!ts) return "";
	const d = new Date(ts * 1000);
	const now = new Date();
	const sameYear = d.getFullYear() === now.getFullYear();
	const opt = sameYear
		? { month: "short", day: "numeric" }
		: { year: "numeric", month: "short", day: "numeric" };
	return d.toLocaleDateString(undefined, opt);
}

export function fmtDateTime(ts) {
	if (!ts) return "";
	return new Date(ts * 1000).toLocaleString();
}

export function debounce(fn, ms) {
	let t = null;
	return function () {
		const args = arguments,
			self = this;
		clearTimeout(t);
		t = setTimeout(function () {
			fn.apply(self, args);
		}, ms);
	};
}

/** category of a file, used for icon + preview decisions */
export function fileKind(name, isDir) {
	if (isDir) return "dir";
	const ext = (name.split(".").pop() || "").toLowerCase();
	if (/(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?|heic)$/.test(ext)) return "image";
	if (/(mp4|webm|mkv|mov|avi|m4v|ogv)$/.test(ext)) return "video";
	if (/(mp3|flac|ogg|opus|wav|m4a|aac|wma)$/.test(ext)) return "audio";
	if (/(zip|tar|gz|bz2|xz|7z|rar|zst)$/.test(ext)) return "archive";
	if (/(md|markdown)$/.test(ext)) return "markdown";
	if (/(txt|log|ini|conf|cfg|yml|yaml|json|xml|csv|tsv)$/.test(ext)) return "text";
	if (
		/(js|mjs|ts|jsx|tsx|py|rb|go|rs|c|h|cpp|hpp|java|kt|php|sh|bash|zsh|css|scss|html?|sql|lua|pl|swift|toml|nix)$/.test(
			ext
		)
	)
		return "code";
	if (/pdf$/.test(ext)) return "pdf";
	return "file";
}

export function canPreview(kind) {
	return ["image", "video", "audio", "markdown", "text", "code", "pdf"].indexOf(kind) !== -1;
}

/** join a url with a query param the safe way */
export function addq(url, q) {
	return url + (url.indexOf("?") === -1 ? "?" : "&") + q;
}
