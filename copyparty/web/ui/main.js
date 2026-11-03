/* copyparty modern ui -- application
 *
 * A no-build-step enhancement layer: it mounts over the classic filebrowser,
 * reuses copyparty's own JSON endpoints, and leaves the original UI untouched
 * in the DOM (hidden) so that "?b=u" basic mode and the control panel keep
 * working.
 */

import * as api from "./api.js";
import {
	esc,
	el,
	qs,
	qsa,
	fmtSize,
	fmtDate,
	fmtDateTime,
	debounce,
	fileKind,
} from "./dom.js";
import { icon, kindIcon } from "./icons.js";

const doc = document;
const LS = (function () {
	try {
		return doc.defaultView.localStorage;
	} catch (e) {
		return null;
	}
})();

const state = {
	vp: "/",
	view: "grid",
	sort: { key: "name", dir: 1 },
	items: [],
	perms: [],
	acct: "*",
	cfg: {},
	sel: new Set(),
	anchor: -1,
	query: "",
	searching: false,
	hits: null,
	localHits: [],
	tree: new Map(),
	treeOpen: new Set(["/"]),
	uploads: [],
	loading: false,
	thumbsOK: null,
	menu: null,
};

/* ------------------------------------------------------------------ utils */

function store(k, v) {
	try {
		if (v === undefined) return LS ? LS.getItem("cpm-" + k) : null;
		if (v === null) LS && LS.removeItem("cpm-" + k);
		else LS && LS.setItem("cpm-" + k, v);
	} catch (e) {}
	return null;
}

function can(p) {
	return state.perms.indexOf(p) !== -1;
}

function itemByVp(vp) {
	for (let i = 0; i < state.items.length; i++)
		if (state.items[i].vp === vp) return state.items[i];
	return null;
}

function toast(msg, kind) {
	const host = qs("#cpm-toasts");
	const t = el("div", { class: "cpm-toast " + (kind || "") }, esc(msg));
	host.appendChild(t);
	requestAnimationFrame(function () {
		t.classList.add("in");
	});
	setTimeout(function () {
		t.classList.remove("in");
		setTimeout(function () {
			t.remove();
		}, 220);
	}, kind === "err" ? 6000 : 3200);
}

/* ------------------------------------------------------------------ shell */

const SHELL = `
<header class="cpm-top">
	<button class="cpm-icon-btn cpm-burger" data-act="menu" title="Folders"></button>
	<a class="cpm-brand" href="#" data-act="home">
		<span class="cpm-brand-mark"></span>
		<span class="cpm-brand-name">copyparty</span>
	</a>
	<nav class="cpm-crumbs" id="cpm-crumbs"></nav>
	<div class="cpm-actions">
		<div class="cpm-search">
			<span class="cpm-search-ico"></span>
			<input id="cpm-q" type="text" role="searchbox" placeholder="Search files and folders" autocomplete="off" spellcheck="false" />
			<button class="cpm-search-clear" data-act="clearq" title="Clear">${icon("close", 14)}</button>
		</div>
		<button class="cpm-icon-btn" data-act="view" id="cpm-view" title="Grid / list view"></button>
		<button class="cpm-icon-btn" data-act="theme" id="cpm-theme" title="Toggle theme"></button>
		<button class="cpm-btn cpm-accent" data-act="upload" id="cpm-upload-btn">${icon("upload", 16)}<span>Upload</span></button>
		<button class="cpm-icon-btn cpm-user" data-act="account" id="cpm-user" title="Account"></button>
	</div>
</header>
<aside class="cpm-side" id="cpm-side">
	<div class="cpm-side-head">
		<span>Folders</span>
		<button class="cpm-icon-btn sm" data-act="newdir" title="New folder">${icon("folder-plus", 16)}</button>
	</div>
	<div class="cpm-tree" id="cpm-tree"></div>
	<div class="cpm-side-foot" id="cpm-side-foot"></div>
</aside>
<main class="cpm-main" id="cpm-main">
	<div class="cpm-toolbar" id="cpm-toolbar"></div>
	<div class="cpm-scroll" id="cpm-scroll">
		<div class="cpm-files" id="cpm-files"></div>
	</div>
	<div class="cpm-status" id="cpm-status"></div>
</main>
<div class="cpm-drop" id="cpm-drop"><div class="cpm-drop-in">${icon(
	"upload",
	40
)}<b>Drop files to upload</b><span id="cpm-drop-dir"></span></div></div>
<section class="cpm-uploads" id="cpm-uploads"></section>
<div class="cpm-modal-host" id="cpm-modal"></div>
<div class="cpm-toasts" id="cpm-toasts"></div>
<input type="file" id="cpm-file" multiple hidden />
`;

function mount() {
	const root = el("div", { id: "cpm-root", class: "cpm" }, SHELL);
	// pick the palette before the node is attached, so the first paint is
	// already in the right theme instead of transitioning from the default
	applyTheme(store("theme") || "auto", root);
	doc.body.appendChild(root);
	doc.documentElement.classList.add("cpm-active");

	if (state.view === "list") doc.documentElement.classList.add("cpm-view-list");

	const mark = qs(".cpm-brand-mark");
	mark.innerHTML = icon("home", 18);
	qs(".cpm-search-ico").innerHTML = icon("search", 16);
	qs(".cpm-burger").innerHTML = icon("list", 18);
	qs("#cpm-view").innerHTML = icon(state.view === "grid" ? "list" : "grid", 18);

	bind();
}

/* --------------------------------------------------------------- theming */

function applyTheme(t, elRoot) {
	// keep the theme class on the ui root rather than on <html>: #cpm-root is a
	// fixed, composited layer, and toggling a class above it leaves its form
	// controls and icons painted with the previous theme in some browsers.
	const root = elRoot || qs("#cpm-root") || doc.documentElement;
	root.classList.remove("cpm-dark", "cpm-light");
	if (t === "auto") {
		const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
		root.classList.add(dark ? "cpm-dark" : "cpm-light");
	} else {
		root.classList.add("cpm-" + t);
	}
	const b = root.querySelector ? root.querySelector("#cpm-theme") : null;
	if (b) b.innerHTML = icon(t === "light" ? "sun" : "moon", 18);
	store("theme", t);
}

/* ------------------------------------------------------------ navigation */

