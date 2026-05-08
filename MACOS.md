# macOS 版本打包说明

当前仓库已经加入 macOS 打包配置。

## 重要限制

macOS 桌面包不能在这台 Windows 电脑上原生生成。Electron 的 Mac 包需要在 macOS 环境里构建，建议使用：

- 一台 Mac 电脑本地构建。
- GitHub Actions 的 `macos-latest` runner 构建。

本仓库已添加 GitHub Actions 工作流：

```text
.github/workflows/build-macos.yml
```

## 在 Mac 电脑上本地构建

进入项目目录后执行：

```bash
npm ci
npm run dist:mac
```

输出目录：

```text
release
```

预期产物：

```text
release/林叔的GPT绘图平台-0.1.0-arm64.dmg
release/林叔的GPT绘图平台-0.1.0-arm64.zip
```

不同 Mac 或 Electron Builder 版本可能会生成 `x64`、`arm64` 或 universal 文件名，以实际 `release` 目录为准。

## 用 GitHub Actions 构建

1. 把项目推到 GitHub。
2. 打开仓库的 `Actions` 页面。
3. 选择 `build-macos`。
4. 点击 `Run workflow`。
5. 构建完成后下载 artifacts：
   - `macos-dmg`
   - `macos-zip`

工作流默认关闭证书自动发现：

```text
CSC_IDENTITY_AUTO_DISCOVERY=false
```

所以产物是未签名版本。

## 未签名应用提示

未签名 macOS 应用在别人的电脑上可能提示“无法验证开发者”或“已损坏”。这是因为没有 Apple Developer ID 证书和 notarization。

临时测试方式：

- 右键应用，选择“打开”。
- 或在终端里对解压后的 app 执行：

```bash
xattr -dr com.apple.quarantine "/Applications/林叔的GPT绘图平台.app"
```

正式分发给客户时，建议使用 Apple Developer ID 证书签名并 notarize。

## 当前配置位置

`package.json` 已加入：

```json
{
  "scripts": {
    "dist:mac": "electron-builder --mac dmg zip"
  },
  "build": {
    "mac": {
      "target": ["dmg", "zip"],
      "category": "public.app-category.graphics-design"
    }
  }
}
```

macOS 版本仍然复用现有逻辑：

- 固定本地端口 `127.0.0.1:5173`
- 本机保存 API Key
- 生成中界面只显示 `正在生成图片` 和 `请稍后`
- 支持历史记录继续查询
