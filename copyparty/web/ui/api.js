/* copyparty modern ui -- http layer
 *
 * Talks to the same endpoints the classic filebrowser uses, so the new UI
 * inherits copyparty's authentication, permission model and CSRF handling
 * instead of reimplementing any of it.
 */

export const SR = (typeof globalThis.SR === "string" ? globalThis.SR : "").replace(/\/$/, "");

/** dirkey passed in the url (?k=...), must be replayed on every request */
const DIRKEY = (function () {
	try {
		return new URLSearchParams(location.search).get("k");
	} catch (e) {
		return null;
	}
})();

function withK(url) {
	if (!DIRKEY) return url;
	return url + (url.indexOf("?") === -1 ? "?" : "&") + "k=" + encodeURIComponent(DIRKEY);
}

/** percent-encode a vpath, keeping the slashes intact */
export function encPath(vp) {
	return String(vp)
		.split("/")
		.map(encodeURIComponent)
		.join("/");
}

/** absolute url for a vpath */
export function vpUrl(vp) {
	return SR + (vp === "" ? "/" : encPath(vp));
}

/** url for a child name inside a directory vpath */
export function childUrl(vp, name) {
	return vpUrl(joinVp(vp, name));
}

export function joinVp(vp, name) {
	return (vp.endsWith("/") ? vp : vp + "/") + name;
}

export function parentVp(vp) {
	const t = vp.replace(/\/+$/, "");
	const i = t.lastIndexOf("/");
	return i <= 0 ? "/" : t.slice(0, i + 1);
}

export function vpName(vp) {
	const t = vp.replace(/\/+$/, "");
	return t.slice(t.lastIndexOf("/") + 1) || "/";
}

async function req(url, opt) {
	const r = await fetch(
		withK(url),
		Object.assign({ credentials: "same-origin", cache: "no-store" }, opt || {})
	);
	const txt = await r.text();
	if (!r.ok) throw new Error(txt.trim() || "HTTP " + r.status);
	return txt;
}

/** directory listing; resolves to copyparty's ?ls=1 json */
export async function list(vp) {
	const txt = await req(vpUrl(vp) + "?ls=1", {
		headers: { Accept: "application/json" },
	});
	return JSON.parse(txt);
}

export async function mkdir(vp, name) {
	const fd = new FormData();
	fd.append("act", "mkdir");
	fd.append("name", name);
	return req(vpUrl(vp), { method: "POST", body: fd });
}

export async function newMarkdown(vp, name) {
	const fd = new FormData();
	fd.append("act", "new_md");
	fd.append("name", name);
	return req(vpUrl(vp), { method: "POST", body: fd });
}

/** move or rename a single vpath to a new absolute vpath */
export async function move(srcVp, dstVp) {
	const akey = Math.random().toString(36).slice(2, 11);
	return req(vpUrl(srcVp) + "?move=" + encPath(dstVp) + "&akey=" + akey, {
		method: "POST",
	});
}

/** download the given names (relative to vp) as one archive */
export function zipSelection(vp, names) {
	const frm = document.createElement("form");
	frm.method = "post";
	frm.enctype = "multipart/form-data";
	frm.target = "_blank";
	frm.action = withK(vpUrl(vp) + "?zip");
	frm.style.display = "none";

	const act = document.createElement("input");
	act.type = "hidden";
	act.name = "act";
	act.value = "zip";
	const ta = document.createElement("textarea");
	ta.name = "files";
	ta.value = names.join("\n");

	frm.appendChild(act);
	frm.appendChild(ta);
	document.body.appendChild(frm);
	frm.submit();
	setTimeout(function () {
		frm.remove();
	}, 2000);
}

export async function remove(vp) {
	return req(vpUrl(vp) + "?delete", { method: "POST" });
}

/** full-text search; returns {hits, tag_order, trunc} */
export async function search(q, n) {
	const txt = await req(SR + "/?srch", {
		method: "POST",
		headers: { "Content-Type": "text/plain" },
		body: JSON.stringify({ q: q, n: n || 250 }),
	});
	return JSON.parse(txt);
}

export async function login(uname, pass) {
	// copyparty only expects a "uname" field when started with --usernames;
	// otherwise the login parser rejects the request outright. Rather than
	// guess the server mode, try with the username and fall back to a
	// password-only login when that is refused.
	function send(withUser) {
		const fd = new FormData();
		fd.append("act", "login");
		if (withUser) fd.append("uname", uname);
		fd.append("cppwd", pass);
		return req(vpUrl("/"), { method: "POST", body: fd });
	}
	if (!uname) return send(false);
	try {
		return await send(true);
	} catch (e) {
		return send(false);
	}
}

export async function logout() {
	const fd = new FormData();
	fd.append("act", "logout");
	return req(vpUrl("/"), { method: "POST", body: fd });
}

/** upload one file through the classic (non-resumable) uploader, with progress */
export function upload(vp, file, onProgress, signal) {
	return new Promise(function (resolve, reject) {
		const xhr = new XMLHttpRequest();
		const fd = new FormData();
		fd.append("act", "bput");
		fd.append("f", file, file.name);

		xhr.open("POST", withK(vpUrl(vp)), true);
		xhr.withCredentials = true;
		xhr.responseType = "text";

		xhr.upload.onprogress = function (e) {
			if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
		};
		xhr.onload = function () {
			if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
			else reject(new Error((xhr.responseText || "HTTP " + xhr.status).trim()));
		};
		xhr.onerror = function () {
			reject(new Error("network error during upload"));
		};
		xhr.onabort = function () {
			const e = new Error("cancelled");
			e.name = "AbortError";
			reject(e);
		};

		if (signal) {
			if (signal.aborted) return xhr.abort();
			signal.addEventListener("abort", function () {
				xhr.abort();
			});
		}
		xhr.send(fd);
	});
}

/** raw download url for a vpath */
export function rawUrl(vp) {
	return withK(vpUrl(vp));
}

/** thumbnail url; copyparty center-crops and downscales server-side */
export function thumbUrl(vp, size) {
	return withK(vpUrl(vp) + "?th=" + (size || 256));
}