function urlVp() {
	let p = doc.location.pathname;
	if (api.SR && p.indexOf(api.SR) === 0) p = p.slice(api.SR.length);
	try {
		p = decodeURIComponent(p);
	} catch (e) {}
	if (!p.startsWith("/")) p = "/" + p;
	if (p.length > 1 && !p.endsWith("/")) p += "/";
	return p;
}

async function navigate(vp, push) {
	state.vp = vp;
	state.sel.clear();
	state.anchor = -1;
	state.query = "";
	state.hits = null;
	state.searching = false;
	const qi = qs("#cpm-q");
	if (qi) qi.value = "";

	if (push !== false) {
		const url = api.vpUrl(vp);
		if (url !== doc.location.pathname + doc.location.search)
			window.history.pushState({ vp: vp }, "", url);
	}

	await refresh();
	loadTree(vp);
}

async function refresh() {
	state.loading = true;
	renderStatus();
	renderSkeleton();
	try {
		const r = await api.list(state.vp);
		state.perms = r.perms || [];
		state.acct = r.acct || "*";
		state.srvinf = r.srvinf || "";
		state.cfg = r.cfg || {};
		state.items = normalize(r);
		await probeThumbs();
		renderAll();
	} catch (e) {
		state.items = [];
		renderAll();
		renderError(e);
	} finally {
		state.loading = false;
		renderStatus();
	}
}

async function probeThumbs() {
	if (state.thumbsOK !== null) return;
	const first = state.items.filter(function (i) {
		return i.kind === "image";
	})[0];
	if (!first) return;
	try {
		const r = await fetch(api.thumbUrl(first.vp, 320), {
			method: "HEAD",
			credentials: "same-origin",
		});
		const ct = (r.headers.get("content-type") || "").toLowerCase();
		// copyparty replies with a generated svg placeholder when the server
		// has no thumbnail support (missing webdeps)
		state.thumbsOK = r.ok && ct.indexOf("svg") === -1;
	} catch (e) {
		state.thumbsOK = false;
	}
}

function normalize(r) {
	const out = [];
	const dirs = r.dirs || [];
	const files = r.files || [];
	for (let i = 0; i < dirs.length; i++) {
		const d = dirs[i];
		const name = (d.href || "").replace(/\/$/, "");
		if (!name) continue;
		out.push({
			name: name,
			vp: api.joinVp(state.vp, name),
			isDir: true,
			sz: d.sz || 0,
			ts: d.ts || 0,
			kind: "dir",
		});
	}
	for (let i = 0; i < files.length; i++) {
		const f = files[i];
		if (!f.href) continue;
		out.push({
			name: f.href,
			vp: api.joinVp(state.vp, f.href),
			isDir: false,
			sz: f.sz || 0,
			ts: f.ts || 0,
			kind: fileKind(f.href, false),
			tags: f.tags || null,
		});
	}
	return out;
}

/* --------------------------------------------------------------- renderer */

function renderAll() {
	renderCrumbs();
	renderToolbar();
	renderFiles();
	renderStatus();
	renderSideFoot();
	renderAccount();
	renderPerms();
	renderTree();
}

function renderPerms() {
	const up = qs("#cpm-upload-btn");
	if (up) up.style.display = can("write") ? "" : "none";
}

function renderSkeleton() {
	const f = qs("#cpm-files");
	f.className = "cpm-files";
	f.setAttribute("data-view", state.view);
	f.innerHTML =
		'<div class="cpm-skel">' +
		new Array(12).fill('<div class="cpm-skel-card"></div>').join("") +
		"</div>";
}

function renderCrumbs() {
	const box = qs("#cpm-crumbs");
	const parts = state.vp.split("/").filter(Boolean);
	let acc = "/";
	let html = '<a href="#" class="cpm-crumb" data-vp="/">' + icon("home", 15) + "</a>";
	parts.forEach(function (p, i) {
		acc += p + "/";
		html +=
			'<span class="cpm-crumb-sep">' +
			icon("chevron", 13) +
			"</span>" +
			'<a href="#" class="cpm-crumb' +
			(i === parts.length - 1 ? " cur" : "") +
			'" data-vp="' +
			esc(acc) +
			'" title="' +
			esc(p) +
			'">' +
			esc(p) +
			"</a>";
	});
	box.innerHTML = html;
}

function sorted() {
	const key = state.sort.key,
		dir = state.sort.dir;
	const arr = state.items.slice();
	arr.sort(function (a, b) {
		if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
		let v = 0;
		if (key === "name") v = a.name.localeCompare(b.name, undefined, { numeric: true });
		else if (key === "size") v = a.sz - b.sz;
		else if (key === "date") v = a.ts - b.ts;
		else if (key === "type")
			v = (a.kind + a.name).localeCompare(b.kind + b.name, undefined, { numeric: true });
		return v * dir;
	});
	return arr;
}

function renderToolbar() {
	const tb = qs("#cpm-toolbar");
	const sel = state.sel;
	const n = sel.size;

	if (n > 0) {
		tb.innerHTML =
			'<div class="cpm-selinfo"><b>' +
			n +
			"</b> selected" +
			'<button class="cpm-link" data-act="clearsel">clear</button></div>' +
			'<div class="cpm-grow"></div>' +
			(can("move") ? '<button class="cpm-btn" data-act="move">Move</button>' : "") +
			(can("delete") ? '<button class="cpm-btn danger" data-act="delete">Delete</button>' : "") +
			'<button class="cpm-btn" data-act="download">Download</button>';
		tb.classList.add("cpm-tb-sel");
		return;
	}
	tb.classList.remove("cpm-tb-sel");

	const dirs = state.items.filter(function (x) {
		return x.isDir;
	}).length;
	const files = state.items.length - dirs;
	const parts = [];
	if (dirs) parts.push(dirs + (dirs === 1 ? " folder" : " folders"));
	if (files) parts.push(files + (files === 1 ? " file" : " files"));
	if (!parts.length) parts.push("Empty folder");

	const sortOpts = [
		["name", "Name"],
		["size", "Size"],
		["date", "Date"],
		["type", "Type"],
	];

	tb.innerHTML =
		'<div class="cpm-tb-path" title="' +
		esc(state.vp) +
		'">' +
		esc(api.vpName(state.vp) === "/" ? "Home" : api.vpName(state.vp)) +
		"</div>" +
		'<div class="cpm-tb-count">' +
		esc(parts.join(" · ")) +
		"</div>" +
		'<div class="cpm-grow"></div>' +
		(can("write")
			? '<button class="cpm-btn" data-act="newdir">' + icon("folder-plus", 15) + "<span>New folder</span></button>"
			: "") +
		'<div class="cpm-sort">' +
		icon("list", 15) +
		'<select id="cpm-sortsel">' +
		sortOpts
			.map(function (o) {
				return (
					'<option value="' +
					o[0] +
					'"' +
					(state.sort.key === o[0] ? " selected" : "") +
					">" +
					o[1] +
					"</option>"
				);
			})
			.join("") +
		"</select>" +
		'<button class="cpm-icon-btn sm" data-act="sortdir" title="Sort direction">' +
		(state.sort.dir === 1 ? "↑" : "↓") +
		"</button>" +
		"</div>";
}

