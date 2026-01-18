# 快速安装

本指南将帮助你在几分钟内开始使用流畅阅读。

## 安装插件

根据你使用的浏览器，选择相应的安装方式：

### Chrome 浏览器
1. 访问 [Chrome 应用商店](https://chromewebstore.google.com/detail/%E6%B5%81%E7%95%85%E9%98%85%E8%AF%BB/djnlaiohfaaifbibleebjggkghlmcpcj?hl=zh-CN&authuser=0)
2. 点击"添加到 Chrome"
3. 在弹出窗口中确认安装

::: tip 国内用户
如果无法访问 Chrome 应用商店，可以通过 [CrxSoso](https://www.crxsoso.com/webstore/detail/djnlaiohfaaifbibleebjggkghlmcpcj) 安装
:::

### Edge 浏览器
1. 访问 [Edge 应用商店](https://microsoftedge.microsoft.com/addons/detail/%E6%B5%81%E7%95%85%E9%98%85%E8%AF%BB/kakgmllfpjldjhcnkghpplmlbnmcoflp?hl=zh-CN)
2. 点击"获取"按钮
3. 在弹出窗口中确认安装

### Firefox 浏览器
1. 访问 [Firefox 附加组件商店](https://addons.mozilla.org/zh-CN/firefox/addon/%E6%B5%81%E7%95%85%E9%98%85%E8%AF%BB/?utm_source=addons.mozilla.org&utm_medium=referral&utm_content=search)
2. 点击"添加到 Firefox"
3. 在弹出窗口中确认安装

### 手动安装
如果无法通过应用商店安装，你可以手动安装：

1. 打开浏览器的扩展程序管理页面
2. 启用"开发者模式"
3. 将下载的**插件压缩包**拖入浏览器窗口完成安装

<div style="display: flex; justify-content: space-between;">
  <img src="/screenshot-1.png" alt="开启开发者模式" style="width: 45%; max-width: 100%;border: 1px solid black;margin: 5px;border-radius: 8px;box-shadow: 0 2px 4px rgba(0,0,0,0.1);" />
  <img src="/screenshot-2.png" alt="拖入安装包" style="width: 45%; max-width: 100%;border: 1px solid black;margin: 5px;border-radius: 8px;box-shadow: 0 2px 4px rgba(0,0,0,0.1);" />
</div>

## 使用方式

### 1. 自动翻译（零操作）
安装并启用后，**非中文网站会自动全文翻译为中文**，无需任何操作。

### 2. 黑名单（主域名）
当某个站点不需要自动翻译时，可快速加入黑名单：

- **右键页面** → `FluentRead` → `加入黑名单并撤销翻译`
- **Popup 面板** → `站点黑名单` → `加入黑名单` / `移除`

### 3. 翻译引擎
插件仅保留 3 个引擎：

- **微软翻译**
- **谷歌翻译**
- **本地模型 (Ollama)**：默认地址 `http://localhost:11434/v1/chat/completions`

### 4. Ollama 最小配置
确保 Ollama 正在运行，并在 Popup 中选择 **本地模型 (Ollama)**：

- 模型：默认 `llama3`（可改为本地已有模型）
- 服务地址：`http://localhost:11434/v1/chat/completions`

## 下一步

- 了解[功能介绍](./features.md)来掌握当前功能
- 访问我们的 [GitHub 仓库](https://github.com/Bistutu/FluentRead)参与讨论
