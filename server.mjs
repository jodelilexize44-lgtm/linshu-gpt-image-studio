import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 5173);
let STATIC_ROOT = resolve(process.env.APP_ROOT || process.cwd(), "public");
let SETTINGS_FILE = resolve(process.env.LINSHU_SETTINGS_DIR || process.cwd(), "linshu-settings.json");
const DEFAULT_APIMART_BASE = "https://api.apimart.ai";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function readSettings() {
  try {
    const settings = JSON.parse(await readFile(SETTINGS_FILE, "utf8"));
    return settings && typeof settings === "object" ? settings : {};
  } catch {
    return {};
  }
}

async function writeSettings(settings) {
  await mkdir(dirname(SETTINGS_FILE), { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
}

function normalizeApiBase(base) {
  if (!base) return DEFAULT_APIMART_BASE;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return DEFAULT_APIMART_BASE;
    return url.origin;
  } catch {
    return DEFAULT_APIMART_BASE;
  }
}

async function getApiKey(req) {
  const key = req.headers["x-apimart-key"];
  const headerKey = Array.isArray(key) ? key[0] : key;
  if (headerKey) return headerKey;
  const settings = await readSettings();
  return settings.api_key;
}

async function getApiBase(req) {
  const raw = req.headers["x-apimart-base"];
  const base = Array.isArray(raw) ? raw[0] : raw;
  if (base) return normalizeApiBase(base);
  const settings = await readSettings();
  return normalizeApiBase(settings.api_base);
}

async function parseForm(req) {
  const request = new Request("http://localhost", {
    method: req.method,
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: "half"
  });
  return request.formData();
}

async function parseJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body.trim()) return {};
  return JSON.parse(body);
}

async function handleSettings(req, res) {
  if (req.method === "GET") {
    const settings = await readSettings();
    sendJson(res, 200, {
      api_key: settings.api_key || "",
      api_base: normalizeApiBase(settings.api_base)
    });
    return;
  }

  if (req.method === "POST") {
    try {
      const current = await readSettings();
      const body = await parseJson(req);
      const apiKey = optionalString(body.api_key) || current.api_key || "";
      const apiBase = normalizeApiBase(body.api_base || current.api_base);
      await writeSettings({ ...current, api_key: apiKey, api_base: apiBase, updated_at: new Date().toISOString() });
      sendJson(res, 200, { ok: true, api_key: apiKey, api_base: apiBase });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "保存配置失败。" });
    }
    return;
  }

  sendJson(res, 405, { error: "Method Not Allowed" });
}

async function uploadImage(apiBase, apiKey, file) {
  const form = new FormData();
  form.append("file", file, file.name || "reference.png");

  const response = await fetch(`${apiBase}/v1/uploads/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.message || data?.error?.message || `上传失败：HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!data.url) throw new Error("上传成功但未返回图片 URL");
  return data.url;
}

function numberField(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function optionalString(value) {
  const text = String(value || "").trim();
  return text || undefined;
}

async function handleGenerate(req, res) {
  const apiKey = await getApiKey(req);
  if (!apiKey) {
    sendJson(res, 401, { error: "请先配置 APIMart API Key。" });
    return;
  }

  try {
    const apiBase = await getApiBase(req);
    const form = await parseForm(req);
    const model = optionalString(form.get("model")) || "gpt-image-2-official";
    const prompt = optionalString(form.get("prompt"));
    if (!prompt) {
      sendJson(res, 400, { error: "请输入图片描述。" });
      return;
    }

    const uploadedFiles = form.getAll("references").filter((item) => item instanceof File && item.size > 0);
    if (uploadedFiles.length > 16) {
      sendJson(res, 400, { error: "参考图最多 16 张。" });
      return;
    }

    const uploadedUrls = [];
    for (const file of uploadedFiles) {
      uploadedUrls.push(await uploadImage(apiBase, apiKey, file));
    }

    const typedUrls = String(form.get("image_urls") || "")
      .split(/\r?\n|,/)
      .map((url) => url.trim())
      .filter(Boolean);

    const imageUrls = [...typedUrls, ...uploadedUrls];
    if (imageUrls.length > 16) {
      sendJson(res, 400, { error: "参考图 URL 与上传图片合计最多 16 张。" });
      return;
    }

    const body = {
      model,
      prompt,
      size: optionalString(form.get("size")) || "1:1",
      resolution: optionalString(form.get("resolution")) || "1k"
    };

    if (imageUrls.length) body.image_urls = imageUrls;

    if (model === "gpt-image-2-official") {
      body.quality = optionalString(form.get("quality")) || "auto";
      body.background = optionalString(form.get("background")) || "auto";
      body.moderation = optionalString(form.get("moderation")) || "auto";
      body.output_format = optionalString(form.get("output_format")) || "png";
      body.n = numberField(form.get("n"), 1, 1, 4);

      const compression = optionalString(form.get("output_compression"));
      if (compression !== undefined && body.output_format !== "png") {
        body.output_compression = numberField(compression, 90, 0, 100);
      }

      const maskUrl = optionalString(form.get("mask_url"));
      if (maskUrl) body.mask_url = maskUrl;
    } else {
      body.n = 1;
      if (form.get("official_fallback") === "true") body.official_fallback = true;
    }

    const response = await fetch(`${apiBase}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.code >= 400) {
      const message = data?.message || data?.error?.message || data?.error || `创建任务失败：HTTP ${response.status}`;
      sendJson(res, response.ok ? 400 : response.status, { error: message, detail: data });
      return;
    }

    const task = Array.isArray(data?.data) ? data.data[0] : data?.data;
    sendJson(res, 200, {
      task_id: task?.task_id || task?.id || data?.task_id || data?.id,
      status: task?.status || "submitted",
      request: body,
      uploaded_urls: uploadedUrls,
      raw: data
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "服务器处理失败。" });
  }
}

async function handleTask(req, res, taskId) {
  const apiKey = await getApiKey(req);
  if (!apiKey) {
    sendJson(res, 401, { error: "请先配置 APIMart API Key。" });
    return;
  }

  try {
    const apiBase = await getApiBase(req);
    const response = await fetch(`${apiBase}/v1/tasks/${encodeURIComponent(taskId)}?language=zh`, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.code >= 400) {
      const message = data?.message || data?.error?.message || data?.error || `查询任务失败：HTTP ${response.status}`;
      sendJson(res, response.ok ? 400 : response.status, { error: message, detail: data });
      return;
    }

    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "查询任务失败。" });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(STATIC_ROOT, requestPath));

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    res.end(content);
  } catch {
    const index = await readFile(join(STATIC_ROOT, "index.html"));
    res.writeHead(200, { "content-type": contentTypes[".html"] });
    res.end(index);
  }
}

function createAppServer() {
  return createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/generate") {
    await handleGenerate(req, res);
    return;
  }

  if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/settings") {
    await handleSettings(req, res);
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (req.method === "GET" && taskMatch) {
    await handleTask(req, res, taskMatch[1]);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method Not Allowed" });
  });
}

export function startServer({ port = PORT, host = "127.0.0.1", root = STATIC_ROOT, settingsDir } = {}) {
  STATIC_ROOT = root;
  if (settingsDir) SETTINGS_FILE = resolve(settingsDir, "linshu-settings.json");
  const server = createAppServer();

  return new Promise((resolveStart, rejectStart) => {
    server.once("error", rejectStart);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      const url = `http://${host}:${actualPort}`;
      console.log(`Linshu GPT Image Studio is running: ${url}`);
      resolveStart({ server, port: actualPort, url });
    });
  });
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