function renderFiles() {
	const f = qs("#cpm-files");
	f.setAttribute("data-view", state.view);

	if (state.searching || state.hits) return renderSearchResults();

	const items = sorted();
	if (!items.length) {
		f.className = "cpm-files";
		f.innerHTML =
			'<div class="cpm-empty">' +
			icon("folder", 44) +
			"<b>Nothing here yet</b>" +
			(can("write") ? "<span>Drop files anywhere to upload them.</span>" : "") +
			"</div>";
		return;
	}

	if (state.view === "grid") {
		f.className = "cpm-files cpm-grid";
		f.innerHTML = items.map(cardHtml).join("");
	} else {
		f.className = "cpm-files cpm-tablewrap";
		f.innerHTML = tableHtml(items);
	}
}

function cardHtml(it) {
	const sel = state.sel.has(it.vp) ? " sel" : "";
	let thumb;
	if (it.kind === "image" && state.thumbsOK) {
		thumb =
			'<img loading="lazy" src="' +
			esc(api.thumbUrl(it.vp, 320)) +
			'" alt="" onerror="this.remove()" />' +
			'<span class="cpm-thumb-ico">' +
			kindIcon(it.kind) +
			"</span>";
	} else {
		thumb = '<span class="cpm-thumb-ico">' + kindIcon(it.kind) + "</span>";
	}
	return (
		'<div class="cpm-card' +
		sel +
		'" data-vp="' +
		esc(it.vp) +
		'" data-kind="' +
		it.kind +
		'" tabindex="0">' +
		'<div class="cpm-thumb">' + thumb + "</div>" +
		'<div class="cpm-card-b">' +
		'<div class="cpm-name" title="' +
		esc(it.name) +
		'">' +
		esc(it.name) +
		"</div>" +
		'<div class="cpm-meta">' +
		(it.isDir ? "folder" : esc(fmtSize(it.sz))) +
		(it.ts ? " · " + esc(fmtDate(it.ts)) : "") +
		"</div>" +
		"</div>" +
		"</div>"
	);
}

function tableHtml(items) {
	const s = state.sort;
	function th(key, label) {
		const on = s.key === key;
		return (
			'<th data-sort="' +
			key +
			'" class="' +
			(on ? "on" : "") +
			'">' +
			label +
			(on ? '<span class="cpm-arrow">' + (s.dir === 1 ? "↑" : "↓") + "</span>" : "") +
			"</th>"
		);
	}
	return (
		'<table class="cpm-table"><thead><tr>' +
		'<th class="cpm-th-sel"><input type="checkbox" id="cpm-selall" /></th>' +
		th("name", "Name") +
		th("size", "Size") +
		th("type", "Type") +
		th("date", "Modified") +
		'<th class="cpm-th-act"></th>' +
		"</tr></thead><tbody>" +
		items
			.map(function (it) {
				const sel = state.sel.has(it.vp) ? " sel" : "";
				return (
					'<tr class="' +
					sel +
					'" data-vp="' +
					esc(it.vp) +
					'" data-kind="' +
					it.kind +
					'" tabindex="0">' +
					'<td class="cpm-th-sel"><input type="checkbox" class="cpm-ck"' +
					(sel ? " checked" : "") +
					" /></td>" +
					'<td class="cpm-c-name"><span class="cpm-ico-wrap">' +
					kindIcon(it.kind) +
					"</span><span>" +
					esc(it.name) +
					"</span></td>" +
					"<td>" +
					(it.isDir ? "—" : esc(fmtSize(it.sz))) +
					"</td>" +
					"<td>" +
					esc(it.isDir ? "folder" : it.kind) +
					"</td>" +
					"<td>" +
					(it.ts ? esc(fmtDate(it.ts)) : "—") +
					"</td>" +
					'<td class="cpm-th-act"><button class="cpm-icon-btn sm" data-act="itemmenu">' +
					icon("more", 15) +
					"</button></td>" +
					"</tr>"
				);
			})
			.join("") +
		"</tbody></table>"
	);
}

function renderStatus() {
	const st = qs("#cpm-status");
	if (state.loading) {
		st.innerHTML = '<span class="cpm-spin"></span> loading…';
		return;
	}
	const n = state.items.length;
	const sel = state.sel.size;
	let html = n + (n === 1 ? " item" : " items");
	if (sel) html += " · " + sel + " selected";
	const si = (state.srvinf || "").replace(/<[^>]*>/g, " // ").replace(/\s+/g, " ").trim();
	if (si) html += " · " + esc(si);
	st.innerHTML = html;
}

function renderSideFoot() {
	const f = qs("#cpm-side-foot");
	const acct = state.acct === "*" ? "anonymous" : state.acct;
	f.innerHTML =
		'<div class="cpm-foot-row"><span>' +
		icon("user", 14) +
		" " +
		esc(acct) +
		"</span>" +
		(can("admin") ? '<span class="cpm-chip">admin</span>' : "") +
		"</div>";
}

function renderAccount() {
	const b = qs("#cpm-user");
	b.innerHTML = icon("user", 18);
	b.title = state.acct === "*" ? "Sign in" : state.acct;
}

/* ---------------------------------------------------------------- search */

const doSearch = debounce(async function (q) {
	if (!q) {
		state.hits = null;
		state.localHits = [];
		state.searching = false;
		renderToolbar();
		renderFiles();
		return;
	}
	const lq = q.toLowerCase();
	state.localHits = state.items.filter(function (i) {
		return i.name.toLowerCase().indexOf(lq) !== -1;
	});
	state.searching = true;
	renderFiles();
	try {
		const r = await api.search(q, 250);
		state.hits = r.hits || [];
		state.trunc = !!r.trunc;
	} catch (e) {
		state.hits = [];
		toast("Search failed: " + e.message, "err");
	} finally {
		state.searching = false;
		renderFiles();
		renderStatus();
	}
}, 260);

