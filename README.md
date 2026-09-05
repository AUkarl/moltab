<p align="center">
  <h1 align="center">MolTab</h1>
  <p align="center">
    <em>一款极简的新标签页扩展，注重隐私，数据仅存本地</em>
  </p>
  <p align="center">
    <a href="#功能特性">功能特性</a> •
    <a href="#技术架构">技术架构</a> •
    <a href="#安装使用">安装使用</a> •
    <a href="#键盘快捷键">快捷键</a> •
    <a href="#浏览器扩展">浏览器扩展</a> •
    <a href="#许可证">许可证</a>
  </p>
</p>

---

## 简介

MolTab 是一款纯前端实现的浏览器新标签页，零追踪、零广告，所有数据仅保存在浏览器本地。支持自定义书签、壁纸、天气、一言、番茄钟、待办事项等功能，提供流畅的拖拽布局和智能主题适配体验。

## 功能特性

### 搜索

- 支持 7 大搜索引擎：百度、必应、谷歌、DuckDuckGo、Yandex、搜狗、360
- 搜索历史自动保存（最多 50 条），输入时实时推荐
- 键盘快捷键快速聚焦和搜索

### 书签与网格

- 12×3 CSS Grid 自由布局，支持拖拽放置
- 书签文件夹系统，支持 1×1 / 2×2 / 3×3 三种尺寸
- 文件夹内预览网格，点击展开查看全部书签
- 拖拽两个书签重叠自动创建文件夹
- 拖拽书签到文件夹上直接归入
- 编辑模式右键菜单：编辑名称/链接/图标、调整大小、删除等
- 书签图标支持 4 种模式：自动获取网站图标、Emoji 表情、首字母、自定义图片
- FLIP 动画实现流畅的位置切换效果

### 壁纸

- 5 个内置图库：自然风光、城市建筑、抽象艺术、极简风格、必应每日
- 种子随机算法，同一天同一图库生成固定壁纸组合
- 渐进式加载：先显示缩略图，再替换为高清大图
- 支持自定义图库（URL 列表或 JSON API）
- 支持自定义壁纸 URL
- 固定当前壁纸，停止自动切换

### 主题与自适应

- 三种主题模式：浅色、深色、跟随系统
- 基于 Canvas 的局部亮度检测，文字颜色根据背景自动反色
- 每个元素独立采样，精确适配所在位置的实际背景亮度
- 夜间模式降低整体亮度

### 天气

- 自动定位：GPS → IP 地址（多服务降级）→ 反向地理编码
- 手动设置城市与经纬度
- 数据来自 Open-Meteo 开放 API，每 15 分钟自动刷新
- 天气图标与中文描述

### 一言

- 接入 hitokoto.cn API，随机展示经典语录
- 支持自定义语录内容
- 可开关显示

### 专注工具

- 番茄钟：自定义专注/休息时长，循环计数
- 待办事项：快速添加、完成、删除任务
- 作为网格卡片，可自由拖拽和调整大小

### 数据管理

- 一键导出/导入所有数据（JSON 格式）
- WebDAV 云同步：支持坚果云、群晖、Nextcloud 等
- 清除所有数据 / 清除图标缓存

### 其他

- 农历日期显示（纯算法实现，无外部依赖）
- 时段问候语（早上好/上午好/中午好/下午好/晚上好/夜深了）
- 时间校准（自动同步网络时间）
- Service Worker 离线缓存
- 完整键盘快捷键支持

## 技术架构

```
纯原生 JavaScript · 零框架依赖 · ES Modules
```

| 模块 | 文件 | 职责 |
|------|------|------|
| 入口 | `app/app.js` | 实例化所有模块，注册 Service Worker |
| 时钟 | `app/time.js` | 时间显示、网络时间校准、农历日期 |
| 农历 | `app/lunar.js` | 公历转农历纯算法实现 |
| 问候 | `app/greeting.js` | 按时段显示问候语 |
| 搜索 | `app/search.js` | 多引擎搜索、历史记录、键盘快捷键 |
| 天气 | `app/weather.js` | 天气获取与显示，GPS/IP 定位 |
| 壁纸 | `app/wallpaper.js` | 壁纸管理、种子算法、渐进加载 |
| 主题 | `app/theme.js` | 主题切换、Canvas 局部亮度采样 |
| 书签 | `app/bookmarks.js` | 书签/文件夹 CRUD、图标渲染 |
| 网格 | `app/grid.js` | 12×3 网格布局、拖拽、碰撞检测、右键菜单 |
| 专注 | `app/focus.js` | 番茄钟、待办事项 |
| 图标 | `app/favicon.js` | 网站图标多源获取与缓存 |
| 设置 | `app/settings.js` | 7 个设置标签页、WebDAV 同步 |
| 离线 | `sw.js` | Service Worker 缓存策略 |

