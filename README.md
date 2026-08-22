# MolTab · 极简搜索

一个轻量级的 Firefox 新标签页扩展，提供多引擎搜索、天气、每日壁纸、书签管理和一言功能。

## 构建说明

本扩展为纯静态前端项目，无需编译或构建步骤。

### 运行环境要求
- 操作系统：任何支持 Firefox 浏览器的系统（Windows、macOS、Linux）
- Firefox 浏览器版本：91.0 或更高

### 安装与测试
1. 克隆或下载本仓库。
2. 在 Firefox 地址栏输入 `about:debugging#/runtime/this-firefox`。
3. 点击“临时加载附加组件”，选择项目根目录下的 `manifest.json` 文件。
4. 打开新标签页即可看到效果。

### 打包为正式版本
1. 将所有文件（manifest.json, newtab.html, style.css, script.js, icons/）选中，压缩为 ZIP 文件。
2. 确保 ZIP 根目录直接包含上述文件和文件夹（不要嵌套目录）。
3. 将 ZIP 文件上传至 Firefox 附加组件商店 (AMO)。

### 源代码说明
- 所有代码均为手写，未使用第三方库或框架。
- 没有转译、拼接、压缩或机器生成步骤。
- 图标为自定义 PNG 图片，可自行替换。

## 技术栈
- HTML5
- CSS3 (变量、Flexbox、毛玻璃效果)
- Vanilla JavaScript (ES6+)
- 浏览器 API：localStorage、Geolocation、Fetch

## 许可证
Copyright © 2025 Hardy. All rights reserved.