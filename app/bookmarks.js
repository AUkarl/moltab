/**
 * 书签管理模块
 * - 支持书签和文件夹的增删改查
 * - 12 个默认书签（开发工具 + 国内常用网站）
 * - 文件夹系统：创建/解散/重命名/添加书签
 * - 四种图标模式：auto(网站图标) / emoji / letter(首字母) / image(URL)
 * - 数据持久化到 localStorage（key: moltap-bookmarks）
 * - 与 GridManager 联动：数据变更后自动刷新网格
 */
import { fetchFavicon, getDomain, getLetterIcon } from './favicon.js';

// 生成唯一ID：时间戳base36 + 随机4字符
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// 默认书签列表：首次使用时初始化，包含两行各6个书签
const DEFAULTS = [
    { id: uid(), name: 'GitHub', url: 'https://github.com', iconType: 'auto', iconValue: '', gridCol: 6, gridRow: 1, spanX: 1, spanY: 1 },
    { id: uid(), name: 'Vercel', url: 'https://vercel.com', iconType: 'auto', iconValue: '', gridCol: 7, gridRow: 1, spanX: 1, spanY: 1 },
    { id: uid(), name: 'Netlify', url: 'https://www.netlify.com', iconType: 'auto', iconValue: '', gridCol: 8, gridRow: 1, spanX: 1, spanY: 1 },
    { id: uid(), name: 'Cloudflare', url: 'https://www.cloudflare.com', iconType: 'auto', iconValue: '', gridCol: 9, gridRow: 1, spanX: 1, spanY: 1 },
    { id: uid(), name: 'QQ邮箱', url: 'https://mail.qq.com', iconType: 'auto', iconValue: '', gridCol: 10, gridRow: 1, spanX: 1, spanY: 1 },
    { id: uid(), name: '关于作者', url: 'https://molyun.com', iconType: 'auto', iconValue: '', gridCol: 11, gridRow: 1, spanX: 1, spanY: 1 },
    { id: uid(), name: 'DeepSeek', url: 'https://www.deepseek.com', iconType: 'auto', iconValue: '', gridCol: 6, gridRow: 2, spanX: 1, spanY: 1 },
    { id: uid(), name: '豆包', url: 'https://www.doubao.com', iconType: 'auto', iconValue: '', gridCol: 7, gridRow: 2, spanX: 1, spanY: 1 },
    { id: uid(), name: '抖音', url: 'https://www.douyin.com', iconType: 'auto', iconValue: '', gridCol: 8, gridRow: 2, spanX: 1, spanY: 1 },
    { id: uid(), name: 'B站', url: 'https://www.bilibili.com', iconType: 'auto', iconValue: '', gridCol: 9, gridRow: 2, spanX: 1, spanY: 1 },
    { id: uid(), name: '知乎', url: 'https://www.zhihu.com', iconType: 'auto', iconValue: '', gridCol: 10, gridRow: 2, spanX: 1, spanY: 1 },
    { id: uid(), name: '微博', url: 'https://weibo.com', iconType: 'auto', iconValue: '', gridCol: 11, gridRow: 2, spanX: 1, spanY: 1 }
];

/**
 * 书签管理器
 * @property {Array} items - 书签和文件夹的混合数组
 * @property {boolean} editMode - 编辑模式标志
 * @property {string|null} expandedFolder - 当前展开的文件夹ID
 * @property {GridManager|null} gridManager - 关联的网格管理器
 */
export class BookmarkManager {
    constructor(container) {
        this.container = container;
        this.items = [];
        this.editMode = false;
        this.expandedFolder = null;
        this.dragSrcId = null;
        this.gridManager = null;
        // 从 localStorage 加载，失败则使用默认列表
        try {
            const s = localStorage.getItem('moltap-bookmarks');
            this.items = s ? JSON.parse(s) : [...DEFAULTS];
        } catch { this.items = [...DEFAULTS]; }
    }

