/**
 * settings.js — 设置面板管理器
 * 提供 7 个标签页：背景/天气/书签/一言/专注/数据/关于
 * 包含通用表单弹窗、图标选择器、WebDAV 云同步等功能
 */
import { fetchFavicon, getDomain, getLetterIcon, clearFaviconCache } from './favicon.js';

// 图标编辑器中可选的 40 个预设表情
const EMOJIS = ['⭐','🌟','💎','🔥','🎯','🎨','🎵','📚','💡','🌈','❤️','🍀','🎮','📷','🏠','💼','🔧','📱','💻','🌍','🎁','🚀','⚡','🌸','🍎','🎪','🏆','🎭','📌','🔑','🎲','🌙','☀️','🦋','🐬','🌺','🍒','🎈','📝','🔔'];

/**
 * 设置面板管理器：管理模态框的打开/关闭/标签切换，以及各标签页的内容渲染
 * 依赖：wallpaper、theme、weather、bookmarks、hitokoto、grid 六个模块
 */
export class SettingsManager {
    constructor({ wallpaper, theme, weather, bookmarks, hitokoto, grid }) {
        this.wallpaper = wallpaper;
        this.theme = theme;
        this.weather = weather;
        this.bookmarks = bookmarks;
        this.hitokoto = hitokoto;
        this.grid = grid;
        // 模态框 DOM 引用
        this.overlay = document.getElementById('modalOverlay');
        this.tabs = document.getElementById('modalTabs');
        this.body = document.getElementById('modalBody');
        this.closeBtn = document.getElementById('modalCloseBtn');
    }

