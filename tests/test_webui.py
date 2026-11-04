#!/usr/bin/env python3
# coding: utf-8
"""tests for the optional modern web UI (--modern-ui)

these start a real copyparty in a subprocess, so they cover the wiring that
unit tests cannot: the flag, the html injection, serving /.cpr/w/ui/*, and the
fact that the classic UI is left alone.

run with:  python3 -m pytest tests/test_webui.py -q
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"

ASSETS = {
    "boot.js": "javascript",
    "main.js": "javascript",
    "api.js": "javascript",
    "dom.js": "javascript",
    "icons.js": "javascript",
    "ui.css": "css",
}


def free_port():
    sck = socket.socket()
    try:
        sck.bind(("127.0.0.1", 0))
        return sck.getsockname()[1]
    finally:
        sck.close()


def wait_port(port, timeout=40.0):
    end = time.time() + timeout
    while time.time() < end:
        sck = socket.socket()
        sck.settimeout(0.25)
        try:
            sck.connect(("127.0.0.1", port))
            return True
        except Exception:
            time.sleep(0.05)
        finally:
            sck.close()
    return False


class ModernUiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = Server(modern=True)

    @classmethod
    def tearDownClass(cls):
        cls.srv.close()

    def test_flag_injects_assets(self):
        body = self.srv.get("/", UA)
        self.assertIn("/.cpr/w/ui/boot.js", body)
        self.assertIn("/.cpr/w/ui/ui.css", body)
        self.assertIn("cpm-active", body)

    def test_classic_ui_still_present_underneath(self):
        # the modern ui must not remove the classic page from the document
        body = self.srv.get("/", UA)
        self.assertIn('id="files"', body)
        self.assertIn("browser.js", body)

    def test_basic_browser_is_untouched(self):
        body = self.srv.get("/?b=u", UA)
        self.assertNotIn("boot.js", body)
        self.assertNotIn("cpm-active", body)

    def test_json_listing_is_not_injected(self):
        raw = self.srv.get("/?ls=1", UA)
        data = json.loads(raw)
        self.assertEqual(data["acct"], "*")
        names = [f["href"] for f in data["files"]]
        self.assertIn("hello.txt", names)
        self.assertNotIn("cpm-active", raw)

    def test_assets_are_served_from_disk(self):
        for name, want in ASSETS.items():
            code, ctype, body = self.srv.req("/.cpr/w/ui/" + name, UA)
            self.assertEqual(code, 200, name)
            self.assertIn(want, ctype.lower(), name)
            self.assertTrue(body, name)

    def test_asset_traversal_is_blocked(self):
        # the disk-serving branch must not become a directory traversal;
        # note that "/.cpr/w/ui/../browser.js" legitimately normalizes to the
        # public classic asset, so only escaping the web root is a failure
        for path in (
            "/.cpr/w/ui/../../__init__.py",
            "/.cpr/w/ui/%2e%2e/%2e%2e/__init__.py",
            "/.cpr/w/ui/....//__init__.py",
            "/.cpr/w/ui/../../webdeps",
        ):
            code, ctype, body = self.srv.req(path, UA)
            self.assertNotEqual(code, 200, path)
            self.assertNotIn(b"EnvParams", body, path)

    def test_control_panel_still_works(self):
        body = self.srv.get("/?h", UA)
        self.assertIn("admin panel", body)


class NoFlagTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = Server(modern=False)

    @classmethod
    def tearDownClass(cls):
        cls.srv.close()

    def test_nothing_is_injected_without_the_flag(self):
        body = self.srv.get("/", UA)
        self.assertNotIn("boot.js", body)
        self.assertNotIn("cpm-active", body)

    def test_assets_are_still_reachable(self):
        # harmless, and it keeps --js-browser / --css-browser usable
        code, ctype, _ = self.srv.req("/.cpr/w/ui/main.js", UA)
        self.assertEqual(code, 200)


class BrowserTest(unittest.TestCase):
    """end-to-end check that the bundle actually mounts; needs a chrome"""

    @classmethod
    def setUpClass(cls):
        cls.srv = Server(modern=True)
        cls.chrome = find_chrome()

    @classmethod
    def tearDownClass(cls):
        cls.srv.close()

    def test_ui_mounts(self):
        if not self.chrome:
            self.skipTest("no chrome/chromium available")

        profile = tempfile.mkdtemp(prefix="cptd-chrome-")
        try:
            out = subprocess.run(
                [
                    self.chrome,
                    "--headless=new",
                    "--disable-gpu",
                    "--no-sandbox",
                    "--user-data-dir=" + profile,
                    "--virtual-time-budget=20000",
                    "--dump-dom",
                    self.srv.url + "/",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=120,
            ).stdout.decode("utf-8", "replace")
        finally:
            shutil.rmtree(profile, True)

        self.assertIn('id="cpm-root"', out)
        self.assertIn("hello.txt", out)
        self.assertIn("cpm-card", out)
        # the classic page is still there underneath (the modern ui layers on)
        self.assertIn('id="files"', out)


def find_chrome():
    for cand in (
        os.environ.get("CP_CHROME"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
    ):
        if cand and os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
    for name in ("google-chrome", "chromium", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    return None


class Server(object):
    def __init__(self, modern=True, extra=()):
        self.tmp = tempfile.mkdtemp(prefix="cptd-ui-")
        data = os.path.join(self.tmp, "data")
        os.makedirs(os.path.join(data, "sub"))
        with open(os.path.join(data, "hello.txt"), "w") as f:
            f.write("hello world\n")

        cfg = os.path.join(self.tmp, "cfg")
        os.makedirs(cfg)

        self.port = free_port()
        self.url = "http://127.0.0.1:%d" % self.port

        args = [
            sys.executable,
            "-m",
            "copyparty",
            "-p",
            str(self.port),
            "--no-crt",
            "-q",
        ]
        if modern:
            args.append("--modern-ui")
        args += ["-v", data + "::A"]

        env = dict(os.environ)
        env["XDG_CONFIG_HOME"] = cfg
        env.pop("CP_CHROME", None)
        self.proc = subprocess.Popen(
            args,
            cwd=REPO,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if not wait_port(self.port):
            self.close()
            raise Exception("copyparty did not start on port %d" % self.port)

    def req(self, path, ua):
        rq = urllib.request.Request(self.url + path, headers={"User-Agent": ua})
        try:
            with urllib.request.urlopen(rq, timeout=20) as r:
                return r.getcode(), r.headers.get("content-type", ""), r.read()
        except urllib.error.HTTPError as ex:
            return ex.code, ex.headers.get("content-type", ""), ex.read()

    def get(self, path, ua):
        return self.req(path, ua)[2].decode("utf-8", "replace")

    def close(self):
        try:
            self.proc.terminate()
            self.proc.wait(timeout=10)
        except Exception:
            try:
                self.proc.kill()
            except Exception:
                pass
        shutil.rmtree(self.tmp, True)


if __name__ == "__main__":
    unittest.main()