    // 设置关联的 GridManager，用于数据变更后刷新网格
    setGridManager(gm) { this.gridManager = gm; }

    // 持久化到 localStorage
    save() { try { localStorage.setItem('moltap-bookmarks', JSON.stringify(this.items)); } catch {} }

    // 获取所有项目（书签+文件夹）
    getAll() { return this.items; }

    // 添加书签到根级别
    addBookmark(name, url, iconType = 'auto', iconValue = '') {
        this.items.push({ id: uid(), name, url, iconType, iconValue });
        this.save();
        if (this.gridManager) this.gridManager.refresh();
    }

    // 删除书签（同时从所有文件夹中移除）
    deleteBookmark(id) {
        this.items = this.items.filter(b => b.id !== id);
        this.items.forEach(f => { if (f.isFolder && f.bookmarks) f.bookmarks = f.bookmarks.filter(b => b.id !== id); });
        this.save();
        if (this.gridManager) this.gridManager.refresh();
    }

    // 更新书签属性
    updateBookmark(id, data) {
        const item = this.findBookmark(id);
        if (item) { Object.assign(item, data); this.save(); if (this.gridManager) this.gridManager.refresh(); }
    }

    // 查找书签（支持根级别和文件夹内）
    findBookmark(id) {
        for (const item of this.items) {
            if (item.id === id) return item;
            if (item.isFolder && item.bookmarks) {
                const found = item.bookmarks.find(b => b.id === id);
                if (found) return found;
            }
        }
        return null;
    }

    // 创建文件夹：将指定书签从根级别移入新文件夹
    createFolder(name, bookmarkIds) {
        const bookmarks = [];
        bookmarkIds.forEach(id => {
            const idx = this.items.findIndex(b => b.id === id);
            if (idx !== -1) { bookmarks.push(this.items[idx]); this.items.splice(idx, 1); }
        });
        this.items.push({ id: uid(), name: name || '文件夹', isFolder: true, bookmarks });
        this.save();
        if (this.gridManager) this.gridManager.refresh();
    }

    // 解散文件夹：将文件夹内书签释放到根级别（原位插入）
    dissolveFolder(folderId) {
        const idx = this.items.findIndex(f => f.id === folderId);
        if (idx === -1 || !this.items[idx].isFolder) return;
        const folder = this.items[idx];
        this.items.splice(idx, 1);
        this.items.splice(idx, 0, ...folder.bookmarks);
        this.expandedFolder = null;
        this.save();
        if (this.gridManager) this.gridManager.refresh();
    }

    // 切换文件夹展开状态（同一时间只展开一个）
    toggleFolder(folderId) {
        this.expandedFolder = this.expandedFolder === folderId ? null : folderId;
        if (this.gridManager) this.gridManager.refresh();
    }