    // 初始化：绑定设置按钮、关闭按钮、遮罩点击关闭、标签切换、Esc 关闭
    // 监听壁纸变化事件，若设置面板打开且在背景标签页则自动刷新
    init() {
        document.getElementById('settingsBtn').addEventListener('click', () => this.open());
        this.closeBtn.addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });
        this.tabs.addEventListener('click', e => {
            const tab = e.target.closest('.modal-tab');
            if (tab) this.switchTab(tab.dataset.tab);
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
        this.wallpaper.onChange(() => {
            if (!this.overlay.classList.contains('hidden')) {
                const activeTab = this.tabs.querySelector('.modal-tab.active');
                if (activeTab?.dataset.tab === 'bg') this.renderBg();
            }
        });
    }

    // 打开设置面板，默认显示背景标签页
    open() { this.overlay.classList.remove('hidden'); this.switchTab('bg'); }
    // 关闭设置面板
    close() { this.overlay.classList.add('hidden'); }

    // 切换标签页：高亮对应 tab 按钮，调用对应的渲染方法
    switchTab(name) {
        this.tabs.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        const renderers = { bg: () => this.renderBg(), weather: () => this.renderWeather(), bookmarks: () => this.renderBookmarks(), hitokoto: () => this.renderHitokoto(), focus: () => this.renderFocus(), data: () => this.renderData(), about: () => this.renderAbout() };
        (renderers[name] || renderers.bg)();
    }

    // 通用表单弹窗：接受 { title, fields, onSubmit } 配置
    // fields 数组中每项支持 type(text/textarea)、label、name、value、placeholder、rows
    // 提交时收集所有字段值传入 onSubmit(values)；Enter 键快捷提交（textarea 内除外）
    showFormModal({ title, fields, onSubmit }) {
        const overlay = document.createElement('div');
        overlay.className = 'form-modal-overlay';
        const fieldsHtml = fields.map(f => {
            if (f.type === 'textarea') {
                return `<div class="form-field"><label>${this.esc(f.label)}</label><textarea class="input-sm" id="fm-${f.name}" rows="${f.rows || 4}" placeholder="${this.esc(f.placeholder || '')}" style="resize:vertical;min-height:60px">${this.esc(f.value || '')}</textarea></div>`;
            }
            return `<div class="form-field"><label>${this.esc(f.label)}</label><input id="fm-${f.name}" type="${f.type || 'text'}" value="${this.esc(f.value || '')}" placeholder="${this.esc(f.placeholder || '')}"></div>`;
        }).join('');
        overlay.innerHTML = `
            <div class="form-modal-card">
                <h3>${this.esc(title)}</h3>
                ${fieldsHtml}
                <div class="form-actions">
                    <button class="btn-sm" id="fmCancel">取消</button>
                    <button class="btn-sm primary" id="fmSave">保存</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const firstInput = overlay.querySelector('input, textarea');
        if (firstInput) { firstInput.focus(); firstInput.select(); }
        overlay.querySelector('#fmCancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#fmSave').addEventListener('click', () => {
            const values = {};
            fields.forEach(f => {
                const el = overlay.querySelector(`#fm-${f.name}`);
                values[f.name] = el ? el.value.trim() : '';
            });
            overlay.remove();
            onSubmit(values);
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        overlay.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                overlay.querySelector('#fmSave').click();
            }
        });
        return overlay;
    }

    // 渲染「背景」标签页：主题模式切换、图库选择、壁纸预览网格、自定义壁纸 URL、固定壁纸
    renderBg() {
        const galleries = this.wallpaper.getAllGalleries();
        const currentGallery = this.wallpaper.currentGallery;
        const seeds = this.wallpaper.seeds;
        let html = `
            <div class="section-title">主题模式</div>
            <div class="setting-row">
                <div class="theme-switch" id="themeSwitch">
                    <button class="theme-switch-btn ${this.theme.mode === 'light' ? 'active' : ''}" data-mode="light">☀️ 浅色</button>
                    <button class="theme-switch-btn ${this.theme.mode === 'dark' ? 'active' : ''}" data-mode="dark">🌙 深色</button>
                    <button class="theme-switch-btn ${this.theme.mode === 'auto' ? 'active' : ''}" data-mode="auto">🔄 自动</button>
                </div>
            </div>
            <div class="section-title">图库</div>
            <div class="gallery-tabs" id="galleryTabs">
                ${galleries.map(g => `<button class="gallery-tab ${g.id === currentGallery ? 'active' : ''}" data-gallery="${g.id}">${g.name}</button>`).join('')}
                <button class="gallery-tab" id="addGalleryBtn" style="border-style:dashed">+ 自定义</button>
            </div>
            <div class="bg-preview-grid" id="bgPreviewGrid">
                ${seeds.map((item, i) => `
                    <div class="bg-preview-item ${i === this.wallpaper.currentBgIndex ? 'active' : ''}" data-index="${i}" style="background-image:url(${this.wallpaper.getThumbUrl(item)})">
                        ${i === this.wallpaper.currentBgIndex ? '<div class="check-mark">✓</div>' : ''}
                    </div>
                `).join('')}
            </div>
            <div class="section-title">自定义壁纸</div>
            <div class="setting-row">
                <input class="input-sm" id="customBgInput" placeholder="输入图片URL..." value="${this.wallpaper.customBgUrl || ''}">
                <button class="btn-sm primary" id="applyCustomBg">应用</button>
            </div>
            <div class="setting-row">
                <button class="btn-sm" id="refreshBg">🔄 换一批</button>
                ${this.wallpaper.customBgUrl ? '<button class="btn-sm danger" id="clearCustomBg">清除自定义壁纸</button>' : ''}
            </div>
            <div class="section-title">固定壁纸</div>
            <div class="setting-row">
                <span class="setting-label">${this.wallpaper.isPinned() ? '📌 当前壁纸已固定，不会自动切换' : '固定当前壁纸，停止自动切换'}</span>
                ${this.wallpaper.isPinned()
                    ? '<button class="btn-sm danger" id="unpinWallpaper">取消固定</button>'
                    : '<button class="btn-sm primary" id="pinWallpaper">📌 固定</button>'}
            </div>`;
        this.body.innerHTML = html;
        this.body.querySelector('#themeSwitch').addEventListener('click', e => {
            const btn = e.target.closest('.theme-switch-btn');
            if (btn) { this.theme.setMode(btn.dataset.mode); this.switchTab('bg'); }
        });
        this.body.querySelector('#galleryTabs').addEventListener('click', async e => {
            const tab = e.target.closest('.gallery-tab');
            if (tab && tab.id !== 'addGalleryBtn') { if (this.wallpaper.isPinned()) this.wallpaper.unpin(); await this.wallpaper.setGallery(tab.dataset.gallery); this.switchTab('bg'); }
            if (tab?.id === 'addGalleryBtn') this.showAddGalleryModal();
        });
        this.body.querySelector('#bgPreviewGrid').addEventListener('click', e => {
            const item = e.target.closest('.bg-preview-item');
            if (item) { if (this.wallpaper.isPinned()) this.wallpaper.unpin(); this.wallpaper.setBgImage(+item.dataset.index); this.switchTab('bg'); }
        });
        this.body.querySelector('#applyCustomBg').addEventListener('click', () => {
            const url = this.body.querySelector('#customBgInput').value.trim();
            if (url) { if (this.wallpaper.isPinned()) this.wallpaper.unpin(); this.wallpaper.setCustomBg(url); this.switchTab('bg'); }
        });
        this.body.querySelector('#refreshBg')?.addEventListener('click', () => { if (this.wallpaper.isPinned()) this.wallpaper.unpin(); this.wallpaper.refresh(); this.switchTab('bg'); });
        this.body.querySelector('#clearCustomBg')?.addEventListener('click', () => { this.wallpaper.clearCustomBg(); this.switchTab('bg'); });
        this.body.querySelector('#pinWallpaper')?.addEventListener('click', () => { this.wallpaper.pinCurrent(); this.switchTab('bg'); this.toast('壁纸已固定'); });
        this.body.querySelector('#unpinWallpaper')?.addEventListener('click', () => { this.wallpaper.unpin(); this.switchTab('bg'); this.toast('已取消固定'); });
    }

    // 添加自定义图库弹窗：支持 list（URL 列表，每行一个）和 api（JSON 接口）两种来源
    showAddGalleryModal() {
        this.showFormModal({
            title: '添加自定义图库',
            fields: [
                { name: 'name', label: '图库名称', placeholder: '如：风景壁纸' },
                { name: 'sourceType', label: '来源类型', type: 'text', placeholder: 'list（URL列表）或 api（JSON接口）', value: 'list' },
                { name: 'urls', label: '图片URL / API地址', type: 'textarea', rows: 6, placeholder: 'list模式：每行一个图片URL\napi模式：输入返回 {images:[{url:"..."}]} 的JSON接口地址' }
            ],
            onSubmit: async (values) => {
                if (!values.name || !values.urls) return;
                const galleries = JSON.parse(localStorage.getItem('moltap-custom-galleries') || '[]');
                const isApi = values.sourceType === 'api';
                if (isApi) {
                    galleries.push({ id: 'custom-' + Date.now(), name: values.name, apiUrl: values.urls, type: 'custom-api' });
                } else {
                    const urls = values.urls.split('\n').map(u => u.trim()).filter(u => u);
                    if (!urls.length) return;
                    galleries.push({ id: 'custom-' + Date.now(), name: values.name, urls, type: 'custom' });
                }
                localStorage.setItem('moltap-custom-galleries', JSON.stringify(galleries));
                this.wallpaper.customGalleries = galleries;
                await this.wallpaper.setGallery(galleries[galleries.length - 1].id);
                this.switchTab('bg');
            }
        });
    }

    // 渲染「天气」标签页：自动定位（GPS→IP 回退）或手动输入城市/经纬度
    renderWeather() {
        const mode = this.weather.mode;
        this.body.innerHTML = `
            <div class="section-title">天气定位</div>
            <div class="setting-row">
                <span class="setting-label">定位方式</span>
                <div class="theme-switch" id="weatherModeSwitch">
                    <button class="theme-switch-btn ${mode === 'auto' ? 'active' : ''}" data-mode="auto">自动</button>
                    <button class="theme-switch-btn ${mode === 'manual' ? 'active' : ''}" data-mode="manual">手动</button>
                </div>
            </div>
            ${mode === 'manual' ? `
            <div class="setting-row">
                <span class="setting-label">城市名称</span>
                <input class="input-sm" id="manualCityInput" style="width:140px" value="${this.weather.manualCity || ''}" placeholder="如：北京">
            </div>
            <div class="setting-row">
                <span class="setting-label">纬度</span>
                <input class="input-sm" id="manualLatInput" style="width:120px" type="number" step="0.01" value="${this.weather.manualLat || ''}" placeholder="39.90">
            </div>
            <div class="setting-row">
                <span class="setting-label">经度</span>
                <input class="input-sm" id="manualLonInput" style="width:120px" type="number" step="0.01" value="${this.weather.manualLon || ''}" placeholder="116.40">
            </div>
            <button class="btn-sm primary" id="saveManualWeather">保存</button>
            ` : `
            <div class="setting-row">
                <span class="setting-label">当前城市</span>
                <span style="color:var(--text-tertiary);font-size:13px">${localStorage.getItem('moltap-city') || '未定位'}</span>
            </div>
            <button class="btn-sm" id="refreshWeather">🔄 刷新定位</button>
            `}`;
        this.body.querySelector('#weatherModeSwitch').addEventListener('click', e => {
            const btn = e.target.closest('.theme-switch-btn');
            if (btn) { this.weather.mode = btn.dataset.mode; localStorage.setItem('moltap-weather-mode', btn.dataset.mode); this.switchTab('weather'); }
        });
        if (mode === 'manual') {
            this.body.querySelector('#saveManualWeather').addEventListener('click', () => {
                this.weather.manualCity = this.body.querySelector('#manualCityInput').value.trim();
                this.weather.manualLat = parseFloat(this.body.querySelector('#manualLatInput').value) || null;
                this.weather.manualLon = parseFloat(this.body.querySelector('#manualLonInput').value) || null;
                localStorage.setItem('moltap-manual-city', this.weather.manualCity);
                localStorage.setItem('moltap-manual-lat', this.weather.manualLat);
                localStorage.setItem('moltap-manual-lon', this.weather.manualLon);
                this.weather.fetch();
                this.toast('已保存');
            });
        } else {
            this.body.querySelector('#refreshWeather').addEventListener('click', () => {
                localStorage.removeItem('moltap-location-date');
                this.weather.fetch();
                this.toast('正在重新定位...');
            });
        }
    }

    // 渲染「书签」标签页：列出所有根级书签和文件夹
    // 文件夹支持展开查看内部书签、重命名、添加子书签、删除
    // 每个书签支持内联编辑名称/URL、修改图标、删除
    // _expandedFolders 记录当前展开的文件夹 ID 集合
    renderBookmarks() {
        const items = this.bookmarks.getAll();
        if (!this._expandedFolders) this._expandedFolders = new Set();
        let html = `
            <div class="section-title">书签管理</div>
            <div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto" id="bookmarkList">`;
        items.forEach(item => {
            if (item.isFolder) {
                const expanded = this._expandedFolders.has(item.id);
                html += `<div class="bookmark-edit-row" data-id="${item.id}" data-type="folder">
                    <button class="btn-sm folder-expand-btn" data-action="toggle-folder" data-id="${item.id}" style="font-size:11px;padding:2px 6px;min-width:24px">${expanded ? '▼' : '▶'}</button>
                    <div class="icon-preview">📁</div>
                    <span style="flex:1;font-size:13px;color:var(--modal-text)">${this.esc(item.name)} (${item.bookmarks?.length || 0}项)</span>
                    <button class="btn-sm" data-action="add-to-folder" data-id="${item.id}" style="font-size:11px;padding:4px 10px">＋</button>
                    <button class="btn-sm" data-action="rename" data-id="${item.id}" style="font-size:11px;padding:4px 10px">重命名</button>
                    <button class="btn-sm danger" data-action="delete-folder" data-id="${item.id}" style="font-size:11px;padding:4px 10px">✕</button>
                </div>`;
                if (expanded && item.bookmarks) {
                    item.bookmarks.forEach(sub => {
                        html += `<div class="bookmark-edit-row sub-bookmark-row" data-id="${sub.id}" data-parent="${item.id}">
                            <div style="width:24px"></div>
                            <div class="icon-preview" id="icon-${sub.id}"></div>
                            <input data-field="name" data-id="${sub.id}" value="${this.esc(sub.name)}" placeholder="名称" style="flex:1">
                            <input data-field="url" data-id="${sub.id}" value="${this.esc(sub.url)}" placeholder="URL" style="flex:2">
                            <button class="btn-sm" data-action="icon" data-id="${sub.id}" style="font-size:11px;padding:4px 10px">图标</button>
                            <button class="btn-sm danger" data-action="delete" data-id="${sub.id}" style="font-size:11px;padding:4px 10px">✕</button>
                        </div>`;
                    });
                }
            } else {
                html += `<div class="bookmark-edit-row" data-id="${item.id}" data-type="bookmark">
                    <div class="icon-preview" id="icon-${item.id}"></div>
                    <input data-field="name" data-id="${item.id}" value="${this.esc(item.name)}" placeholder="名称">
                    <input data-field="url" data-id="${item.id}" value="${this.esc(item.url)}" placeholder="URL" style="flex:2">
                    <button class="btn-sm" data-action="icon" data-id="${item.id}" style="font-size:11px;padding:4px 10px">图标</button>
                    <button class="btn-sm danger" data-action="delete" data-id="${item.id}" style="font-size:11px;padding:4px 10px">✕</button>
                </div>`;
            }
        });
        html += '</div>';
        this.body.innerHTML = html;
        const allBookmarks = [];
        items.forEach(item => {
            if (!item.isFolder) allBookmarks.push(item);
            if (item.isFolder && item.bookmarks) item.bookmarks.forEach(sub => allBookmarks.push(sub));
        });
        allBookmarks.forEach(item => {
            const preview = this.body.querySelector(`#icon-${item.id}`);
            if (preview) this.renderSmallIcon(preview, item);
        });
        this.body.querySelector('#bookmarkList').addEventListener('click', e => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action, id = btn.dataset.id;
            if (action === 'delete') { this.bookmarks.deleteBookmark(id); this.renderBookmarks(); }
            if (action === 'delete-folder') { this.bookmarks.deleteFolder(id); this._expandedFolders.delete(id); this.renderBookmarks(); }
            if (action === 'dissolve') { this.bookmarks.dissolveFolder(id); this._expandedFolders.delete(id); this.renderBookmarks(); }
            if (action === 'toggle-folder') {
                if (this._expandedFolders.has(id)) this._expandedFolders.delete(id);
                else this._expandedFolders.add(id);
                this.renderBookmarks();
            }
            if (action === 'add-to-folder') { this.bookmarks.showAddToFolderDialog(id); }
            if (action === 'rename') {
                const folder = this.bookmarks.items.find(f => f.id === id);
                this.showFormModal({
                    title: '重命名文件夹',
                    fields: [{ name: 'name', label: '名称', value: folder?.name || '', placeholder: '输入新名称' }],
                    onSubmit: (values) => {
                        if (values.name) { this.bookmarks.renameFolder(id, values.name); this.renderBookmarks(); if (this.grid) this.grid.refresh(); }
                    }
                });
            }
            if (action === 'icon') this.showIconPicker(id);
        });
        this.body.querySelector('#bookmarkList').addEventListener('input', e => {
            const input = e.target.closest('input[data-field]');
            if (!input) return;
            const item = this.bookmarks.findBookmark(input.dataset.id);
            if (item) { item[input.dataset.field] = input.value; this.bookmarks.save(); }
        });
    }

    // 渲染小图标预览（设置面板书签列表中 16×16 的缩略图标）
    // 4 种模式：emoji 直接显示、letter 取首字母、image 加载图片、auto 先字母后尝试 favicon
    renderSmallIcon(container, item) {
        if (item.iconType === 'emoji') { container.textContent = item.iconValue || '⭐'; return; }
        if (item.iconType === 'letter') { container.textContent = getLetterIcon(item.name); return; }
        if (item.iconType === 'image' && item.iconValue) { container.innerHTML = `<img src="${item.iconValue}" alt="">`; return; }
        container.textContent = getLetterIcon(item.name);
        fetchFavicon(item.url).then(url => { if (url) container.innerHTML = `<img src="${url}" alt="">`; });
    }

    // 图标编辑器：在设置面板 body 区域内显示完整编辑界面（替换书签列表）
    // 4 种类型切换，emoji 模式显示 40 个预设表情网格，image 模式显示 URL 输入框
    // 保存后调用 updateBookmark 更新数据并返回书签列表
    showIconPicker(bookmarkId) {
        const item = this.bookmarks.findBookmark(bookmarkId);
        if (!item) return;
        const pickerHtml = `
            <div style="display:flex;flex-direction:column;gap:12px">
                <div class="section-title">图标类型</div>
                <div class="theme-switch" id="iconTypeSwitch">
                    <button class="theme-switch-btn ${item.iconType === 'auto' ? 'active' : ''}" data-type="auto">自动</button>
                    <button class="theme-switch-btn ${item.iconType === 'emoji' ? 'active' : ''}" data-type="emoji">表情</button>
                    <button class="theme-switch-btn ${item.iconType === 'letter' ? 'active' : ''}" data-type="letter">字母</button>
                    <button class="theme-switch-btn ${item.iconType === 'image' ? 'active' : ''}" data-type="image">图片</button>
                </div>
                <div id="iconCustomArea"></div>
                <button class="btn-sm primary" id="saveIcon">保存</button>
                <button class="btn-sm" id="backToBookmarks">← 返回</button>
            </div>`;
        this.body.innerHTML = pickerHtml;
        let currentType = item.iconType;
        let currentValue = item.iconValue;
        const renderCustom = () => {
            const area = this.body.querySelector('#iconCustomArea');
            if (currentType === 'emoji') {
                area.innerHTML = `<div class="emoji-picker-grid">${EMOJIS.map(e => `<button class="emoji-picker-btn" data-emoji="${e}" style="${currentValue === e ? 'background:var(--input-bg)' : ''}">${e}</button>`).join('')}</div>`;
                area.querySelector('.emoji-picker-grid').addEventListener('click', e => {
                    const btn = e.target.closest('.emoji-picker-btn');
                    if (btn) { currentValue = btn.dataset.emoji; area.querySelectorAll('.emoji-picker-btn').forEach(b => b.style.background = ''); btn.style.background = 'var(--input-bg)'; }
                });
            } else if (currentType === 'image') {
                area.innerHTML = `<input class="input-sm" id="imageUrlInput" placeholder="输入图片URL..." value="${currentValue || ''}">`;
            } else {
                area.innerHTML = `<p style="font-size:12px;color:var(--text-tertiary)">将使用${currentType === 'auto' ? '网站图标（自动获取）' : '书签名首字母'}作为图标</p>`;
            }
        };
        renderCustom();
        this.body.querySelector('#iconTypeSwitch').addEventListener('click', e => {
            const btn = e.target.closest('.theme-switch-btn');
            if (btn) { currentType = btn.dataset.type; this.body.querySelectorAll('#iconTypeSwitch .theme-switch-btn').forEach(b => b.classList.toggle('active', b === btn)); renderCustom(); }
        });
        this.body.querySelector('#saveIcon').addEventListener('click', () => {
            if (currentType === 'image') currentValue = this.body.querySelector('#imageUrlInput')?.value.trim() || '';
            this.bookmarks.updateBookmark(bookmarkId, { iconType: currentType, iconValue: currentValue });
            this.renderBookmarks();
        });
        this.body.querySelector('#backToBookmarks').addEventListener('click', () => this.renderBookmarks());
    }

    // 渲染「一言」标签页：开关控制、来源切换（API/自定义）、自定义语录编辑、刷新按钮
    // 使用 MutationObserver 监听 toggle 开关的 class 变化来触发 hitokoto.toggle()
    renderHitokoto() {
        const enabled = this.hitokoto.enabled;
        const source = this.hitokoto.sourceType;
        this.body.innerHTML = `
            <div class="section-title">一言 · 语录</div>
            <div class="setting-row">
                <span class="setting-label">显示一言</span>
                <div class="toggle-switch ${enabled ? 'on' : ''}" id="hitokotoToggle"></div>
            </div>
            <div class="setting-row">
                <span class="setting-label">来源</span>
                <div class="theme-switch" id="hitokotoSourceSwitch">
                    <button class="theme-switch-btn ${source === 'api' ? 'active' : ''}" data-source="api">API</button>
                    <button class="theme-switch-btn ${source === 'custom' ? 'active' : ''}" data-source="custom">自定义</button>
                </div>
            </div>
            ${source === 'custom' ? `
            <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:8px">
                <textarea class="input-sm" id="hitokotoCustomInput" rows="3" placeholder="输入自定义语录..." style="resize:vertical;min-height:60px;border-radius:14px">${this.hitokoto.custom || ''}</textarea>
                <button class="btn-sm primary" id="saveHitokoto">保存</button>
            </div>` : ''}
            <button class="btn-sm" id="refreshHitokoto">🔄 刷新</button>`;
        this.body.querySelector('#hitokotoToggle').addEventListener('click', function() {
            this.classList.toggle('on');
        });
        this.body.querySelector('#hitokotoSourceSwitch').addEventListener('click', e => {
            const btn = e.target.closest('.theme-switch-btn');
            if (btn) { this.hitokoto.setSource(btn.dataset.source); this.switchTab('hitokoto'); }
        });
        this.body.querySelector('#saveHitokoto')?.addEventListener('click', () => {
            const text = this.body.querySelector('#hitokotoCustomInput').value.trim();
            this.hitokoto.setSource('custom', text);
            this.toast('已保存');
        });
        this.body.querySelector('#refreshHitokoto').addEventListener('click', () => { this.hitokoto.fetch(); this.toast('已刷新'); });
        const toggle = this.body.querySelector('#hitokotoToggle');
        const origToggle = toggle.classList.contains('on');
        const observer = new MutationObserver(() => {
            const isOn = toggle.classList.contains('on');
            if (isOn !== origToggle) { this.hitokoto.toggle(); observer.disconnect(); }
        });
        observer.observe(toggle, { attributes: true, attributeFilter: ['class'] });
    }

    // 渲染「专注」标签页：三个开关分别控制专注工具卡片、番茄钟、待办事项的显示
    renderFocus() {
        const focusEnabled = localStorage.getItem('moltap-focus-enabled') !== 'false';
        const pomoEnabled = localStorage.getItem('moltap-pomo-enabled') !== 'false';
        const todoEnabled = localStorage.getItem('moltap-todo-enabled') !== 'false';
        this.body.innerHTML = `
            <div class="section-title">专注工具</div>
            <div class="setting-row">
                <span class="setting-label">显示专注工具卡片</span>
                <div class="toggle-switch ${focusEnabled ? 'on' : ''}" id="focusToggle"></div>
            </div>
            <div class="setting-row">
                <span class="setting-label">番茄钟</span>
                <div class="toggle-switch ${pomoEnabled ? 'on' : ''}" id="pomoToggle"></div>
            </div>
            <div class="setting-row">
                <span class="setting-label">待办事项</span>
                <div class="toggle-switch ${todoEnabled ? 'on' : ''}" id="todoToggle"></div>
            </div>
            <div style="font-size:12px;color:var(--text-tertiary);line-height:1.6;padding:8px 0">
                番茄钟：点击时间可自定义专注/休息时长<br>
                待办事项：快速记录和管理任务<br>
                长按网格中的项目可进入编辑模式
            </div>`;
        this.body.querySelector('#focusToggle').addEventListener('click', () => {
            const toggle = this.body.querySelector('#focusToggle');
            toggle.classList.toggle('on');
            const isOn = toggle.classList.contains('on');
            localStorage.setItem('moltap-focus-enabled', isOn);
            if (this.grid) this.grid.refresh();
        });
        this.body.querySelector('#pomoToggle').addEventListener('click', () => {
            const toggle = this.body.querySelector('#pomoToggle');
            toggle.classList.toggle('on');
            localStorage.setItem('moltap-pomo-enabled', toggle.classList.contains('on'));
            if (this.grid) this.grid.refresh();
        });
        this.body.querySelector('#todoToggle').addEventListener('click', () => {
            const toggle = this.body.querySelector('#todoToggle');
            toggle.classList.toggle('on');
            localStorage.setItem('moltap-todo-enabled', toggle.classList.contains('on'));
            if (this.grid) this.grid.refresh();
        });
    }

    // 去除 WebDAV URL 末尾多余的斜杠
    _normalizeWebdavUrl(url) {
        url = url.trim();
        if (url.endsWith('/')) url = url.slice(0, -1);
        return url;
    }

    // 生成 WebDAV 请求头：有用户名时添加 Basic Auth 认证头
    _getWebdavHeaders(user, pass) {
        const headers = {};
        if (user) headers['Authorization'] = 'Basic ' + btoa(user + ':' + pass);
        return headers;
    }

    // 渲染「数据」标签页：导出/导入 JSON、清除数据、清除图标缓存、WebDAV 云同步配置与操作
    renderData() {
        this.body.innerHTML = `
            <div class="section-title">数据管理</div>
            <div class="setting-row">
                <button class="btn-sm primary" id="exportData">📤 导出所有数据</button>
            </div>
            <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:8px">
                <span class="setting-label">导入数据</span>
                <textarea class="input-sm" id="importArea" rows="4" placeholder="粘贴导出的JSON数据..." style="resize:vertical;min-height:80px;border-radius:14px"></textarea>
                <button class="btn-sm primary" id="importData">📥 导入</button>
            </div>
            <div class="setting-row">
                <button class="btn-sm danger" id="clearAllData">🗑️ 清除所有数据</button>
            </div>
            <div class="setting-row">
                <button class="btn-sm" id="clearFaviconCacheBtn">清除图标缓存</button>
            </div>
            <div class="section-title" style="margin-top:8px">WebDAV 云同步</div>
            <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:8px">
                <input class="input-sm" id="webdavUrl" placeholder="WebDAV 服务器地址" value="${localStorage.getItem('moltap-webdav-url') || ''}">
                <input class="input-sm" id="webdavUser" placeholder="用户名" value="${localStorage.getItem('moltap-webdav-user') || ''}">
                <input class="input-sm" id="webdavPass" type="password" placeholder="密码" value="${localStorage.getItem('moltap-webdav-pass') || ''}">
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn-sm primary" id="webdavSave">保存配置</button>
                    <button class="btn-sm" id="webdavTest">🔍 测试连接</button>
                    <button class="btn-sm" id="webdavUpload">↑ 上传到云端</button>
                    <button class="btn-sm" id="webdavDownload">↓ 从云端下载</button>
                </div>
                <div id="webdavStatus" style="font-size:11px;color:var(--text-tertiary)"></div>
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);line-height:1.6;padding:4px 0">
                支持的服务：坚果云 · 群晖 WebDAV · Nextcloud · ownCloud · Infuse · Plex 及其他标准 WebDAV 服务
            </div>
            <div class="section-title" style="margin-top:8px">扩展专属功能</div>
            <div style="font-size:12px;color:var(--text-tertiary);line-height:1.6;padding:8px 0">
                以下功能需要浏览器扩展支持，将在扩展版本中提供：<br>
                · 智能标签页管理（按域名自动分组）<br>
                · 浏览历史搜索建议<br>
                · 跨设备实时同步
            </div>`;
        this.body.querySelector('#exportData').addEventListener('click', () => {
            const data = {
                bookmarks: JSON.parse(this.bookmarks.exportData()),
                settings: {
                    theme: localStorage.getItem('moltap-theme'),
                    engine: localStorage.getItem('moltap-engine'),
                    gallery: localStorage.getItem('moltap-gallery'),
                    weather: localStorage.getItem('moltap-weather-mode'),
                    hitokoto: { enabled: localStorage.getItem('moltap-hitokoto-enabled'), source: localStorage.getItem('moltap-hitokoto-source'), custom: localStorage.getItem('moltap-hitokoto-custom') }
                }
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `moltap-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            this.toast('已导出');
        });
        this.body.querySelector('#importData').addEventListener('click', () => {
            const text = this.body.querySelector('#importArea').value.trim();
            if (!text) return;
            try {
                const data = JSON.parse(text);
                if (data.bookmarks) { this.bookmarks.importData(JSON.stringify(data.bookmarks)); }
                if (data.settings) {
                    Object.entries(data.settings).forEach(([k, v]) => {
                        if (typeof v === 'string') localStorage.setItem(`moltap-${k}`, v);
                        else if (typeof v === 'object' && v !== null) {
                            Object.entries(v).forEach(([k2, v2]) => { if (v2 !== null) localStorage.setItem(`moltap-${k2}`, v2); });
                        }
                    });
                }
                this.toast('导入成功，刷新页面生效');
                setTimeout(() => location.reload(), 1000);
            } catch { this.toast('导入失败：数据格式错误'); }
        });
        this.body.querySelector('#clearAllData').addEventListener('click', () => {
            if (confirm('确定要清除所有数据吗？此操作不可撤销。')) {
                const keys = Object.keys(localStorage).filter(k => k.startsWith('moltap-'));
                keys.forEach(k => localStorage.removeItem(k));
                this.toast('已清除，刷新页面生效');
                setTimeout(() => location.reload(), 1000);
            }
        });
        this.body.querySelector('#clearFaviconCacheBtn').addEventListener('click', () => {
            clearFaviconCache();
            this.toast('图标缓存已清除');
        });
        this.body.querySelector('#webdavSave').addEventListener('click', () => {
            const url = this._normalizeWebdavUrl(this.body.querySelector('#webdavUrl').value);
            localStorage.setItem('moltap-webdav-url', url);
            localStorage.setItem('moltap-webdav-user', this.body.querySelector('#webdavUser').value.trim());
            localStorage.setItem('moltap-webdav-pass', this.body.querySelector('#webdavPass').value);
            this.body.querySelector('#webdavUrl').value = url;
            this.toast('WebDAV 配置已保存');
        });
        this.body.querySelector('#webdavTest').addEventListener('click', async () => {
            const url = this._normalizeWebdavUrl(this.body.querySelector('#webdavUrl').value || localStorage.getItem('moltap-webdav-url') || '');
            const user = localStorage.getItem('moltap-webdav-user') || this.body.querySelector('#webdavUser').value.trim();
            const pass = localStorage.getItem('moltap-webdav-pass') || this.body.querySelector('#webdavPass').value;
            if (!url) { this.toast('请先填写服务器地址'); return; }
            const statusEl = this.body.querySelector('#webdavStatus');
            statusEl.textContent = '测试中...';
            statusEl.style.color = 'var(--text-tertiary)';
            try {
                const resp = await fetch(url + '/', {
                    method: 'PROPFIND',
                    headers: { ...(user ? { 'Authorization': 'Basic ' + btoa(user + ':' + pass) } : {}) }
                });
                if (resp.ok || resp.status === 207) {
                    statusEl.textContent = '连接成功 ✓';
                    statusEl.style.color = '#22c55e';
                } else if (resp.status === 401 || resp.status === 403) {
                    statusEl.textContent = '认证失败，请检查用户名密码';
                    statusEl.style.color = 'var(--danger)';
                } else {
                    statusEl.textContent = `服务器响应 ${resp.status}，但可能仍可使用`;
                    statusEl.style.color = 'var(--warning)';
                }
            } catch (e) {
                if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
                    statusEl.textContent = '连接失败：服务器不支持 CORS 跨域访问，浏览器页面无法直接连接。可通过浏览器扩展使用 WebDAV 同步';
                } else {
                    statusEl.textContent = '连接失败：' + e.message;
                }
                statusEl.style.color = 'var(--danger)';
            }
        });
        this.body.querySelector('#webdavUpload').addEventListener('click', async () => {
            const url = this._normalizeWebdavUrl(localStorage.getItem('moltap-webdav-url') || this.body.querySelector('#webdavUrl').value);
            const user = localStorage.getItem('moltap-webdav-user') || this.body.querySelector('#webdavUser').value.trim();
            const pass = localStorage.getItem('moltap-webdav-pass') || this.body.querySelector('#webdavPass').value;
            if (!url) { this.toast('请先填写服务器地址'); return; }
            const statusEl = this.body.querySelector('#webdavStatus');
            statusEl.textContent = '上传中...';
            statusEl.style.color = 'var(--text-tertiary)';
            try {
                const data = {
                    bookmarks: JSON.parse(this.bookmarks.exportData()),
                    settings: Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('moltap-')).map(([k, v]) => [k, v]))
                };
                await fetch(url + '/moltap-backup.json', {
                    method: 'PUT',
                    headers: this._getWebdavHeaders(user, pass),
                    body: JSON.stringify(data)
                });
                statusEl.textContent = '上传成功 · ' + new Date().toLocaleTimeString();
                statusEl.style.color = '#22c55e';
                this.toast('已上传到云端');
            } catch (e) {
                if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
                    statusEl.textContent = '上传失败：服务器不支持 CORS 跨域访问';
                } else {
                    statusEl.textContent = '上传失败：' + e.message;
                }
                statusEl.style.color = 'var(--danger)';
                this.toast('上传失败');
            }
        });
        this.body.querySelector('#webdavDownload').addEventListener('click', async () => {
            const url = this._normalizeWebdavUrl(localStorage.getItem('moltap-webdav-url') || this.body.querySelector('#webdavUrl').value);
            const user = localStorage.getItem('moltap-webdav-user') || this.body.querySelector('#webdavUser').value.trim();
            const pass = localStorage.getItem('moltap-webdav-pass') || this.body.querySelector('#webdavPass').value;
            if (!url) { this.toast('请先填写服务器地址'); return; }
            const statusEl = this.body.querySelector('#webdavStatus');
            statusEl.textContent = '下载中...';
            statusEl.style.color = 'var(--text-tertiary)';
            try {
                const resp = await fetch(url + '/moltap-backup.json', {
                    headers: { ...(user ? { 'Authorization': 'Basic ' + btoa(user + ':' + pass) } : {}) }
                });
                const data = await resp.json();
                if (data.settings) {
                    Object.entries(data.settings).forEach(([k, v]) => localStorage.setItem(k, v));
                }
                if (data.bookmarks) {
                    this.bookmarks.importData(JSON.stringify(data.bookmarks));
                }
                statusEl.textContent = '下载成功 · 刷新页面生效';
                statusEl.style.color = '#22c55e';
                this.toast('已从云端下载，刷新生效');
            } catch (e) {
                if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
                    statusEl.textContent = '下载失败：服务器不支持 CORS 跨域访问';
                } else {
                    statusEl.textContent = '下载失败：' + e.message;
                }
                statusEl.style.color = 'var(--danger)';
                this.toast('下载失败');
            }
        });
    }

    // 渲染「关于」标签页：版本信息、隐私标签、更新日志（v1.0.0 ~ v2.0.0）、法律链接
    renderAbout() {
        this.body.innerHTML = `
            <div style="text-align:center;padding:12px 0">
                <div class="about-logo">MolTab</div>
                <div class="about-version">v2.0.0 · 极简新标签页</div>
                <div style="display:flex;gap:8px;justify-content:center;margin:8px 0 12px;flex-wrap:wrap">
                    <span style="font-size:11px;padding:3px 10px;border-radius:10px;background:rgba(59,125,216,0.1);color:var(--accent);font-weight:500">0 追踪</span>
                    <span style="font-size:11px;padding:3px 10px;border-radius:10px;background:rgba(59,125,216,0.1);color:var(--accent);font-weight:500">0 广告</span>
                    <span style="font-size:11px;padding:3px 10px;border-radius:10px;background:rgba(59,125,216,0.1);color:var(--accent);font-weight:500">数据仅存本地</span>
                </div>
                <p class="about-desc">一款注重隐私的新标签页扩展，所有数据仅保存在本地。</p>
                <div class="about-action-row" style="justify-content:center">
                    <a class="btn-sm" href="https://github.com/AUkarl/moltab" target="_blank">GitHub</a>
                </div>
            </div>
            <div class="section-title">更新日志</div>
            <div style="display:flex;flex-direction:column;gap:10px;font-size:12px;color:var(--modal-text)">
                <div style="padding:10px 14px;background:var(--input-bg);border-radius:12px">
                    <div style="font-weight:600;margin-bottom:4px">v2.0.0 <span style="color:var(--text-tertiary);font-weight:400">· 2026-09-06</span></div>
                    <div style="color:var(--text-secondary);line-height:1.6">
                        · 文件夹预览网格增加边框与圆角<br>
                        · 展开弹窗改为 flex-wrap 自适应布局<br>
                        · 编辑模式下支持拖拽书签到文件夹内<br>
                        · 编辑模式下右键菜单（书签/文件夹/小工具）<br>
                        · 设置中支持文件夹内书签完整编辑<br>
                        · 小工具放大/缩小时内部文字按钮同步缩放<br>
                        · 放大文件夹时自动排列其他元素，空间不足提示<br>
                        · 背景支持固定单张图片，加载速度优化<br>
                        · 正式开源，MIT 许可证
                    </div>
                </div>
                <div style="padding:10px 14px;background:var(--input-bg);border-radius:12px">
                    <div style="font-weight:600;margin-bottom:4px">v1.2.0 <span style="color:var(--text-tertiary);font-weight:400">· 内部测试</span></div>
                    <div style="color:var(--text-secondary);line-height:1.6">
                        · 多文件模块化架构重构<br>
                        · 12×3 CSS Grid 网格布局<br>
                        · 长按拖拽自由放置，编辑模式抖动效果<br>
                        · 书签文件夹系统（1×1/2×2/3×3）<br>
                        · 番茄钟、待办事项小工具<br>
                        · WebDAV 云同步（兼容坚果云等）<br>
                        · 种子随机壁纸算法，文字智能反色
                    </div>
                </div>
                <div style="padding:10px 14px;background:var(--input-bg);border-radius:12px">
                    <div style="font-weight:600;margin-bottom:4px">v1.1.0 <span style="color:var(--text-tertiary);font-weight:400">· 内部测试</span></div>
                    <div style="color:var(--text-secondary);line-height:1.6">
                        · 优化高清背景壁纸加载<br>
                        · 修复天气定位城市失败问题<br>
                        · 修复书签图标自动获取失败<br>
                        · 新增时段问候语<br>
                        · 新增书签文件夹功能<br>
                        · 新增番茄钟功能<br>
                        · 新增待办事项列表<br>
                        · 新增 WebDAV 云同步
                    </div>
                </div>
                <div style="padding:10px 14px;background:var(--input-bg);border-radius:12px">
                    <div style="font-weight:600;margin-bottom:4px">v1.0.1 <span style="color:var(--text-tertiary);font-weight:400">· 2025-08-21</span></div>
                    <div style="color:var(--text-secondary);line-height:1.6">
                        · 修复若干问题
                    </div>
                </div>
                <div style="padding:10px 14px;background:var(--input-bg);border-radius:12px">
                    <div style="font-weight:600;margin-bottom:4px">v1.0.0 <span style="color:var(--text-tertiary);font-weight:400">· 2025-07-24</span></div>
                    <div style="color:var(--text-secondary);line-height:1.6">
                        · 首次正式发布<br>
                        · 多引擎搜索、天气、每日壁纸、书签、一言<br>
                        · 深色模式、备份恢复<br>
                        · 纯原生 JS，无框架依赖<br>
                        · 0 追踪 0 广告，数据仅存本地
                    </div>
                </div>
            </div>
            <div class="section-title" style="margin-top:8px">法律信息</div>
            <div class="legal-links" style="justify-content:flex-start;gap:16px;font-size:12px">
                <span onclick="window.open('privacy/tab.html#disclaimer','_blank')">免责声明</span>
                <span onclick="window.open('privacy/tab.html#privacy','_blank')">隐私政策</span>
                <span onclick="window.open('privacy/tab.html#copyright','_blank')">版权声明</span>
            </div>
            <p style="font-size:11px;color:var(--text-tertiary);margin-top:12px">© 2025 MolTab by Hardy. 保留所有权利。</p>`;
    }

    // 显示轻量 Toast 提示：2.2 秒后自动消失，同时只存在一个
    toast(msg) {
        const old = document.querySelector('.toast');
        if (old) old.remove();
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2200);
    }

    // HTML 转义：利用 DOM textContent→innerHTML 防止 XSS 注入
    esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
}
