const STORAGE = {
  apiKey: "warm-sun.apimart.key",
  apiBase: "warm-sun.apimart.base",
  history: "warm-sun.history"
};

const ratios = [
  ["auto", "自动", { "1k": "服务端自动", "2k": "服务端自动", "4k": "服务端自动" }],
  ["1:1", "正方", { "1k": "1024×1024", "2k": "2048×2048", "4k": null }],
  ["3:2", "横图", { "1k": "1536×1024", "2k": "2048×1360", "4k": null }],
  ["2:3", "竖图", { "1k": "1024×1536", "2k": "1360×2048", "4k": null }],
  ["4:3", "横图", { "1k": "1024×768", "2k": "2048×1536", "4k": null }],
  ["3:4", "竖图", { "1k": "768×1024", "2k": "1536×2048", "4k": null }],
  ["5:4", "横图", { "1k": "1280×1024", "2k": "2560×2048", "4k": null }],
  ["4:5", "竖图", { "1k": "1024×1280", "2k": "2048×2560", "4k": null }],
  ["16:9", "宽屏", { "1k": "1536×864", "2k": "2048×1152", "4k": "3840×2160" }],
  ["9:16", "手机竖屏", { "1k": "864×1536", "2k": "1152×2048", "4k": "2160×3840" }],
  ["2:1", "横幅", { "1k": "2048×1024", "2k": "2688×1344", "4k": "3840×1920" }],
  ["1:2", "长竖幅", { "1k": "1024×2048", "2k": "1344×2688", "4k": "1920×3840" }],
  ["21:9", "电影超宽", { "1k": "2016×864", "2k": "2688×1152", "4k": "3840×1648" }],
  ["9:21", "超长竖屏", { "1k": "864×2016", "2k": "1152×2688", "4k": "1648×3840" }]
];

const resolutions = [
  ["1k", "1K 标准"],
  ["2k", "2K 高清"],
  ["4k", "4K 超清"]
];

const $ = (selector) => document.querySelector(selector);
const form = $("#generationForm");
const sizeSelect = $("#size");
const resolutionSelect = $("#resolution");
const pixelHint = $("#pixelHint");
const modelInput = $("#model");
const modelHint = $("#modelHint");
const officialOptions = $("#officialOptions");
const fallbackRow = $("#fallbackRow");
const referenceInput = $("#references");
const referenceGrid = $("#referenceGrid");
const referenceCount = $("#referenceCount");
const imageGrid = $("#imageGrid");
const emptyState = $("#emptyState");
const runningState = $("#runningState");
const taskTitle = $("#taskTitle");
const taskDetail = $("#taskDetail");
const progressBar = $("#progressBar");
const generateButton = $("#generateButton");
const toast = $("#toast");

let referenceFiles = [];
let activeTask = null;
let toastTimer = null;
const MAX_POLL_ATTEMPTS = 180;
const MAX_POLL_ERRORS = 6;
const SLOW_WAIT_GRACE_MS = 20000;

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function loadStorage(key, fallback = "") {
  return localStorage.getItem(key) || fallback;
}

async function loadPersistedSettings() {
  const response = await fetch("/api/settings");
  if (!response.ok) return {};
  const settings = await response.json();
  if (settings.api_key) localStorage.setItem(STORAGE.apiKey, settings.api_key);
  if (settings.api_base) localStorage.setItem(STORAGE.apiBase, settings.api_base);
  return settings;
}

async function saveApiSettings() {
  const key = $("#apiKey").value.trim() || $("#apiKeyInline").value.trim();
  const base = $("#apiBase").value.trim() || "https://api.apimart.ai";
  if (key) localStorage.setItem(STORAGE.apiKey, key);
  localStorage.setItem(STORAGE.apiBase, base);

  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, api_base: base })
  });
  const settings = await response.json();
  if (!response.ok) throw new Error(settings.error || "保存配置失败。");

  $("#apiKeyInline").value = key;
  $("#apiKey").value = key;
  $("#settingsButton").textContent = key ? "已配置" : "API Key";
  showToast("配置已保存");
}

function initSelects() {
  sizeSelect.innerHTML = ratios
    .map(([value, label]) => `<option value="${value}">${value} ${label}</option>`)
    .join("");
  resolutionSelect.innerHTML = resolutions
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  sizeSelect.value = "1:1";
  resolutionSelect.value = "1k";
  updateResolutionState();
}

function ratioMeta() {
  return ratios.find(([value]) => value === sizeSelect.value) || ratios[1];
}

