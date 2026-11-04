/* End-to-end browser tests for the copyparty modern UI.
 *
 * These drive a real browser against a running copyparty with a writable
 * volume, so they cover the flows that pytest cannot: resumable uploads,
 * previews, the editor, share links, drag-to-move, focus handling and URL
 * state.
 *
 * Setup:
 *   npm i playwright
 *   npx playwright install webkit        # or use an installed chrome
 *
 * Run (against a server started with `--modern-ui` and a writable volume):
 *   CP_URL=http://127.0.0.1:3923 \
 *   CP_USER=rob CP_PASS=secret \
 *   node tests/webui/e2e.js chrome
 *
 * engine: chrome | chromium | firefox | webkit.  "chrome" uses the browser
 * installed on the machine and needs no download.
 *
 * Exits non-zero if any step fails or the page logs an unexpected error.
 */

const { chromium, firefox, webkit } = require("playwright");

const BASE = process.env.CP_URL || "http://127.0.0.1:3923";
const USER = process.env.CP_USER || "rob";
const PASS = process.env.CP_PASS || "secret";
const ENGINE = process.argv[2] || "chrome";

const results = [];
const errors = [];

function ok(name, extra) {
	results.push({ step: name, ok: true, extra: extra || null });
	console.log("  ok   " + name + (extra ? "  (" + extra + ")" : ""));
}

function fail(name, why) {
	results.push({ step: name, ok: false, why: why });
	console.log("  FAIL " + name + ": " + why);
	process.exitCode = 1;
}

async function launch() {
	if (ENGINE === "firefox") return firefox.launch({ headless: true });
	if (ENGINE === "webkit") return webkit.launch({ headless: true });
	if (ENGINE === "chromium") return chromium.launch({ headless: true });
	return chromium.launch({ channel: "chrome", headless: true });
}

function watch(page) {
	page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
	page.on("response", (r) => {
		const u = r.url();
		if (r.status() >= 400 && !/\/deps\/|\?th=/.test(u)) errors.push(r.status() + " " + u);
	});
}

async function newPage(browser, viewport) {
	const ctx = await browser.newContext({
		viewport: viewport || { width: 1440, height: 900 },
		extraHTTPHeaders: {
			Authorization: "Basic " + Buffer.from(USER + ":" + PASS).toString("base64"),
		},
	});
	const page = await ctx.newPage();
	watch(page);
	await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
	await page.waitForSelector("#cpm-root", { timeout: 30000 });
	await page.waitForSelector(".cpm-card", { timeout: 30000 });
	return { ctx, page };
}

async function testUpload(browser) {
	const { ctx, page } = await newPage(browser);
	try {
		const buf = Buffer.alloc(3 * 1024 * 1024 + 777, 7);
		const name = "e2e-" + Date.now() + ".bin";
		await page.setInputFiles("#cpm-file", {
			name: name,
			mimeType: "application/octet-stream",
			buffer: buf,
		});
		await page.waitForSelector(".cpm-up", { timeout: 15000 });
		await page.waitForSelector(".cpm-up.ok", { timeout: 120000 });
		const status = (await page.locator(".cpm-up-st").first().textContent()).trim();
		await page.waitForFunction(
			(n) => !!document.querySelector('.cpm-card[data-vp$="' + n + '"]'),
			name,
			{ timeout: 30000 }
		);
		ok("upload (3 MiB + 777)", status);
	} finally {
		await ctx.close();
	}
}

async function testPreviewAndState(browser) {
	const { ctx, page } = await newPage(browser);
	try {
		const text = page.locator('.cpm-card[data-kind="text"]').first();
		await text.dblclick();
		await page.waitForSelector(".cpm-preview", { timeout: 15000 });
		await page.waitForFunction(
			() => {
				const e = document.querySelector(".cpm-pv-text pre");
				return e && e.textContent.length > 0;
			},
			null,
			{ timeout: 15000 }
		);
		await page.keyboard.press("Escape");
		await page.waitForTimeout(200);
		await page.keyboard.press("Escape");
		await page.waitForSelector("#cpm-sortsel", { timeout: 10000 });

		await page.evaluate(() => {
			const s = document.getElementById("cpm-sortsel");
			s.value = "size";
			s.dispatchEvent(new Event("change", { bubbles: true }));
		});
		await page.waitForFunction(() => location.hash.indexOf("sort=size") > -1, null, {
			timeout: 10000,
		});
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.waitForSelector("#cpm-root");
		const hash = await page.evaluate(() => location.hash);
		ok("preview + url state", hash);
	} finally {
		await ctx.close();
	}
}