function renderSearchResults() {
	const f = qs("#cpm-files");
	f.className = "cpm-files";
	if (state.searching && !state.localHits.length) {
		f.innerHTML = '<div class="cpm-empty"><span class="cpm-spin lg"></span><b>Searching…</b></div>';
		return;
	}
	const local = state.localHits || [];
	const hits = state.hits || [];
	const total = local.length + hits.length;

	if (!total) {
		f.innerHTML =
			'<div class="cpm-empty">' +
			icon("search", 40) +
			"<b>No matches</b><span>Global search needs the server's file index; " +
			"on this server only the current folder can be searched.</span></div>";
		return;
	}

	let html = '<div class="cpm-srch-head">' + total + " result" + (total === 1 ? "" : "s") + "</div>";
	if (state.searching) html = '<div class="cpm-srch-head"><span class="cpm-spin"></span> searching the whole server…</div>';

	if (local.length) {
		html += '<div class="cpm-srch-sec">In this folder</div>';
		html += local
			.map(function (it) {
				return (
					'<div class="cpm-hit" data-vp="' +
					esc(it.vp) +
					'">' +
					'<span class="cpm-ico-wrap">' +
					kindIcon(it.kind) +
					"</span>" +
					'<div class="cpm-hit-b"><div class="cpm-name">' +
					esc(it.name) +
					'</div><div class="cpm-meta">' +
					esc(state.vp) +
					"</div></div>" +
					'<span class="cpm-meta">' +
					(it.isDir ? "folder" : esc(fmtSize(it.sz))) +
					"</span></div>"
				);
			})
			.join("");
	}

	if (hits.length) {
		html += '<div class="cpm-srch-sec">Everywhere on this server</div>';
		html += hits
			.map(function (h) {
				let rp = h.rp || "";
				try {
					rp = decodeURIComponent(rp);
				} catch (e) {}
				const name = rp.slice(rp.lastIndexOf("/") + 1);
				const dir = rp.slice(0, rp.lastIndexOf("/") + 1);
				return (
					'<div class="cpm-hit" data-vp="' +
					esc(h.rp) +
					'">' +
					'<span class="cpm-ico-wrap">' +
					kindIcon(fileKind(name, false)) +
					"</span>" +
					'<div class="cpm-hit-b"><div class="cpm-name">' +
					esc(name) +
					'</div><div class="cpm-meta">' +
					esc(dir) +
					"</div></div>" +
					'<span class="cpm-meta">' +
					esc(fmtSize(h.sz)) +
					"</span></div>"
				);
			})
			.join("");
	}
	f.innerHTML = html;
}

/* ------------------------------------------------------------------ tree */

async function loadTree(vp) {
	const chain = vp.split("/").filter(Boolean);
	let acc = "/";
	const need = ["/"];
	chain.forEach(function (p) {
		acc += p + "/";
		need.push(acc);
	});
	for (let i = 0; i < need.length; i++) {
		const d = need[i];
		if (!state.tree.has(d)) {
			try {
				const r = await api.list(d);
				state.tree.set(
					d,
					(r.dirs || []).map(function (x) {
						return (x.href || "").replace(/\/$/, "");
					})
				);
			} catch (e) {
				state.tree.set(d, []);
			}
		}
		state.treeOpen.add(d);
	}
	renderTree();
}

function renderTree() {
	const box = qs("#cpm-tree");
	if (!box) return;
	box.innerHTML = treeLevel("/", 0);
	qsa("[data-tvp]", box).forEach(function (n) {
		const vp = n.getAttribute("data-tvp");
		if (vp === state.vp) n.classList.add("cur");
	});
}

function treeLevel(vp, depth) {
	const kids = state.tree.get(vp);
	const open = state.treeOpen.has(vp);
	let html = '<div class="cpm-node" data-tvp="' + esc(vp) + '" style="--d:' + depth + '">';
	html +=
		'<button class="cpm-chev' +
		(kids && kids.length ? "" : " empty") +
		(open ? " open" : "") +
		'" data-toggle="' +
		esc(vp) +
		'">' +
		icon("chevron", 12) +
		"</button>" +
		'<a class="cpm-node-l" href="#" data-vp="' +
		esc(vp) +
		'">' +
		icon("folder", 16) +
		"<span>" +
		esc(vp === "/" ? "Home" : api.vpName(vp)) +
		"</span></a></div>";
	if (open && kids && kids.length) {
		kids
			.slice()
			.sort(function (a, b) {
				return a.localeCompare(b, undefined, { numeric: true });
			})
			.forEach(function (k) {
				html += treeLevel(api.joinVp(vp, k), depth + 1);
			});
	}
	return html;
}

/* ------------------------------------------------------------- item menu */

function closeMenu() {
	if (state.menu) {
		state.menu.remove();
		state.menu = null;
	}
}

function openMenu(vp, x, y) {
	closeMenu();
	const it = itemByVp(vp);
	if (!it) return;
	const acts = [];
	acts.push(["open", it.isDir ? "Open folder" : "Open", "chevron"]);
	acts.push(["download", "Download", "download"]);
	if (can("move")) acts.push(["rename", "Rename", "edit"]);
	if (can("move")) acts.push(["move", "Move to…", "folder"]);
	if (can("delete")) acts.push(["delete", "Delete", "trash"]);

	const m = el(
		"div",
		{ class: "cpm-menu" },
		acts
			.map(function (a) {
				return (
					'<button data-mact="' +
					a[0] +
					'">' +
					icon(a[2], 15) +
					"<span>" +
					a[1] +
					"</span></button>"
				);
			})
			.join("")
	);
	m.style.left = Math.min(x, window.innerWidth - 200) + "px";
	m.style.top = Math.min(y, window.innerHeight - 220) + "px";
	doc.body.appendChild(m);
	state.menu = m;

	m.addEventListener("click", function (e) {
		const b = e.target.closest("[data-mact]");
		if (!b) return;
		e.preventDefault();
		closeMenu();
		handleItemAction(b.getAttribute("data-mact"), vp);
	});
	setTimeout(function () {
		doc.addEventListener("click", closeMenu, { once: true });
	}, 0);
}

function handleItemAction(act, vp) {
	const it = itemByVp(vp);
	if (!it) return;
	if (act === "open") return openItem(it);
	if (act === "download") return download([it]);
	if (act === "rename") return renameDialog(it);
	if (act === "move") return moveDialog([it]);
	if (act === "delete") return deleteDialog([it]);
}