function updateResolutionState() {
  const [, , pixels] = ratioMeta();
  const selected = resolutionSelect.value;

  [...resolutionSelect.options].forEach((option) => {
    option.disabled = option.value === "4k" && !pixels["4k"];
  });

  if (selected === "4k" && !pixels["4k"]) {
    resolutionSelect.value = "2k";
    showToast("该比例不支持 4K，已切换到 2K。");
  }

  const current = resolutionSelect.value;
  const pixel = pixels[current] || "该组合不可用";
  pixelHint.textContent = `实际像素：${pixel}`;
  $("#resolutionHint").textContent =
    current === "4k" ? "4K 只支持 16:9、9:16、2:1、1:2、21:9、9:21。" : "1K 日常够用，2K 适合海报，4K 仅部分比例可用。";
}

function setModel(model) {
  modelInput.value = model;
  document.querySelectorAll(".model-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.model === model);
  });

  const isOfficial = model === "gpt-image-2-official";
  officialOptions.classList.toggle("visible", isOfficial);
  fallbackRow.classList.toggle("hidden", isOfficial);
  $("#n").disabled = !isOfficial;
  modelHint.textContent = isOfficial
    ? "官方通道支持单次最多 4 张、质量/格式/审核等高级选项。"
    : "普通通道支持图生图，单次生成 1 张，可开启官方渠道兜底。";
}

function renderReferences() {
  referenceCount.textContent = `${referenceFiles.length}/16`;
  referenceGrid.innerHTML = "";

  referenceFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "reference-item";
    const image = document.createElement("img");
    image.alt = file.name;
    image.src = URL.createObjectURL(file);
    image.onload = () => URL.revokeObjectURL(image.src);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      referenceFiles.splice(index, 1);
      renderReferences();
    });
    item.append(image, remove);
    referenceGrid.append(item);
  });
}

function addReferenceFiles(files) {
  const incoming = [...files].filter((file) => file.type.startsWith("image/"));
  if (!incoming.length) return;

  const remaining = 16 - referenceFiles.length;
  if (incoming.length > remaining) showToast("参考图最多 16 张，已自动截断。");
  referenceFiles = [...referenceFiles, ...incoming.slice(0, remaining)];
  renderReferences();
}

function buildHeaders() {
  const apiKey = loadStorage(STORAGE.apiKey);
  const apiBase = loadStorage(STORAGE.apiBase, "https://api.apimart.ai");
  return {
    "x-apimart-key": apiKey,
    "x-apimart-base": apiBase
  };
}

function collectImageUrls(value, urls = []) {
  if (!value) return urls;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) urls.push(value);
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrls(item, urls));
    return urls;
  }
  if (typeof value === "object") {
    ["url", "image_url", "image_urls", "urls", "images", "output", "result"].forEach((key) => {
      collectImageUrls(value[key], urls);
    });
  }
  return urls;
}

function extractImages(taskData) {
  return [...new Set(collectImageUrls(taskData?.data))];
}

