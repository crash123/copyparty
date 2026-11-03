# modern ui

A modern filebrowser for copyparty: a no-build-step, dependency-free client
layer that replaces the classic filebrowser with a cleaner, faster interface
while keeping every one of copyparty's server-side features and permissions.

![grid, light theme](modern-ui/grid-light.png)

## quick start

```sh
cp -r copyparty/web/ui copyparty/web/    # already in the tree when running from source
python3 -m copyparty --modern-ui -v /srv/files::A
```

That is the whole install. `--modern-ui` serves the new interface on the normal
filebrowser URL; nothing else changes. The classic UI is still rendered
underneath, so:

* `?b=u` (the basic, no-javascript browser) keeps working
* `?h` (the admin/control panel) keeps working
* if the new bundle fails to load, the classic UI is revealed automatically
* without `--modern-ui`, copyparty behaves exactly as upstream

### without the flag

The UI is a normal client-side layer, so it can also be loaded the generic way:

```sh
copyparty \
  --css-browser=/.cpr/w/ui/ui.css \
  --js-browser=/.cpr/w/ui/boot.js
```

### inside a config file

```ini
[global]
  modern-ui
```

## what it does

| area | behaviour |
| --- | --- |
| browsing | grid and list views, breadcrumbs, lazily-loaded folder tree, sorting by name/size/type/date |
| search | instant filtering of the current folder, plus copyparty's server-side global search when its index is enabled |
| preview | images, video, audio, PDF, plain text, and rendered markdown, in an overlay viewer |
| file ops | create folder, rename, move, delete, download, zip a folder — all gated by the permissions the server reports |
| upload | drag-and-drop anywhere (or the Upload button) with a per-file progress queue and cancel |
| auth | sign in / sign out, per-user permissions, `--usernames` and password-only servers both supported |
| theming | dark and light, follows the OS by default, remembered per browser |
| keyboard | `/` search, `Esc` close/clear, `Backspace` up one folder, `F2` rename, `Delete` delete, `Ctrl/Cmd-A` select all, `Enter` open |
| responsive | single-column layout with an overlay folder drawer on phones |

![dark theme](modern-ui/grid-dark.png)

## architecture

The whole UI is plain ES modules. There is no bundler, no transpiler, no
`node_modules`, and no build step — the browser loads the files exactly as they
are on disk.

```
copyparty/web/ui/
  boot.js     classic script; injects the stylesheet and the module entrypoint
  main.js     application: shell, views, navigation, dialogs, previews
  api.js      http layer against copyparty's existing endpoints
  dom.js      escaping, formatting, file-type helpers
  icons.js    inline svg icon set
  ui.css      design tokens, light/dark themes, layout, components
```

**It reuses copyparty's own endpoints** rather than inventing a new API, so
authentication, CSRF handling, dirkeys (`?k=`), and the permission model all
keep working:

| action | endpoint |
| --- | --- |
| list a folder | `GET <vpath>?ls=1` |
| create folder | `POST act=mkdir` |
| rename / move | `POST <vpath>?move=<dst>` |
| delete | `POST <vpath>?delete` |
| global search | `POST /?srch` (json body) |
| login / logout | `POST act=login` / `act=logout` |
| upload | `POST act=bput` (multipart, one file per request) |

The classic page stays mounted but hidden, so copyparty's own javascript never
sees its DOM disappear.

## server-side changes in this fork

Three small, isolated changes make the above possible:

1. `--modern-ui` flag (`copyparty/__main__.py`) — one switch instead of three.
2. injection of the loader (`copyparty/httpcli.py`) — for the browser template
   only, and only when the flag is set. The classic assets are untouched.
3. serving `/.cpr/w/ui/*` from disk (`copyparty/httpcli.py`) instead of the
   embedded `RES` manifest, so the UI can be edited without rebuilding.
4. `pyproject.toml` package-data entries so the files ship in wheels.

Everything else is additive; the fork rebases cleanly onto upstream.

## limitations

* **uploads use the classic `bput` uploader**, not up2k. They show real
  progress and cancel properly, but they are not resumable and not chunked.
  Large-file uploads are the next thing to port.
* **global search needs the server's index** (`--idx` / `e2dsa`); without it,
  copyparty itself returns no hits, so the UI falls back to filtering the
  current folder and says so.
* **thumbnails need webdeps** (the same `pillow` etc. that the classic UI
  needs). When the server has none, it answers with a placeholder image, which
  this UI detects and replaces with a file-type icon.

## development

Edit the files in `copyparty/web/ui/` and reload the browser. To force a
reload of cached modules, bump the cachebuster by restarting copyparty
(`?_=<timestamp>` is appended to the entrypoint).

Syntax-check without any toolchain:

```sh
for f in copyparty/web/ui/*.js; do cp "$f" "/tmp/$(basename "$f").mjs"; node --check "/tmp/$(basename "$f").mjs"; done
```

## screenshots

| | |
| --- | --- |
| ![markdown preview](modern-ui/preview-markdown.png) | ![image preview](modern-ui/preview-image.png) |
| ![new folder dialog](modern-ui/dialog-new-folder.png) | ![mobile](modern-ui/mobile.png) |