/* --------------------------------------------------------------- openers */

function openItem(it) {
	if (it.isDir) return navigate(it.vp, true);
	openPreview(it);
}

function download(items) {
	items.forEach(function (it) {
		if (it.isDir) {
			const a = doc.createElement("a");
			a.href = api.vpUrl(it.vp) + "?zip";
			a.download = "";
			doc.body.appendChild(a);
			a.click();
			a.remove();
		} else {
			const a = doc.createElement("a");
			a.href = api.rawUrl(it.vp) + "?dl";
			a.download = it.name;
			doc.body.appendChild(a);
			a.click();
			a.remove();
		}
	});
}

/* ---------------------------------------------------------------- upload */

function uploadFiles(files) {
	const list = Array.prototype.slice.call(files);
	if (!list.length) return;
	const vp = state.vp;
	const batch = list.map(function (f) {
		return { file: f, pct: 0, status: "queued", err: null, ctrl: null };
	});
	state.uploads = batch;
	renderUploads();
	runUpload(batch, 0, vp);
}

function runUpload(batch, i, vp) {
	if (i >= batch.length) {
		renderUploads();
		refresh();
		return;
	}
	const u = batch[i];
	if (!u || u.status === "cancelled") return runUpload(batch, i + 1, vp);
	u.status = "uploading";
	renderUploads();
	const ctrl = new AbortController();
	u.ctrl = ctrl;
	api
		.upload(
			vp,
			u.file,
			function (loaded, total) {
				u.pct = total ? Math.round((loaded / total) * 100) : 0;
				renderUploads();
			},
			ctrl.signal
		)
		.then(function () {
			u.status = "done";
			u.pct = 100;
		})
		.catch(function (e) {
			u.status = e.name === "AbortError" ? "cancelled" : "error";
			u.err = e.message;
			if (e.name !== "AbortError") toast("Upload failed: " + e.message, "err");
		})
		.then(function () {
			runUpload(batch, i + 1, vp);
		});
}

function renderUploads() {
	const box = qs("#cpm-uploads");
	if (!state.uploads.length) {
		box.classList.remove("on");
		box.innerHTML = "";
		return;
	}
	const done = state.uploads.filter(function (u) {
		return u.status === "done";
	}).length;
	const total = state.uploads.length;
	box.classList.add("on");
	box.innerHTML =
		'<div class="cpm-up-head">' +
		"<b>Uploading</b> <span>" +
		done +
		"/" +
		total +
		"</span>" +
		'<div class="cpm-grow"></div>' +
		(done === total ? '<button class="cpm-icon-btn sm" data-act="hideups">' + icon("close", 14) + "</button>" : "") +
		"</div>" +
		'<div class="cpm-up-list">' +
		state.uploads
			.map(function (u, i) {
				const cls = u.status === "error" ? " err" : u.status === "done" ? " ok" : "";
				return (
					'<div class="cpm-up' +
					cls +
					'">' +
					'<div class="cpm-up-name">' +
					esc(u.file.name) +
					"</div>" +
					'<div class="cpm-up-bar"><i style="width:' +
					(u.status === "done" ? 100 : u.pct) +
					'%"></i></div>' +
					'<div class="cpm-up-st">' +
					esc(statusText(u)) +
					"</div>" +
					(u.status === "uploading" || u.status === "queued"
						? '<button class="cpm-icon-btn sm" data-cancel="' + i + '" title="Cancel">' +
						  icon("close", 13) +
						  "</button>"
						: "") +
					"</div>"
				);
			})
			.join("") +
		"</div>";
}

function statusText(u) {
	if (u.status === "queued") return "waiting";
	if (u.status === "done") return "done";
	if (u.status === "cancelled") return "cancelled";
	if (u.status === "error") return u.err || "failed";
	return u.pct + "%";
}

/* ---------------------------------------------------------------- modals */

function closeModal() {
	const h = qs("#cpm-modal");
	h.classList.remove("on");
	h.innerHTML = "";
}

function modal(title, bodyHtml, buttons) {
	const h = qs("#cpm-modal");
	h.innerHTML =
		'<div class="cpm-back"></div>' +
		'<div class="cpm-dialog" role="dialog" aria-modal="true">' +
		'<div class="cpm-dlg-head"><b>' +
		esc(title) +
		"</b><button class=\"cpm-icon-btn sm\" data-close>" +
		icon("close", 16) +
		"</button></div>" +
		'<div class="cpm-dlg-body">' +
		bodyHtml +
		"</div>" +
		'<div class="cpm-dlg-foot">' +
		buttons
			.map(function (b) {
				return (
					'<button class="cpm-btn ' +
					(b.kind || "") +
					'" data-mbtn="' +
					b.id +
					'">' +
					esc(b.label) +
					"</button>"
				);
			})
			.join("") +
		"</div></div>";
	h.classList.add("on");
	qs(".cpm-back", h).onclick = closeModal;
	qs("[data-close]", h).onclick = closeModal;
	return h;
}

function promptDialog(opts) {
	return new Promise(function (resolve) {
		const h = modal(
			opts.title,
			'<label class="cpm-field"><span>' +
				esc(opts.label || "Name") +
				'</span><input id="cpm-prompt-in" type="text" value="' +
				esc(opts.value || "") +
				'" placeholder="' +
				esc(opts.placeholder || "") +
				'" /></label>' +
				(opts.hint ? '<p class="cpm-hint">' + esc(opts.hint) + "</p>" : ""),
			[
				{ id: "cancel", label: "Cancel" },
				{ id: "ok", label: opts.ok || "OK", kind: "cpm-accent" },
			]
		);
		const inp = qs("#cpm-prompt-in", h);
		inp.focus();
		inp.select();
		function finish(v) {
			closeModal();
			resolve(v);
		}
		qs('[data-mbtn="cancel"]', h).onclick = function () {
			finish(null);
		};
		qs('[data-mbtn="ok"]', h).onclick = function () {
			finish(inp.value.trim() || null);
		};
		inp.onkeydown = function (e) {
			if (e.key === "Enter") {
				e.preventDefault();
				finish(inp.value.trim() || null);
			}
			if (e.key === "Escape") finish(null);
		};
	});
}

