const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let mainWindow;
let localServer;

async function startLocalServer() {
  const serverModuleUrl = pathToFileURL(path.join(__dirname, "server.mjs")).href;
  const { startServer } = await import(serverModuleUrl);
  const root = path.join(__dirname, "public");
  return startServer({ port: 5173, host: "127.0.0.1", root, settingsDir: app.getPath("userData") });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: "林叔的GPT绘图平台",
    backgroundColor: "#fff8ee",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
  localServer = await startLocalServer();
  createWindow(localServer.url);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(localServer.url);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (localServer?.server) localServer.server.close();
});