async function testEditor(browser) {
	const { ctx, page } = await newPage(browser);
	try {
		// create a scratch file through the ui so the test is self-contained
		const name = "e2e-edit-" + Date.now() + ".txt";
		await page.click('[data-act="newfile"]');
		await page.waitForSelector("#cpm-prompt-in", { timeout: 10000 });
		await page.fill("#cpm-prompt-in", name);
		await page.click('[data-mbtn="ok"]');
		await page.waitForSelector('.cpm-card[data-vp$="' + name + '"]', { timeout: 20000 });

		await page.locator('.cpm-card[data-vp$="' + name + '"]').dblclick();
		await page.waitForSelector(".cpm-preview", { timeout: 10000 });
		await page.click('[data-pv="edit"]');
		await page.waitForSelector("#cpm-editor", { timeout: 15000 });
		await page.fill("#cpm-editor", "written by the e2e test\n");
		await page.click('[data-mbtn="ok"]');
		await page.waitForSelector(".cpm-toast", { timeout: 15000 });

		await page.reload({ waitUntil: "domcontentloaded" });
		await page.waitForSelector(".cpm-card");
		await page.locator('.cpm-card[data-vp$="' + name + '"]').dblclick();
		await page.waitForSelector(".cpm-preview");
		await page.waitForFunction(
			() => {
				const e = document.querySelector(".cpm-pv-text pre");
				return e && e.textContent.indexOf("written by the e2e test") > -1;
			},
			null,
			{ timeout: 15000 }
		);
		ok("editor save", name);
	} finally {
		await ctx.close();
	}
}

async function testShare(browser) {
	const { ctx, page } = await newPage(browser);
	try {
		const btn = page.locator('[data-act="sharefolder"]');
		if (!(await btn.count())) {
			ok("share link", "skipped: server has no --shr");
			return;
		}
		await btn.click();
		await page.waitForSelector("#cpm-shr-pw", { timeout: 10000 });
		await page.click('[data-mbtn="ok"]');
		await page.waitForSelector("#cpm-shr-url", { timeout: 20000 });
		const url = await page.inputValue("#cpm-shr-url");
		const res = await page.request.get(url);
		if (res.status() !== 200) throw new Error("share url returned " + res.status());
		ok("share link", url);
	} finally {
		await ctx.close();
	}
}

async function testDrag(browser) {
	const { ctx, page } = await newPage(browser);
	try {
		const src = page.locator('.cpm-card[data-kind="text"]').first();
		const dst = page.locator("#cpm-tree [data-tvp]").nth(1);
		if (!(await dst.count())) {
			ok("drag to move", "skipped: only one folder");
			return;
		}
		const name = await src.locator(".cpm-name").textContent();
		await src.dragTo(dst);
		await page.waitForTimeout(2000);
		const gone = await page.evaluate(
			(n) => !document.querySelector('.cpm-card[data-vp$="' + n + '"]'),
			name.trim()
		);
		if (!gone) throw new Error("file still in the source folder");
		ok("drag to move", name.trim());
	} finally {
		await ctx.close();
	}
}

async function testA11y(browser) {
	const { ctx, page } = await newPage(browser);
	try {
		await page.click('[data-act="newdir"]');
		await page.waitForSelector(".cpm-dialog", { timeout: 10000 });
		const focused = await page.evaluate(() => document.activeElement.id || document.activeElement.tagName);
		await page.keyboard.press("Escape");
		await page.waitForTimeout(200);
		const gone = (await page.locator(".cpm-dialog").count()) === 0;
		if (!gone) throw new Error("Escape did not close the dialog");
		ok("a11y (focus + escape)", focused);
	} finally {
		await ctx.close();
	}
}

(async () => {
	console.log("copyparty modern ui e2e -- engine: " + ENGINE + " -- " + BASE);
	const browser = await launch();
	try {
		const steps = [
			["upload", testUpload],
			["preview/state", testPreviewAndState],
			["editor", testEditor],
			["share", testShare],
			["drag", testDrag],
			["a11y", testA11y],
		];
		for (const [name, fn] of steps) {
			try {
				await fn(browser);
			} catch (e) {
				fail(name, e.message.split("\n")[0]);
			}
		}
	} finally {
		await browser.close();
	}

	const dedup = errors.filter((e) => !/favicon/.test(e));
	if (dedup.length) {
		console.log("page errors:");
		for (const e of dedup) console.log("  " + e);
		process.exitCode = 1;
	}
	console.log(JSON.stringify({ engine: ENGINE, results: results, errors: dedup }, null, 2));
})();
