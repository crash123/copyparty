/* copyparty modern ui -- up2k uploader
 *
 * Implements copyparty's resumable upload protocol:
 *
 *   1. hash every chunk with sha-512 (base64url)
 *   2. handshake: POST the file name/size/mtime and the chunk hashes to the
 *      target folder, which answers with a "wark" and the list of chunks it
 *      is still missing
 *   3. POST only the missing chunks, a few in parallel
 *   4. handshake again to let the server verify and move the file into place
 *
 * Because the wark is derived from the file identity and the chunk list, an
 * interrupted upload is resumed automatically the next time the same file is
 * dropped -- the handshake just reports fewer missing chunks.
 *
 * sha-512 comes from WebCrypto, which browsers only expose in a secure
 * context (https, or localhost). Callers must check supported() first and
 * fall back to the classic multipart uploader otherwise.
 */

import { vpUrl, withK } from "./api.js";

const CONCURRENCY = 3;
const MAX_CHUNKS = 256;

export function supported() {
	try {
		return !!(
			window.crypto &&
			window.crypto.subtle &&
			window.crypto.subtle.digest &&
			window.File &&
			window.File.prototype.slice
		);
	} catch (e) {
		return false;
	}
}

/** same adaptive chunk size the classic up2k client uses */
export function chunkSize(size) {
	let cs = 1024 * 1024,
		step = 512 * 1024;

	for (;;) {
		for (let mul = 1; mul <= 2; mul++) {
			const n = Math.ceil(size / cs);
			if (n <= MAX_CHUNKS || (cs >= 32 * 1024 * 1024 && n <= 4096)) return cs;
			cs += step;
			step *= mul;
		}
	}
}

/** unpadded base64url, matching copyparty's hash strings */
export function b64url(buf) {
	const b = new Uint8Array(buf);
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	let s = "";

	for (let i = 0; i < b.length; i += 3) {
		const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
		s += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
		if (i + 1 < b.length) s += chars[(n >> 6) & 63];
		if (i + 2 < b.length) s += chars[n & 63];
	}
	return s;
}

function abortError() {
	const e = new Error("cancelled");
	e.name = "AbortError";
	return e;
}

function checkAbort(signal) {
	if (signal && signal.aborted) throw abortError();
}

async function digestChunk(file, start, end) {
	const buf = await file.slice(start, end).arrayBuffer();
	const dig = await crypto.subtle.digest("SHA-512", buf);
	// copyparty keeps the first 33 bytes of the digest, which is 44 base64url
	// characters -- the server rejects anything else as "not according to spec"
	return b64url(new Uint8Array(dig).subarray(0, 33));
}

async function handshake(vp, file, hashes, signal) {
	const body = {
		name: file.name,
		size: file.size,
		lmod: Math.floor((file.lastModified || Date.now()) / 1000),
		life: 0,
		hash: hashes,
	};

	const r = await fetch(withK(vpUrl(vp)), {
		method: "POST",
		credentials: "same-origin",
		headers: { "Content-Type": "text/plain;charset=UTF-8" },
		body: JSON.stringify(body),
		signal: signal,
	});

	const txt = await r.text();
	if (!r.ok) throw new Error(txt.trim() || "HTTP " + r.status);

	let js;
	try {
		js = JSON.parse(txt);
	} catch (e) {
		throw new Error(txt.trim() || "unexpected reply from server");
	}
	if (!js.name) throw new Error(js.why || "the server rejected this file");
	return js;
}

async function putChunk(vp, wark, hash, blob, signal) {
	const r = await fetch(withK(vpUrl(vp)), {
		method: "POST",
		credentials: "same-origin",
		headers: {
			"Content-Type": "application/octet-stream",
			"X-Up2k-Hash": hash,
			"X-Up2k-Wark": wark,
		},
		body: blob,
		signal: signal,
	});
	if (!r.ok) throw new Error((await r.text()).trim() || "chunk rejected: HTTP " + r.status);
}

/**
 * upload one file with resume; resolves to the server's final reply
 * opts: {signal, onHash(done,total), onSend(done,total), onResume(n)}
 */
export async function upload(vp, file, opts) {
	opts = opts || {};
	const signal = opts.signal;
	const size = file.size;
	const cs = chunkSize(size);
	const n = size ? Math.ceil(size / cs) : 0;

	const hashes = [];
	for (let i = 0; i < n; i++) {
		checkAbort(signal);
		hashes.push(await digestChunk(file, i * cs, Math.min(size, (i + 1) * cs)));
		if (opts.onHash) opts.onHash(i + 1, n);
	}

	checkAbort(signal);
	let js = await handshake(vp, file, hashes, signal);
	if (!js.name) throw new Error("upload rejected");
	if (!js.wark) return js; // nothing to send (deduplicated / zero bytes)

	const wark = js.wark;
	const missing = js.hash || [];

	// map missing hashes back to chunk indices; a resumed upload starts here
	const todo = [];
	for (let i = 0; i < missing.length; i++) {
		const idx = hashes.indexOf(missing[i]);
		if (idx >= 0) todo.push(idx);
	}
	if (opts.onResume && todo.length < n) opts.onResume(n - todo.length, n, wark);

	let next = 0,
		sent = 0;
	const total = todo.length;

	async function worker() {
		for (;;) {
			const k = next++;
			if (k >= total) return;
			checkAbort(signal);

			const idx = todo[k];
			const start = idx * cs;
			const blob = file.slice(start, Math.min(size, start + cs));
			await putChunk(vp, wark, hashes[idx], blob, signal);

			sent++;
			if (opts.onSend) opts.onSend(sent, total);
		}
	}

	const workers = [];
	for (let i = 0; i < Math.min(CONCURRENCY, total); i++) workers.push(worker());
	await Promise.all(workers);

	checkAbort(signal);
	js = await handshake(vp, file, hashes, signal);
	if (js.name && (!js.hash || !js.hash.length)) return js;
	throw new Error("the server is still missing chunks after the upload");
}