    // 移动书签：从当前位置移除，插入到 beforeId 之前（或末尾）
    moveBookmark(id, beforeId) {
        // 先定位书签来源（根级别 or 某个文件夹内）
        let item = null, src = null;
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].id === id) { item = this.items[i]; src = 'root'; break; }
            if (this.items[i].isFolder && this.items[i].bookmarks) {
                const bi = this.items[i].bookmarks.findIndex(b => b.id === id);
                if (bi !== -1) { item = this.items[i].bookmarks[bi]; src = this.items[i].id; break; }
            }
        }
        if (!item) return;
        // 从来源移除
        if (src !== 'root') {
            const folder = this.items.find(f => f.id === src);
            folder.bookmarks = folder.bookmarks.filter(b => b.id !== id);
        } else {
            this.items = this.items.filter(b => b.id !== id);
        }
        // 插入到目标位置
        if (beforeId) {
            const bi = this.items.findIndex(b => b.id === beforeId);
            if (bi !== -1) this.items.splice(bi, 0, item);
            else this.items.push(item);
        } else {
            this.items.push(item);
        }
        this.save();
        if (this.gridManager) this.gridManager.refresh();
    }

    // 重命名文件夹
    renameFolder(folderId, newName) {
        const folder = this.items.find(f => f.id === folderId);
        if (folder && folder.isFolder) { folder.name = newName; this.save(); if (this.gridManager) this.gridManager.refresh(); }
    }

    // 删除文件夹（连同内部书签一起删除）
    deleteFolder(folderId) {
        this.items = this.items.filter(f => f.id !== folderId);
        this.expandedFolder = null;
        this.save();
        if (this.gridManager) this.gridManager.refresh();
    }

    // 将根级别书签移入指定文件夹
    addBookmarkToFolder(folderId, bookmarkId) {
        const folder = this.items.find(f => f.id === folderId && f.isFolder);
        if (!folder) return;
        const idx = this.items.findIndex(b => b.id === bookmarkId);
        if (idx === -1) return;
        const bm = this.items.splice(idx, 1)[0]; // 从根级别移除
        if (!folder.bookmarks) folder.bookmarks = [];
        folder.bookmarks.push(bm); // 添加到文件夹
        this.save();
        if (this.gridManager) this.gridManager.refresh();
    }

    // 弹出"添加书签到文件夹"对话框
    showAddToFolderDialog(folderId) {
        const overlay = document.createElement('div');
        overlay.className = 'form-modal-overlay';
        overlay.innerHTML = `
            <div class="form-modal-card">
                <h3>添加书签到文件夹</h3>
                <div class="form-field">
                    <label>名称</label>
                    <input id="addFmBmName" type="text" placeholder="书签名称">
                </div>
                <div class="form-field">
                    <label>网址</label>
                    <input id="addFmBmUrl" type="text" placeholder="https://...">
                </div>
                <div class="form-actions">
                    <button class="btn-sm" id="addFmBmCancel">取消</button>
                    <button class="btn-sm primary" id="addFmBmSave">添加</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const nameInput = overlay.querySelector('#addFmBmName');
        nameInput.focus();
        overlay.querySelector('#addFmBmCancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#addFmBmSave').addEventListener('click', () => {
            const name = nameInput.value.trim();
            const url = overlay.querySelector('#addFmBmUrl').value.trim();
            if (!name || !url) return;
            // 先添加到根级别，再移入目标文件夹
            this.addBookmark(name, url.startsWith('http') ? url : 'https://' + url);
            const newBm = this.items[this.items.length - 1];
            this.addBookmarkToFolder(folderId, newBm.id);
            overlay.remove();
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#addFmBmUrl').addEventListener('keydown', e => {
            if (e.key === 'Enter') overlay.querySelector('#addFmBmSave').click();
        });
    }

    // 渲染书签列表（无 GridManager 时的降级方案）
    render() {
        if (this.gridManager) { this.gridManager.refresh(); return; }
        this.container.innerHTML = '';
        // 过滤掉空文件夹
        const visible = this.items.filter(item => !(item.isFolder && (!item.bookmarks || item.bookmarks.length === 0)));
        visible.forEach(item => {
            if (item.isFolder) this.container.appendChild(this._renderFolderLegacy(item));
            else this.container.appendChild(this._renderBookmarkLegacy(item));
        });
        const addBtn = document.createElement('button');
        addBtn.className = 'add-bookmark-btn';
        addBtn.innerHTML = '<div class="add-icon">+</div><span class="add-text">添加</span>';
        addBtn.addEventListener('click', () => this.showAddDialog());
        this.container.appendChild(addBtn);
    }

    // 渲染单个书签元素（旧版布局）
    _renderBookmarkLegacy(item) {
        const el = document.createElement('div');
        el.className = 'bookmark-item' + (this.editMode ? ' editing' : '');
        el.dataset.id = item.id;
        const iconWrap = document.createElement('div');
        iconWrap.className = 'bm-icon-wrap';
        this.renderIcon(iconWrap, item);
        const name = document.createElement('div');
        name.className = 'bm-name';
        name.textContent = item.name;
        el.appendChild(iconWrap);
        el.appendChild(name);
        el.addEventListener('click', () => window.open(item.url, '_blank'));
        return el;
    }

    // 渲染文件夹元素（旧版布局）
    _renderFolderLegacy(item) {
        const el = document.createElement('div');
        el.className = 'bookmark-item folder' + (this.editMode ? ' editing' : '');
        el.dataset.id = item.id;
        const iconWrap = document.createElement('div');
        iconWrap.className = 'bm-icon-wrap';
        iconWrap.innerHTML = '<span class="folder-icon">📁</span>';
        const name = document.createElement('div');
        name.className = 'bm-name';
        name.textContent = item.name;
        el.appendChild(iconWrap);
        el.appendChild(name);
        el.addEventListener('click', () => this.toggleFolder(item.id));
        return el;
    }

    // 渲染图标：根据 iconType 选择 emoji/字母/图片/自动获取网站图标
    async renderIcon(container, item) {
        if (item.iconType === 'emoji') {
            container.innerHTML = `<span class="emoji-icon">${item.iconValue || '⭐'}</span>`;
        } else if (item.iconType === 'letter') {
            container.innerHTML = `<span class="letter-icon">${getLetterIcon(item.name)}</span>`;
        } else if (item.iconType === 'image' && item.iconValue) {
            container.innerHTML = `<img src="${item.iconValue}" alt="">`;
        } else {
            // auto 模式：先显示字母占位，再尝试加载网站图标
            container.innerHTML = `<span class="letter-icon">${getLetterIcon(item.name)}</span>`;
            const iconUrl = await fetchFavicon(item.url);
            if (iconUrl) {
                const img = new Image();
                img.onload = () => { container.innerHTML = ''; container.appendChild(img); };
                img.src = iconUrl;
            }
        }
    }

    // 刷新图标显示
    refreshIcons() { if (this.gridManager) this.gridManager.refresh(); else this.render(); }

    // 弹出"添加书签"对话框（添加到根级别）
    showAddDialog() {
        const overlay = document.createElement('div');
        overlay.className = 'form-modal-overlay';
        overlay.innerHTML = `
            <div class="form-modal-card">
                <h3>添加书签</h3>
                <div class="form-field">
                    <label>名称</label>
                    <input id="addBmName" type="text" placeholder="书签名称">
                </div>
                <div class="form-field">
                    <label>网址</label>
                    <input id="addBmUrl" type="text" placeholder="https://...">
                </div>
                <div class="form-actions">
                    <button class="btn-sm" id="addBmCancel">取消</button>
                    <button class="btn-sm primary" id="addBmSave">添加</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const nameInput = overlay.querySelector('#addBmName');
        nameInput.focus(); // 自动聚焦名称输入框
        overlay.querySelector('#addBmCancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#addBmSave').addEventListener('click', () => {
            const name = nameInput.value.trim();
            const url = overlay.querySelector('#addBmUrl').value.trim();
            if (!name || !url) return;
            // 自动补全 https:// 前缀
            this.addBookmark(name, url.startsWith('http') ? url : 'https://' + url);
            overlay.remove();
        });
        // 点击遮罩关闭
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        // URL 输入框回车触发保存
        overlay.querySelector('#addBmUrl').addEventListener('keydown', e => {
            if (e.key === 'Enter') overlay.querySelector('#addBmSave').click();
        });
    }

    // 导出书签数据为 JSON 字符串（用于设置 > 数据 > 导出）
    exportData() { return JSON.stringify(this.items, null, 2); }

    // 从 JSON 字符串导入书签数据，成功返回 true
    importData(json) {
        try { this.items = JSON.parse(json); this.save(); if (this.gridManager) this.gridManager.refresh(); else this.render(); return true; }
        catch { return false; }
    }
}
