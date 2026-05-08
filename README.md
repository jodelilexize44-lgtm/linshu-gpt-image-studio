# 林叔的 GPT 绘图平台

本项目是一个本地运行的 APIMart 图片生成工具，支持 `gpt-image-2` 和 `gpt-image-2-official`。界面通过本机 Node 服务代理请求 APIMart，前端负责提交任务、轮询结果、展示图片和保存历史。

## 快速启动

安装依赖：

```powershell
npm.cmd install
```

浏览器模式：

```powershell
npm.cmd start
```

打开：

```text
http://127.0.0.1:5173
```

桌面预览：

```powershell
npm.cmd run desktop
```

Windows 打包：

```powershell
npm.cmd run dist
```

macOS 打包需要在 Mac 或 GitHub macOS runner 上执行：

```bash
npm run dist:mac
```

详细说明见 [MACOS.md](./MACOS.md)。

## 交付文件

打包输出目录是 `release`。

常用交付文件：

```text
release\win-unpacked\林叔的GPT绘图平台.exe
release\林叔的GPT绘图平台-Setup-0.1.0-x64.exe
release\林叔的GPT绘图平台-Portable-0.1.0-x64.exe
```

发免安装版时必须压缩整个 `release\win-unpacked` 文件夹，不能只发单独的 exe。

## API Key 保存

API Key 会保存两份：

- 浏览器 `localStorage`，用于当前页面快速读取。
- 本机配置文件 `linshu-settings.json`，用于同一台电脑后续打开自动复用。

桌面版使用 Electron 的 `app.getPath("userData")` 作为配置目录；浏览器模式默认使用项目运行目录。相关接口是：

```text
GET  /api/settings
POST /api/settings
```

生成请求会优先使用请求头中的 API Key；如果前端没有带 Key，服务端会尝试读取本机配置文件里的 Key。

## 生成流程

APIMart 图片生成是异步任务：

1. 前端提交 `/api/generate`。
2. 服务端转发到 APIMart `/v1/images/generations`。
3. 成功后返回 `task_id`。
4. 前端轮询 `/api/tasks/{task_id}`。
5. 服务端转发到 APIMart `/v1/tasks/{task_id}?language=zh`。
6. 拿到图片 URL 后展示图片并写入历史记录。

轮询设置在 `public/app.js`：

```js
const MAX_POLL_ATTEMPTS = 180;
const MAX_POLL_ERRORS = 6;
```

轮询间隔是首次约 10 秒，之后约 4 秒。拿到 `task_id` 后会立即写入历史记录，超时后也可以从历史记录继续查询。

## 界面约定

生成中的主界面只显示：

```text
正在生成图片
请稍后
```

不要在生成中的主界面显示状态、预计时间、排队提示或 Task ID。Task ID 可以保存在历史记录和超时提示中，用于继续查询。

图片比例和分辨率这两个控件使用 `.size-resolution-grid` 对齐，选择框和说明文字必须保持同宽、同高、同一行高节奏。

## 打包注意

如果 `npm.cmd run dist` 报错类似：

```text
remove release\win-unpacked\chrome_100_percent.pak: Access is denied
```

说明 `release\win-unpacked\林叔的GPT绘图平台.exe` 还在运行，占用了文件。先关闭运行中的程序，再重新打包。

打包后建议解包验证：

```powershell
$tmp = 'D:\Codex Project\release\asar-check'
if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
npm.cmd exec -- asar extract 'D:\Codex Project\release\win-unpacked\resources\app.asar' $tmp
rg -n "api/settings|linshu-settings|MAX_POLL_ATTEMPTS|taskDetail\.textContent|size-resolution-grid" $tmp
Remove-Item -LiteralPath $tmp -Recurse -Force
```

## 关键文件

- `electron-main.cjs`：Electron 启动入口，固定端口 `5173`，并传入用户数据目录。
- `server.mjs`：本地 HTTP 服务、APIMart 代理、设置保存、静态文件服务。
- `public/app.js`：前端交互、保存设置、提交生成、轮询任务、历史记录。
- `public/index.html`：页面结构。
- `public/styles.css`：界面样式。
- `package.json`：打包配置。