function renderImages(urls) {
  imageGrid.innerHTML = "";
  urls.forEach((url, index) => {
    const card = document.createElement("article");
    card.className = "image-card";
    const image = document.createElement("img");
    image.src = url;
    image.alt = `生成图片 ${index + 1}`;
    const actions = document.createElement("div");
    actions.className = "image-actions";
    actions.innerHTML = `
      <a href="${url}" target="_blank" rel="noreferrer">打开原图</a>
      <a href="${url}" download>下载</a>
    `;
    card.append(image, actions);
    imageGrid.append(card);
  });

  emptyState.classList.add("hidden");
  runningState.classList.add("hidden");
  imageGrid.classList.remove("hidden");
}

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}分${String(rest).padStart(2, "0")}秒` : `${rest}秒`;
}

function statusLabel(status) {
  const labels = {
    submitted: "已提交",
    pending: "排队中",
    processing: "处理中",
    in_progress: "处理中",
    retrying: "正在重试查询",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    timeout: "等待超时"
  };
  return labels[status] || status || "处理中";
}

function displayProgress(status, progress, attempts) {
  if (Number.isFinite(progress) && progress > 0) return progress;
  if (["pending", "submitted"].includes(status)) return Math.min(42, 8 + attempts * 2);
  if (status === "retrying") return Math.min(58, 12 + attempts * 2);
  return Math.min(92, 28 + attempts * 4);
}

function setRunning(taskId, status = "submitted", progress = 5, meta = {}) {
  emptyState.classList.add("hidden");
  imageGrid.classList.add("hidden");
  runningState.classList.remove("hidden");
  taskTitle.textContent = "正在生成图片";
  taskDetail.textContent = "请稍后";
  progressBar.style.width = `${Math.max(5, Math.min(progress || 5, 100))}%`;
}

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE.history) || "[]");
  } catch {
    return [];
  }
}

function writeHistory(items) {
  localStorage.setItem(STORAGE.history, JSON.stringify(items.slice(0, 30)));
}

function upsertHistory(item) {
  const history = readHistory();
  const index = item.taskId ? history.findIndex((entry) => entry.taskId === item.taskId) : -1;
  const createdAt = index >= 0 ? history[index].createdAt : Date.now();
  const nextItem = { ...(index >= 0 ? history[index] : {}), ...item, createdAt, updatedAt: Date.now() };

  if (index >= 0) {
    history[index] = nextItem;
  } else {
    history.unshift(nextItem);
  }
  writeHistory(history);
  renderHistory();
}

function addHistory(item) {
  upsertHistory(item);
}

function renderHistory() {
  const list = $("#historyList");
  const history = readHistory();
  if (!history.length) {
    list.innerHTML = `<p class="muted">还没有生成记录。</p>`;
    return;
  }
  list.innerHTML = "";
  history.forEach((item) => {
    const card = document.createElement("article");
    card.className = "history-item";
    const date = new Date(item.createdAt).toLocaleString();
    const statusText = item.images?.length ? "已完成" : item.status === "failed" ? "失败" : "可继续查询";
    card.innerHTML = `
      <button type="button">
        <strong>${item.model || "gpt-image-2"} · ${item.size || "1:1"} · ${item.resolution || "1k"}</strong>
        <p>${item.prompt || ""}</p>
        <p>${statusText}${item.taskId ? ` · ${item.taskId}` : ""}</p>
        <p>${date}</p>
      </button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      $("#prompt").value = item.prompt || "";
      if (item.images?.length) {
        renderImages(item.images);
      } else if (item.taskId) {
        continueHistoryTask(item);
      }
      $("#historyDrawer").classList.remove("open");
    });
    list.append(card);
  });
}

async function pollTask(taskId, requestPayload) {
  activeTask = taskId;
  let attempts = 0;
  let errors = 0;
  const startedAt = requestPayload.startedAt || Date.now();

  while (activeTask === taskId && attempts < MAX_POLL_ATTEMPTS) {
    attempts += 1;
    await new Promise((resolve) => setTimeout(resolve, attempts === 1 ? 10000 : 4000));

    let data;
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        headers: buildHeaders()
      });
      data = await response.json();
      if (!response.ok) throw new Error(data.error || "查询任务失败。");
      errors = 0;
    } catch (error) {
      errors += 1;
      setRunning(taskId, "retrying", displayProgress("retrying", null, attempts), {
        elapsedMs: Date.now() - startedAt
      });
      if (errors >= MAX_POLL_ERRORS) throw error;
      continue;
    }

    const task = data.data || {};
    const status = task.status || "processing";
    const urls = extractImages(data);
    const done = ["completed", "succeeded", "success"].includes(status);
    const elapsedMs = Date.now() - startedAt;
    const estimatedTime = Number(task.estimated_time);
    setRunning(taskId, status, displayProgress(status, Number(task.progress), attempts), {
      elapsedMs,
      estimatedTime,
      slow: Number.isFinite(estimatedTime) && elapsedMs > estimatedTime * 1000 + SLOW_WAIT_GRACE_MS
    });
    upsertHistory({ ...requestPayload, taskId, status });

    if (urls.length && !["failed", "cancelled"].includes(status)) {
      renderImages(urls);
      addHistory({ ...requestPayload, taskId, status: "completed", images: urls });
      showToast("图片生成完成");
      return;
    }

    if (done) {
      throw new Error("任务已完成，但没有返回图片 URL。");
    }

    if (["failed", "cancelled"].includes(status)) {
      upsertHistory({ ...requestPayload, taskId, status });
      throw new Error(task?.error?.message || `任务${status === "failed" ? "失败" : "已取消"}。`);
    }
  }

  upsertHistory({ ...requestPayload, taskId, status: "timeout" });
  throw new Error(`等待超时，Task ID 已保存到历史记录：${taskId}。稍后点击历史记录可继续查询。`);
}