### 核心技术

- **CSS Grid 12×3 布局** — 碰撞检测 + 自动排列 + 拖拽放置指示器
- **Container Queries** — 小工具内部文字/按钮随卡片尺寸自适应缩放
- **Canvas 亮度采样** — 将背景图绘制到 100px 宽的离屏 Canvas，逐元素采样对应位置亮度
- **种子随机壁纸** — 日期 + 图库 + 关键词生成确定性种子，Picsum 提供图片
- **FLIP 动画** — 记录旧位置 → 重新渲染 → 计算偏移 → transform 过渡
- **渐进图片加载** — 先加载 320×180 缩略图，再加载 1920×1080 大图

### 数据存储

所有数据保存在 `localStorage`，键名以 `moltap-` 为前缀：

| 键名 | 内容 |
|------|------|
| `moltap-bookmarks` | 书签与文件夹数据 |
| `moltap-theme` | 主题模式 |
| `moltap-gallery` | 当前图库 |
| `moltap-engine` | 搜索引擎 |
| `moltap-weather-mode` | 天气定位方式 |
| `moltap-hitokoto-*` | 一言配置 |
| `moltap-todos` | 待办事项 |
| `moltap-focus-layout` | 专注工具网格位置 |
| `moltap-favicon-cache` | 网站图标缓存 |
| `moltap-webdav-*` | WebDAV 配置 |

## 安装使用

### 直接作为新标签页

1. 克隆或下载本仓库
2. 用浏览器直接打开 `index.html`

### 设置为浏览器新标签页

推荐使用浏览器扩展方式（见下方），或通过浏览器设置将启动页指向本地文件。

### 浏览器扩展

项目包含 Chrome、Edge、Firefox 扩展配置文件，位于 `tab插件/` 目录下：

- **Chrome**：`tab插件/Chrome/` → 开发者模式加载
- **Edge**：`tab插件/edge/` → 开发者模式加载
- **Firefox**：`tab插件/firfox/` → 临时加载附加组件

扩展版本额外支持：
- 智能标签页管理（按域名自动分组）
- 浏览历史搜索建议
- 跨设备实时同步

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + K` 或 `/` | 聚焦搜索框 |
| `1` - `9` | 快速打开前 9 个书签 |
| `Esc` | 关闭弹窗 / 退出编辑 |
| `?` | 显示快捷键帮助 |
| `Ctrl + ,` | 打开设置 |

## 项目结构

```
moltab/
├── index.html          # 主页面
├── sw.js               # Service Worker
├── app/
│   ├── app.js          # 入口，模块初始化
│   ├── time.js         # 时钟与农历
│   ├── lunar.js        # 公历转农历算法
│   ├── greeting.js     # 时段问候语
│   ├── search.js       # 多引擎搜索
│   ├── weather.js      # 天气模块
│   ├── wallpaper.js    # 壁纸管理
│   ├── theme.js        # 主题与亮度适配
│   ├── bookmarks.js    # 书签管理
│   ├── grid.js         # 网格布局引擎
│   ├── focus.js        # 番茄钟与待办
│   ├── favicon.js      # 图标获取
│   └── settings.js     # 设置面板
├── css/
│   └── style.css       # 全部样式
├── fonts/              # IcoMoon 图标字体
├── img/                # 图片资源
├── privacy/
│   └── tab.html        # 隐私政策与版权声明
├── tab插件/             # 浏览器扩展
│   ├── Chrome/
│   ├── edge/
│   └── firfox/
├── CHANGELOG.md        # 更新日志
├── LICENSE             # MIT 许可证
└── README.md           # 本文件
```

## 使用的 API

| 服务 | 用途 | 地址 |
|------|------|------|
| Lorem Picsum | 随机壁纸图片 | picsum.photos |
| Bing HPImageArchive | 必应每日壁纸 | bing.com |
| Open-Meteo | 天气数据 | open-meteo.com |
| BigDataCloud | 反向地理编码 | bigdatacloud.net |
| ipapi / ip.sb / ipinfo | IP 定位（降级） | — |
| hitokoto.cn | 一言语录 | v1.hitokoto.cn |
| WorldTimeAPI | 时间校准 | worldtimeapi.org |
| Google / DuckDuckGo / favicon.im | 网站图标 | — |

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

Copyright (c) 2025-2026 知止 (Hardy)