async function newFolderDialog() {
	const name = await promptDialog({
		title: "New folder",
		label: "Folder name",
		placeholder: "awesome mix vol.1",
		ok: "Create",
	});
	if (!name) return;
	try {
		await api.mkdir(state.vp, name);
		toast("Created “" + name + "”");
		refresh();
	} catch (e) {
		toast("Could not create folder: " + e.message, "err");
	}
}

async function renameDialog(it) {
	const name = await promptDialog({
		title: "Rename",
		label: "New name",
		value: it.name,
		ok: "Rename",
	});
	if (!name || name === it.name) return;
	try {
		await api.move(it.vp, api.joinVp(api.parentVp(it.vp), name));
		toast("Renamed");
		refresh();
	} catch (e) {
		toast("Rename failed: " + e.message, "err");
	}
}

async function moveDialog(items) {
	const dst = await promptDialog({
		title: "Move " + items.length + (items.length === 1 ? " item" : " items"),
		label: "Destination folder",
		value: state.vp,
		placeholder: "/music/2026",
		hint: "Absolute path on this server. The name is kept.",
		ok: "Move",
	});
	if (!dst) return;
	const base = dst.endsWith("/") ? dst : dst + "/";
	try {
		for (let i = 0; i < items.length; i++)
			await api.move(items[i].vp, base + items[i].name);
		toast("Moved");
		state.sel.clear();
		refresh();
	} catch (e) {
		toast("Move failed: " + e.message, "err");
	}
}

function deleteDialog(items) {
	const h = modal(
		"Delete " + items.length + (items.length === 1 ? " item" : " items") + "?",
		'<p class="cpm-warn">This permanently deletes:</p><ul class="cpm-list">' +
			items
				.slice(0, 12)
				.map(function (i) {
					return "<li>" + esc(i.name) + "</li>";
				})
				.join("") +
			(items.length > 12 ? "<li>…and " + (items.length - 12) + " more</li>" : "") +
			"</ul>" +
			(items.some(function (i) {
				return i.isDir;
			})
				? '<p class="cpm-warn">Folders are deleted recursively.</p>'
				: ""),
		[
			{ id: "cancel", label: "Cancel" },
			{ id: "ok", label: "Delete", kind: "danger" },
		]
	);
	qs('[data-mbtn="cancel"]', h).onclick = closeModal;
	qs('[data-mbtn="ok"]', h).onclick = async function () {
		closeModal();
		let failed = 0;
		for (let i = 0; i < items.length; i++) {
			try {
				await api.remove(items[i].vp);
			} catch (e) {
				failed++;
			}
		}
		if (failed) toast(failed + " item(s) could not be deleted", "err");
		else toast("Deleted");
		state.sel.clear();
		refresh();
	};
}

/* --------------------------------------------------------------- preview */

async function openPreview(it) {
	const kind = it.kind;
	const url = api.rawUrl(it.vp);
	const h = qs("#cpm-modal");

	let body;
	if (kind === "image") {
		body = '<div class="cpm-pv-img"><img src="' + esc(url) + '" alt="" /></div>';
	} else if (kind === "video") {
		body = '<video class="cpm-pv-vid" controls autoplay src="' + esc(url) + '"></video>';
	} else if (kind === "audio") {
		body =
			'<div class="cpm-pv-audio">' +
			icon("audio", 60) +
			'<b>' +
			esc(it.name) +
			"</b>" +
			'<audio controls autoplay src="' +
			esc(url) +
			'"></audio></div>';
	} else if (kind === "pdf") {
		body = '<iframe class="cpm-pv-pdf" src="' + esc(url) + '"></iframe>';
	} else if (kind === "markdown" || kind === "text" || kind === "code") {
		body =
			'<div class="cpm-pv-text"><div class="cpm-pv-loading"><span class="cpm-spin"></span> loading…</div></div>';
	} else {
		body =
			'<div class="cpm-pv-none">' +
			kindIcon(kind) +
			"<b>" +
			esc(it.name) +
			"</b><span>No inline preview for this file type.</span></div>";
	}

	h.innerHTML =
		'<div class="cpm-back"></div>' +
		'<div class="cpm-preview" role="dialog" aria-modal="true">' +
		'<div class="cpm-pv-head"><div class="cpm-pv-t">' +
		'<span class="cpm-ico-wrap">' +
		kindIcon(kind) +
		"</span><b>" +
		esc(it.name) +
		"</b><span class=\"cpm-meta\">" +
		esc(fmtSize(it.sz)) +
		" · " +
		esc(fmtDateTime(it.ts)) +
		"</span></div>" +
		'<div class="cpm-pv-acts">' +
		'<button class="cpm-btn" data-pv="download">' +
		icon("download", 15) +
		"<span>Download</span></button>" +
		'<button class="cpm-icon-btn" data-pv="close">' +
		icon("close", 18) +
		"</button></div></div>" +
		'<div class="cpm-pv-body">' +
		body +
		"</div></div>";
	h.classList.add("on");
	qs(".cpm-back", h).onclick = closeModal;
	qs('[data-pv="close"]', h).onclick = closeModal;
	qs('[data-pv="download"]', h).onclick = function () {
		download([it]);
	};

	if (kind === "markdown" || kind === "text" || kind === "code") {
		const box = qs(".cpm-pv-text", h);
		try {
			const r = await fetch(url, { credentials: "same-origin" });
			if (!r.ok) throw new Error("HTTP " + r.status);
			const txt = await r.text();
			if (kind === "markdown") box.innerHTML = '<article class="cpm-md">' + md(txt) + "</article>";
			else box.innerHTML = "<pre>" + esc(txt.slice(0, 400000)) + "</pre>";
		} catch (e) {
			box.innerHTML = '<div class="cpm-pv-loading">Could not load file: ' + esc(e.message) + "</div>";
		}
	}
}