async function continueHistoryTask(item) {
  generateButton.disabled = true;
  generateButton.textContent = "查询中...";
  setRunning(item.taskId, item.status || "processing", 15);

  try {
    await pollTask(item.taskId, item);
  } catch (error) {
    runningState.classList.add("hidden");
    emptyState.classList.remove("hidden");
    showToast(error.message || "查询任务失败。");
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = "生成图片";
  }
}

async function submitGeneration(event) {
  event.preventDefault();
  let apiKey = loadStorage(STORAGE.apiKey);
  if (!apiKey) {
    const settings = await loadPersistedSettings().catch(() => ({}));
    apiKey = settings.api_key || "";
  }
  if (!apiKey) {
    $("#settingsDialog").showModal();
    showToast("请先保存 API Key。");
    return;
  }

  const prompt = $("#prompt").value.trim();
  if (!prompt) {
    showToast("请输入图片描述。");
    $("#prompt").focus();
    return;
  }

  const data = new FormData(form);
  referenceFiles.forEach((file) => data.append("references", file, file.name));
  if ($("#officialFallback").checked && modelInput.value !== "gpt-image-2-official") {
    data.set("official_fallback", "true");
  }

  generateButton.disabled = true;
  generateButton.textContent = "生成中...";
  setRunning(null);

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: buildHeaders(),
      body: data
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "创建任务失败。");
    if (!result.task_id) throw new Error("接口未返回 task_id。");

    const requestPayload = {
      prompt,
      model: modelInput.value,
      size: sizeSelect.value,
      resolution: resolutionSelect.value,
      startedAt: Date.now()
    };
    upsertHistory({ ...requestPayload, taskId: result.task_id, status: result.status || "submitted" });
    setRunning(result.task_id, result.status, 8);
    showToast("任务已提交，开始轮询结果。");
    await pollTask(result.task_id, requestPayload);
  } catch (error) {
    runningState.classList.add("hidden");
    emptyState.classList.remove("hidden");
    showToast(error.message || "生成失败。");
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = "生成图片";
  }
}

function bindEvents() {
  sizeSelect.addEventListener("change", updateResolutionState);
  resolutionSelect.addEventListener("change", updateResolutionState);

  document.querySelectorAll(".model-tab").forEach((button) => {
    button.addEventListener("click", () => setModel(button.dataset.model));
  });

  $("#uploadButton").addEventListener("click", () => referenceInput.click());
  referenceInput.addEventListener("change", () => {
    addReferenceFiles(referenceInput.files);
    referenceInput.value = "";
  });

  const uploadZone = $("#uploadZone");
  ["dragenter", "dragover"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.remove("dragging");
    });
  });
  uploadZone.addEventListener("drop", (event) => addReferenceFiles(event.dataTransfer.files));

  form.addEventListener("submit", submitGeneration);
  $("#prompt").addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "Enter") form.requestSubmit();
  });

  $("#settingsButton").addEventListener("click", () => $("#settingsDialog").showModal());
  $("#saveSettings").addEventListener("click", () => {
    saveApiSettings().catch((error) => showToast(error.message || "保存配置失败。"));
  });
  $("#saveInlineKey").addEventListener("click", () => {
    $("#apiKey").value = $("#apiKeyInline").value;
    saveApiSettings().catch((error) => showToast(error.message || "保存配置失败。"));
  });

  $("#historyButton").addEventListener("click", () => {
    renderHistory();
    $("#historyDrawer").classList.add("open");
  });
  $("#closeHistory").addEventListener("click", () => $("#historyDrawer").classList.remove("open"));
  $("#historyDrawer").addEventListener("click", (event) => {
    if (event.target.id === "historyDrawer") $("#historyDrawer").classList.remove("open");
  });
  $("#clearHistory").addEventListener("click", () => {
    writeHistory([]);
    renderHistory();
    showToast("历史已清空");
  });
}

async function initSettings() {
  let key = loadStorage(STORAGE.apiKey);
  let base = loadStorage(STORAGE.apiBase, "https://api.apimart.ai");

  try {
    const settings = await loadPersistedSettings();
    key = settings.api_key || key;
    base = settings.api_base || base;
  } catch {
    // Local storage remains a fallback when the desktop settings file is unavailable.
  }

  $("#apiKey").value = key;
  $("#apiKeyInline").value = key;
  $("#apiBase").value = base;
  $("#settingsButton").textContent = key ? "已配置" : "API Key";
}

initSelects();
setModel("gpt-image-2");
initSettings();
renderReferences();
renderHistory();
bindEvents();
