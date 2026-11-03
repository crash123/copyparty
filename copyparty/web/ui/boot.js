/* copyparty modern ui -- loader
 *
 * Loaded through --modern-ui (or --js-browser). This is a classic script on
 * purpose: the real UI is an ES module tree that the browser loads natively,
 * so there is no build step anywhere in this project.
 *
 * If anything goes wrong while loading, the classic filebrowser is revealed
 * again instead of leaving the user with a blank page.
 */
(function () {
	"use strict";

	var TS = typeof window.TS === "undefined" ? String(Date.now()) : window.TS;
	var BASE = "/.cpr/w/ui/";

	function restore() {
		document.documentElement.classList.remove("cpm-active", "cpm-booting");
		var css = document.getElementById("cpm-css");
		if (css) css.remove();
	}

	try {
		if (!window.fetch || !window.Promise || !window.HTMLScriptElement) return;

		if (!document.getElementById("cpm-css")) {
			var css = document.createElement("link");
			css.id = "cpm-css";
			css.rel = "stylesheet";
			css.href = BASE + "ui.css?_=" + encodeURIComponent(TS);
			css.onerror = restore;
			document.head.appendChild(css);
		}

		var mod = document.createElement("script");
		mod.type = "module";
		mod.src = BASE + "main.js?_=" + encodeURIComponent(TS);
		if (typeof window.JS_NONCE === "string" && window.JS_NONCE) mod.nonce = window.JS_NONCE;
		mod.onerror = function () {
			try {
				console.error("[cpm] modern ui failed to load");
			} catch (e) {}
			restore();
		};
		document.head.appendChild(mod);
	} catch (e) {
		restore();
	}
})();