/* minimal, escape-first markdown renderer */
function inlineMd(s) {
	return s
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function md(src) {
	const lines = esc(src).split(/\r?\n/);
	let out = [];
	let inCode = false;
	let inList = false;
	let para = [];

	function flushPara() {
		if (para.length) {
			out.push("<p>" + inlineMd(para.join(" ")) + "</p>");
			para = [];
		}
	}
	function closeList() {
		if (inList) {
			out.push("</ul>");
			inList = false;
		}
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^```/.test(line)) {
			flushPara();
			closeList();
			if (inCode) {
				out.push("</code></pre>");
				inCode = false;
			} else {
				out.push('<pre class="cpm-code"><code>');
				inCode = true;
			}
			continue;
		}
		if (inCode) {
			out.push(line);
			continue;
		}
		let m = /^(#{1,6})\s+(.*)$/.exec(line);
		if (m) {
			flushPara();
			closeList();
			out.push("<h" + m[1].length + ">" + inlineMd(m[2]) + "</h" + m[1].length + ">");
			continue;
		}
		if (/^\s*([-*+])\s+/.test(line)) {
			flushPara();
			if (!inList) {
				out.push("<ul>");
				inList = true;
			}
			out.push("<li>" + inlineMd(line.replace(/^\s*([-*+])\s+/, "")) + "</li>");
			continue;
		}
		m = /^&gt;\s?(.*)$/.exec(line);
		if (m) {
			flushPara();
			closeList();
			out.push("<blockquote>" + inlineMd(m[1]) + "</blockquote>");
			continue;
		}
		if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
			flushPara();
			closeList();
			out.push("<hr />");
			continue;
		}
		if (!line.trim()) {
			flushPara();
			closeList();
			continue;
		}
		para.push(line);
	}
	if (inCode) out.push("</code></pre>");
	flushPara();
	closeList();
	return out.join("\n");
}

/* ------------------------------------------------------------------ auth */

function accountDialog() {
	if (state.acct !== "*") {
		const h = modal(
			"Account",
			'<p>Signed in as <b>' + esc(state.acct) + "</b>.</p>",
			[
				{ id: "cancel", label: "Close" },
				{ id: "ok", label: "Sign out", kind: "danger" },
			]
		);
		qs('[data-mbtn="cancel"]', h).onclick = closeModal;
		qs('[data-mbtn="ok"]', h).onclick = async function () {
			closeModal();
			await api.logout().catch(function () {});
			doc.location.reload();
		};
		return;
	}
	const h = modal(
		"Sign in",
		'<label class="cpm-field"><span>Username</span><input id="cpm-un" type="text" autocomplete="username" /></label>' +
			'<label class="cpm-field"><span>Password</span><input id="cpm-pw" type="password" autocomplete="current-password" /></label>' +
			'<p class="cpm-hint">Credentials are sent straight to this copyparty server.</p>',
		[
			{ id: "cancel", label: "Cancel" },
			{ id: "ok", label: "Sign in", kind: "cpm-accent" },
		]
	);
	qs("#cpm-un", h).focus();
	qs('[data-mbtn="cancel"]', h).onclick = closeModal;
	qs('[data-mbtn="ok"]', h).onclick = async function () {
		const u = qs("#cpm-un", h).value.trim();
		const p = qs("#cpm-pw", h).value;
		if (!p) return toast("Password cannot be blank", "err");
		try {
			await api.login(u, p);
			closeModal();
			doc.location.reload();
		} catch (e) {
			toast("Sign-in failed: " + e.message, "err");
		}
	};
	qs("#cpm-pw", h).onkeydown = function (e) {
		if (e.key === "Enter") qs('[data-mbtn="ok"]', h).click();
	};
}

/* ---------------------------------------------------------------- events */

function setView(v) {
	state.view = v;
	store("view", v);
	doc.documentElement.classList.toggle("cpm-view-list", v === "list");
	const b = qs("#cpm-view");
	if (b) b.innerHTML = icon(v === "grid" ? "list" : "grid", 18);
	renderFiles();
}

function selectOnly(vp) {
	state.sel.clear();
	if (vp) state.sel.add(vp);
	renderSelection();
	renderToolbar();
}

function renderSelection() {
	qsa("[data-vp]", qs("#cpm-files")).forEach(function (n) {
		const on = state.sel.has(n.getAttribute("data-vp"));
		n.classList.toggle("sel", on);
		const ck = qs(".cpm-ck", n);
		if (ck) ck.checked = on;
	});
}

function bind() {
	const root = qs("#cpm-root");

	/* delegated clicks */
	root.addEventListener("click", function (e) {
		const t = e.target;
		const actBtn = t.closest("[data-act]");
		if (actBtn) {
			e.preventDefault();
			const a = actBtn.getAttribute("data-act");
			if (a === "home") navigate("/", true);
			else if (a === "view") setView(state.view === "grid" ? "list" : "grid");
			else if (a === "theme") {
				const cur = store("theme") || "auto";
				applyTheme(cur === "dark" ? "light" : "dark");
			} else if (a === "upload") qs("#cpm-file").click();
			else if (a === "account") accountDialog();
			else if (a === "newdir") newFolderDialog();
			else if (a === "clearq") {
				qs("#cpm-q").value = "";
				state.query = "";
				state.hits = null;
				state.searching = false;
				renderFiles();
			} else if (a === "clearsel") selectOnly(null);
			else if (a === "delete") deleteDialog(selItems());
			else if (a === "move") moveDialog(selItems());
			else if (a === "download") download(selItems());
			else if (a === "sortdir") {
				state.sort.dir *= -1;
				renderToolbar();
				renderFiles();
			} else if (a === "menu") root.classList.toggle("side-open");
			else if (a === "hideups") {
				state.uploads = [];
				renderUploads();
			}
			return;
		}

		const crumb = t.closest("[data-vp]");
		const inTree = t.closest("#cpm-tree");
		if (crumb && (inTree || t.closest("#cpm-crumbs"))) {
			e.preventDefault();
			if (inTree) root.classList.remove("side-open");
			navigate(crumb.getAttribute("data-vp"), true);
			return;
		}

		const toggle = t.closest("[data-toggle]");
		if (toggle) {
			e.preventDefault();
			const vp = toggle.getAttribute("data-toggle");
			if (state.treeOpen.has(vp)) state.treeOpen.delete(vp);
			else {
				state.treeOpen.add(vp);
				if (!state.tree.has(vp)) loadTree(vp);
			}
			renderTree();
			return;
		}

		const cancel = t.closest("[data-cancel]");
		if (cancel) {
			const u = state.uploads[+cancel.getAttribute("data-cancel")];
			if (u && u.ctrl) u.ctrl.abort();
			return;
		}

		const sortTh = t.closest("[data-sort]");
		if (sortTh) {
			const k = sortTh.getAttribute("data-sort");
			if (state.sort.key === k) state.sort.dir *= -1;
			else {
				state.sort.key = k;
				state.sort.dir = 1;
			}
			renderToolbar();
			renderFiles();
			return;
		}

		if (t.id === "cpm-selall") {
			if (t.checked) sorted().forEach(function (i) {
				state.sel.add(i.vp);
			});
			else state.sel.clear();
			renderSelection();
			renderToolbar();
			return;
		}

		const itemMenuBtn = t.closest('[data-act="itemmenu"]');
		if (itemMenuBtn) {
			const row = itemMenuBtn.closest("[data-vp]");
			const r = itemMenuBtn.getBoundingClientRect();
			openMenu(row.getAttribute("data-vp"), r.left - 160, r.bottom + 6);
			return;
		}

		const hit = t.closest(".cpm-hit");
		if (hit) {
			const vp = hit.getAttribute("data-vp");
			const known = itemByVp(vp);
			if (known) return openItem(known);
			const nm = vp.slice(vp.lastIndexOf("/") + 1);
			openPreview({
				name: nm,
				vp: vp,
				kind: fileKind(nm, false),
				sz: 0,
				ts: 0,
				isDir: false,
			});
			return;
		}

		const item = t.closest(".cpm-card, .cpm-table tbody tr");
		if (item && !t.closest(".cpm-ck")) {
			const vp = item.getAttribute("data-vp");
			if (e.ctrlKey || e.metaKey) {
				if (state.sel.has(vp)) state.sel.delete(vp);
				else state.sel.add(vp);
			} else if (e.shiftKey && state.anchor >= 0) {
				const list = sorted();
				const idx = list.findIndex(function (x) {
					return x.vp === vp;
				});
				const a = Math.min(state.anchor, idx),
					b = Math.max(state.anchor, idx);
				state.sel.clear();
				for (let i = a; i <= b; i++) state.sel.add(list[i].vp);
			} else {
				state.sel.clear();
				state.sel.add(vp);
				state.anchor = sorted().findIndex(function (x) {
					return x.vp === vp;
				});
			}
			renderSelection();
			renderToolbar();
		}
	});

	/* double click / touch opens */
	root.addEventListener("dblclick", function (e) {
		const item = e.target.closest(".cpm-card, .cpm-table tbody tr");
		if (!item) return;
		const it = itemByVp(item.getAttribute("data-vp"));
		if (it) openItem(it);
	});

	/* context menu */
	root.addEventListener("contextmenu", function (e) {
		const item = e.target.closest(".cpm-card, .cpm-table tbody tr");
		if (!item) return;
		e.preventDefault();
		const vp = item.getAttribute("data-vp");
		selectOnly(vp);
		openMenu(vp, e.clientX, e.clientY);
	});

	/* search */
	qs("#cpm-q").addEventListener("input", function (e) {
		const q = e.target.value.trim();
		state.query = q;
		if (!q) {
			state.hits = null;
			state.searching = false;
			renderFiles();
			renderStatus();
			return;
		}
		doSearch(q);
	});

	qs("#cpm-file").addEventListener("change", function (e) {
		uploadFiles(e.target.files);
		e.target.value = "";
	});

	/* drag & drop */
	let dragDepth = 0;
	const drop = qs("#cpm-drop");
	qs("#cpm-drop-dir").textContent = "";
	doc.addEventListener("dragenter", function (e) {
		if (!can("write")) return;
		if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, "Files") < 0) return;
		dragDepth++;
		qs("#cpm-drop-dir").textContent = state.vp;
		drop.classList.add("on");
	});
	doc.addEventListener("dragover", function (e) {
		if (drop.classList.contains("on")) e.preventDefault();
	});
	doc.addEventListener("dragleave", function () {
		dragDepth = Math.max(0, dragDepth - 1);
		if (!dragDepth) drop.classList.remove("on");
	});
	doc.addEventListener("drop", function (e) {
		if (!can("write")) return;
		if (!e.dataTransfer || !e.dataTransfer.files.length) return;
		e.preventDefault();
		dragDepth = 0;
		drop.classList.remove("on");
		uploadFiles(e.dataTransfer.files);
	});

	/* sort select */
	root.addEventListener("change", function (e) {
		if (e.target.id === "cpm-sortsel") {
			state.sort.key = e.target.value;
			renderFiles();
		}
	});

	/* keyboard */
	doc.addEventListener("keydown", function (e) {
		const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || "").toUpperCase());
		if (e.key === "Escape") {
			if (qs("#cpm-modal").classList.contains("on")) {
				closeModal();
				return;
			}
			if (state.hits || state.localHits.length) {
				qs("#cpm-q").value = "";
				state.query = "";
				state.hits = null;
				state.localHits = [];
				state.searching = false;
				renderToolbar();
				renderFiles();
				return;
			}
			if (state.sel.size) {
				selectOnly(null);
				return;
			}
			if (typing) e.target.blur();
			return;
		}
		if (typing) return;

		if (e.key === "/") {
			e.preventDefault();
			qs("#cpm-q").focus();
			return;
		}
		if (e.key === "Backspace") {
			e.preventDefault();
			navigate(api.parentVp(state.vp), true);
			return;
		}
		if (e.key === "Delete" && state.sel.size && can("delete")) {
			deleteDialog(selItems());
			return;
		}
		if (e.key === "F2" && state.sel.size === 1 && can("move")) {
			const it = itemByVp(state.sel.values().next().value);
			if (it) renameDialog(it);
			return;
		}
		if (e.key === "Enter" && state.sel.size === 1) {
			const it = itemByVp(state.sel.values().next().value);
			if (it) openItem(it);
			return;
		}
		if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			sorted().forEach(function (i) {
				state.sel.add(i.vp);
			});
			renderSelection();
			renderToolbar();
		}
	});

	window.addEventListener("popstate", function () {
		navigate(urlVp(), false);
	});

	window.addEventListener("scroll", closeMenu, true);
}

function selItems() {
	return state.items.filter(function (i) {
		return state.sel.has(i.vp);
	});
}

function renderError(e) {
	qs("#cpm-files").innerHTML =
		'<div class="cpm-empty err">' +
		icon("info", 40) +
		"<b>Could not load this folder</b><span>" +
		esc(e.message || String(e)) +
		"</span></div>";
}

/* ------------------------------------------------------------------ boot */

async function boot() {
	state.view = store("view") || (globalThis.ls0 && globalThis.ls0.cfg && globalThis.ls0.cfg.dgrid === "y" ? "grid" : "grid");
	state.perms = (globalThis.perms || []).slice();
	state.srvinf = "";
	mount();
	await navigate(urlVp(), false);
}

boot();
