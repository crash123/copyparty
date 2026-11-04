# modern ui browser tests

`e2e.js` drives a real browser against a running copyparty and exercises the
flows that `tests/test_webui.py` cannot reach: resumable uploads, previews,
the text editor, share links, drag-to-move, focus handling and URL state.

## setup

The repo has no javascript toolchain; these tests bring their own.

```sh
mkdir -p /tmp/cp-e2e && cd /tmp/cp-e2e
npm i playwright
npx playwright install webkit       # optional: chrome on the machine needs no download
```

## run

Start copyparty with the modern ui, a writable volume, and an account:

```sh
python3 -m copyparty --modern-ui -p 3923 -a rob:secret -v /srv/test::A
```

Then:

```sh
CP_URL=http://127.0.0.1:3923 CP_USER=rob CP_PASS=secret \
  node tests/webui/e2e.js chrome
```

`chrome` uses the browser installed on the machine; `chromium`, `firefox` and
`webkit` use playwright's own builds. The script exits non-zero if a step fails
or the page logs an unexpected error.

If the tests run inside another sandbox (CI, containers on a mac), firefox
needs its own content sandbox disabled, otherwise no page can be created:

```sh
MOZ_DISABLE_CONTENT_SANDBOX=1 node tests/webui/e2e.js firefox
```

## what each step proves

| step | assertion |
| --- | --- |
| upload | a 3 MiB + 777 byte file goes through up2k and shows up in the listing |
| preview/state | a text preview opens, and sort/view survive a reload via the URL hash |
| editor | a new file is created, edited, saved, and the change is read back |
| share | a share link is created and that link serves a listing |
| drag | dragging a file onto a folder removes it from the source folder |
| a11y | opening a dialog moves focus into it, and Escape closes it |

Steps that the server does not support (no `--shr`, single-folder volume) are
reported as skipped rather than failed.
