# Maintenance Notes

This document records project decisions that should survive context loss.

## User Preferences

- The generation status panel must stay simple:
  - Title: `正在生成图片`
  - Detail: `请稍后`
- Do not show Task ID, queue status, estimated time, or verbose diagnostics in the main generation panel.
- Task ID may remain in history records and timeout messages so unfinished tasks can be queried later.
- After any fix that affects the app, sync and rebuild:
  - `release\win-unpacked\林叔的GPT绘图平台.exe`
  - `release\林叔的GPT绘图平台-Setup-0.1.0-x64.exe`
- If a `dist\林叔的GPT绘图平台.zip` or zipped `win-unpacked` package is used for sharing, recreate it after changes. Old archives can remain stale.
- macOS builds are configured but must be produced on macOS or a macOS CI runner. See `MACOS.md`.

## Current Important Behaviors

- Electron runs the local server on fixed port `127.0.0.1:5173`.
- The fixed port is intentional. It avoids losing browser `localStorage` between launches.
- Desktop API Key persistence is file based:
  - Electron passes `settingsDir: app.getPath("userData")`.
  - `server.mjs` stores `linshu-settings.json` in that directory.
  - Browser mode stores `linshu-settings.json` in the project run directory unless `LINSHU_SETTINGS_DIR` is set.
- `/api/settings` supports `GET` and `POST`.
- `/api/generate` accepts frontend form data and forwards to APIMart.
- `/api/tasks/{taskId}` forwards to APIMart task polling.
- The app saves a history record as soon as it receives a `task_id`.
- History entries without images can be clicked to continue querying the task.

## Polling And Official Model

`gpt-image-2-official` can be slow because APIMart handles it as an async queued task.

Important frontend constants:

```js
const MAX_POLL_ATTEMPTS = 180;
const MAX_POLL_ERRORS = 6;
```

Current polling behavior:

- First wait is about 10 seconds.
- Later waits are about 4 seconds.
- Short query failures retry up to `MAX_POLL_ERRORS`.
- Completion is detected by returned image URLs and by statuses compatible with `completed`, `succeeded`, and `success`.

Do not add verbose queue diagnostics back into the main generation panel unless the user explicitly asks for them.

## UI Alignment

The picture ratio and resolution row uses:

```html
<div class="control-grid size-resolution-grid">
```

The styling lives in `public/styles.css` under `.size-resolution-grid`.

Keep these two select controls visually aligned:

- Same grid width.
- Same label line height.
- Same select height.
- Same select font size and weight.
- Same hint line height and minimum height.

## Known Fixes Already Applied

- Removed the stray `▧` character from the generate button after completion.
- Fixed API Key persistence across launches.
- Fixed random Electron port by using `5173`.
- Added local settings file persistence.
- Added long polling and retry behavior for async APIMart tasks.
- Added history resume for tasks that have a `task_id` but no images yet.
- Added flexible image URL extraction from task responses.
- Added `task_id` fallback parsing on task creation.
- Aligned picture ratio and resolution controls.
- Restored the generation panel to only show `正在生成图片` and `请稍后`.

## Release Verification Checklist

Before saying a release target is updated, verify the actual packaged `app.asar`:

```powershell
$tmp = 'D:\Codex Project\release\asar-check'
if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
npm.cmd exec -- asar extract 'D:\Codex Project\release\win-unpacked\resources\app.asar' $tmp
rg -n "api/settings|linshu-settings|MAX_POLL_ATTEMPTS|taskDetail\.textContent|size-resolution-grid" $tmp
Remove-Item -LiteralPath $tmp -Recurse -Force
```

Expected markers include:

- `electron-main.cjs` contains `port: 5173`.
- `electron-main.cjs` contains `settingsDir: app.getPath("userData")`.
- `server.mjs` contains `/api/settings`.
- `server.mjs` contains `linshu-settings.json`.
- `public/app.js` contains `MAX_POLL_ATTEMPTS = 180`.
- `public/app.js` contains `taskDetail.textContent = "请稍后"`.
- `public/index.html` and `public/styles.css` contain `size-resolution-grid`.

If packaging fails with `Access is denied` under `release\win-unpacked`, close or kill the running `林叔的GPT绘图平台.exe` processes that are using that directory, then rerun `npm.cmd run dist`.

## macOS Build Notes

- `package.json` contains `dist:mac`.
- `package.json` contains `build.mac.target = ["dmg", "zip"]`.
- `package.json` contains `build.mac.identity = null` for unsigned CI builds.
- `.github/workflows/build-macos.yml` can produce unsigned macOS artifacts on GitHub Actions.
- Unsigned macOS builds may be blocked by Gatekeeper. Formal distribution needs Apple Developer ID signing and notarization.
