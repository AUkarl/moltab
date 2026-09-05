/**
 * 网格布局管理模块 - 12×3 CSS Grid 布局引擎
 * 负责书签、番茄钟、待办事项在网格中的排列、拖拽、碰撞检测、FLIP动画
 * 支持文件夹 1×1/2×2/3×3 多尺寸显示，右键菜单编辑，长按进入编辑模式
 */

const COLS = 12; // 网格列数
const ROWS = 3;  // 网格行数

/**
 * 网格布局管理器
 * 管理所有网格项（书签/文件夹/番茄钟/待办）的位置、渲染、交互
 * 使用 FLIP 动画实现平滑的位置过渡效果
 */
export class GridManager {
    constructor(container, { bookmarks, focus }) {
        this.container = container;   // 网格容器 DOM 元素
        this.bookmarks = bookmarks;   // BookmarkManager 实例
        this.focus = focus;           // FocusManager 实例（番茄钟+待办）
        this.editMode = false;        // 是否处于编辑模式（可拖拽/删除/右键菜单）
        this.dragSrcId = null;        // 当前正在拖拽的项 ID
        this._pressTimer = null;      // 长按计时器（800ms 进入编辑模式）
        this._blankHandler = null;    // 空白区域点击事件处理器引用
    }

    // 初始化：首次渲染 + 绑定空白区域点击退出编辑 + 绑定拖拽放置
    init() {
        this.render();
        this._bindBlankClick();
        this._bindContainerDrop();
    }

    // 绑定容器拖拽事件：dragover 显示指示器，drop 处理 4 种重叠情况
    _bindContainerDrop() {
        // dragover：显示放置指示器
        this.container.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!this.dragSrcId) return;
            const pos = this._getGridPosition(e);
            if (pos) this._showDropIndicator(pos.col, pos.row);
        });
        // dragleave：清除指示器
        this.container.addEventListener('dragleave', e => {
            if (e.target === this.container || !this.container.contains(e.relatedTarget)) {
                this._clearDropIndicator();
            }
        });
        // drop：处理放置逻辑
        this.container.addEventListener('drop', e => {
            e.preventDefault();
            this._clearDropIndicator();
            if (!this.dragSrcId) return;
            const pos = this._getGridPosition(e);
            if (!pos) return;
            const items = this.getAllItems();
            const srcItem = items.find(i => i.id === this.dragSrcId);
            if (!srcItem) return;
            // 限制目标位置不超出网格边界
            const col = Math.max(1, Math.min(pos.col, COLS - srcItem.spanX + 1));
            const row = Math.max(1, Math.min(pos.row, ROWS - srcItem.spanY + 1));
            if (col === srcItem.gridCol && row === srcItem.gridRow) return;
            // 检测目标位置是否有重叠项
            const overlap = items.find(i => i.id !== this.dragSrcId &&
                col < i.gridCol + i.spanX && col + srcItem.spanX > i.gridCol &&
                row < i.gridRow + i.spanY && row + srcItem.spanY > i.gridRow);
            if (overlap && srcItem.source === 'bookmark' && overlap.source === 'bookmark' && !overlap.data?.isFolder && !srcItem.data?.isFolder) {
                // 情况1：两个普通书签重叠 → 合并创建文件夹
                const folderName = srcItem.data.name;
                this.bookmarks.createFolder(folderName, [srcItem.id, overlap.id]);
                const folder = this.bookmarks.items.find(i => i.isFolder && i.id !== overlap.id && i.bookmarks?.some(b => b.id === srcItem.id));
                if (folder) {
                    folder.gridCol = overlap.gridCol;
                    folder.gridRow = overlap.gridRow;
                    folder.spanX = 2;
                    folder.spanY = 2;
                    this.bookmarks.save();
                }
            } else if (overlap && overlap.source === 'bookmark' && overlap.data?.isFolder && srcItem.source === 'bookmark' && !srcItem.data?.isFolder) {
                // 情况2：书签拖到文件夹上 → 将书签移入文件夹
                this.bookmarks.addBookmarkToFolder(overlap.id, srcItem.id);
            } else if (overlap) {
                // 情况3：与其他项重叠（番茄钟/待办等）→ 寻找最近空位放置
                const slot = this._findEmptySlotForItem(srcItem, items);
                if (slot) {
                    srcItem.gridCol = slot.col;
                    srcItem.gridRow = slot.row;
                    this._persistPosition(srcItem);
                }
            } else {
                // 情况4：无重叠 → 直接移动到目标位置
                srcItem.gridCol = col;
                srcItem.gridRow = row;
                this._persistPosition(srcItem);
            }
            this.render('reposition');
        });
    }

    // 将鼠标像素坐标转换为网格行列号（1-based）
    _getGridPosition(e) {
        const rect = this.container.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return null;
        const style = getComputedStyle(this.container);
        const gap = parseFloat(style.gap) || 6;
        // 读取 CSS Grid 计算出的各列/行实际像素宽度
        const colTracks = style.gridTemplateColumns.split(' ').map(parseFloat);
        const rowTracks = style.gridTemplateRows.split(' ').map(parseFloat);
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        let col = COLS, row = ROWS;
        let cx = 0;
        for (let i = 0; i < COLS; i++) {
            cx += colTracks[i] + (i < COLS - 1 ? gap : 0);
            if (x < cx) { col = i + 1; break; }
        }
        let cy = 0;
        for (let i = 0; i < ROWS; i++) {
            cy += rowTracks[i] + (i < ROWS - 1 ? gap : 0);
            if (y < cy) { row = i + 1; break; }
        }
        return { col: Math.max(1, Math.min(col, COLS)), row: Math.max(1, Math.min(row, ROWS)) };
    }

    // 在目标网格位置显示半透明放置指示器（根据 spanX/spanY 计算像素尺寸）
    _showDropIndicator(col, row) {
        this._clearDropIndicator();
        if (!this.dragSrcId) return;
        const items = this.getAllItems();
        const srcItem = items.find(i => i.id === this.dragSrcId);
        if (!srcItem) return;
        const spanX = srcItem.spanX;
        const spanY = srcItem.spanY;
        const cCol = Math.max(1, Math.min(col, COLS - spanX + 1));
        const cRow = Math.max(1, Math.min(row, ROWS - spanY + 1));
        const style = getComputedStyle(this.container);
        const gap = parseFloat(style.gap) || 6;
        const colTracks = style.gridTemplateColumns.split(' ').map(parseFloat);
        const rowTracks = style.gridTemplateRows.split(' ').map(parseFloat);
        // 累加列宽+间距计算指示器 left/top
        let left = 0;
        for (let i = 0; i < cCol - 1; i++) left += colTracks[i] + gap;
        let top = 0;
        for (let i = 0; i < cRow - 1; i++) top += rowTracks[i] + gap;
        // 累加 span 范围内的列宽+间距计算指示器 width/height
        let width = 0;
        for (let i = cCol - 1; i < cCol - 1 + spanX && i < COLS; i++) width += colTracks[i];
        width += (spanX - 1) * gap;
        let height = 0;
        for (let i = cRow - 1; i < cRow - 1 + spanY && i < ROWS; i++) height += rowTracks[i];
        height += (spanY - 1) * gap;
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        indicator.id = 'dropIndicator';
        indicator.style.left = left + 'px';
        indicator.style.top = top + 'px';
        indicator.style.width = width + 'px';
        indicator.style.height = height + 'px';
        this.container.appendChild(indicator);
    }

    // 清除放置指示器和拖拽高亮
    _clearDropIndicator() {
        const existing = document.getElementById('dropIndicator');
        if (existing) existing.remove();
        this.container.querySelectorAll('.drag-over').forEach(e => e.classList.remove('drag-over'));
    }

    // 绑定空白区域点击退出编辑模式，点击容器外部也退出
    _bindBlankClick() {
        this.container.addEventListener('pointerdown', e => {
            if (e.target === this.container && this.editMode) {
                setTimeout(() => this.exitEditMode(), 50);
            }
        });
        document.addEventListener('pointerdown', e => {
            if (!this.editMode) return;
            if (this.container.contains(e.target)) return;
            // 排除弹出菜单、表单、文件夹展开等浮层
            if (e.target.closest('.folder-context-menu')) return;
            if (e.target.closest('.form-modal-overlay')) return;
            if (e.target.closest('.folder-expansion-overlay')) return;
            if (e.target.closest('.modal-overlay')) return;
            setTimeout(() => this.exitEditMode(), 50);
        });
    }

    // 收集所有网格项：书签 + 番茄钟 + 待办（根据启用状态），返回统一的 item 格式
    getAllItems() {
        const items = [];
        const bmItems = this.bookmarks.getAll();
        bmItems.forEach(b => {
            items.push({
                id: b.id,
                source: 'bookmark',
                data: b,
                spanX: b.spanX || 1,
                spanY: b.spanY || 1,
                gridCol: b.gridCol,
                gridRow: b.gridRow
            });
        });
        // 专注模式下添加番茄钟和待办组件
        const focusEnabled = localStorage.getItem('moltap-focus-enabled') !== 'false';
        if (focusEnabled) {
            let focusLayout = {};
            try { focusLayout = JSON.parse(localStorage.getItem('moltap-focus-layout') || '{}'); } catch {}
            const pomoEnabled = localStorage.getItem('moltap-pomo-enabled') !== 'false';
            const todoEnabled = localStorage.getItem('moltap-todo-enabled') !== 'false';
            if (pomoEnabled) {
                items.push({
                    id: '__pomo__',
                    source: 'pomo',
                    data: null,
                    spanX: focusLayout.pomo?.spanX || 2,
                    spanY: focusLayout.pomo?.spanY || 2,
                    gridCol: focusLayout.pomo?.col || 2,
                    gridRow: focusLayout.pomo?.row || 1
                });
            }
            if (todoEnabled) {
                items.push({
                    id: '__todo__',
                    source: 'todo',
                    data: null,
                    spanX: focusLayout.todo?.spanX || 2,
                    spanY: focusLayout.todo?.spanY || 2,
                    gridCol: focusLayout.todo?.col || 4,
                    gridRow: focusLayout.todo?.row || 1
                });
            }
        }
        return items;
    }

    // 构建 ROWS×COLS 的占用矩阵，已占用的格子填入 item.id
    _buildOccupancy(items) {
        const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
        items.forEach(item => {
            if (item.gridCol != null && item.gridRow != null) {
                for (let r = 0; r < item.spanY; r++) {
                    for (let c = 0; c < item.spanX; c++) {
                        const rr = item.gridRow - 1 + r;
                        const cc = item.gridCol - 1 + c;
                        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
                            grid[rr][cc] = item.id;
                        }
                    }
                }
            }
        });
        return grid;
    }

    // 在占用矩阵中查找第一个能容纳 spanX×spanY 的空位，找到后标记为已占用
    _findEmptySlot(grid, spanX, spanY) {
        for (let r = 0; r <= ROWS - spanY; r++) {
            for (let c = 0; c <= COLS - spanX; c++) {
                let fits = true;
                for (let dr = 0; dr < spanY && fits; dr++) {
                    for (let dc = 0; dc < spanX && fits; dc++) {
                        if (grid[r + dr][c + dc] !== null) fits = false;
                    }
                }
                if (fits) {
                    for (let dr = 0; dr < spanY; dr++)
                        for (let dc = 0; dc < spanX; dc++)
                            grid[r + dr][c + dc] = '__placed__';
                    return { col: c + 1, row: r + 1 };
                }
            }
        }
        return null;
    }

    // 按曼哈顿距离从近到远搜索能放下 item 的空位（不与其他已放置项重叠）
    _findEmptySlotForItem(item, allItems) {
        const occupied = allItems.filter(i => i.id !== item.id && i.gridCol != null && i.gridRow != null);
        for (let dist = 0; dist <= COLS + ROWS; dist++) {
            for (let r = 1; r <= ROWS - item.spanY + 1; r++) {
                for (let c = 1; c <= COLS - item.spanX + 1; c++) {
                    if (Math.abs(r - item.gridRow) + Math.abs(c - item.gridCol) !== dist) continue;
                    let fits = true;
                    for (const other of occupied) {
                        if (c < other.gridCol + other.spanX && c + item.spanX > other.gridCol &&
                            r < other.gridRow + other.spanY && r + item.spanY > other.gridRow) {
                            fits = false; break;
                        }
                    }
                    if (fits) return { col: c, row: r };
                }
            }
        }
        return null;
    }

    // 自动布局：为没有位置信息的项分配初始位置（番茄钟/待办有默认位置，书签按顺序填空）
    autoLayout(items) {
        const grid = this._buildOccupancy(items);
        items.forEach(item => {
            if (item.gridCol == null || item.gridRow == null) {
                if (item.source === 'pomo') {
                    item.gridCol = 2; item.gridRow = 1;
                } else if (item.source === 'todo') {
                    item.gridCol = 4; item.gridRow = 1;
                } else {
                    const slot = this._findEmptySlot(grid, item.spanX, item.spanY);
                    if (slot) { item.gridCol = slot.col; item.gridRow = slot.row; }
                }
                this._persistPosition(item);
            }
        });
    }

    // 解决碰撞冲突：按行列排序后逐个检测重叠，冲突项移到最近空位
    resolveCollisions(items) {
        const placed = [];
        items.sort((a, b) => (a.gridRow || 1) - (b.gridRow || 1) || (a.gridCol || 1) - (b.gridCol || 1));
        for (const item of items) {
            if (item.gridCol == null || item.gridRow == null) continue;
            // 超出边界 → 移到最近空位
            if (item.gridCol + item.spanX - 1 > COLS || item.gridRow + item.spanY - 1 > ROWS) {
                const slot = this._findNearestEmpty(item, placed);
                if (slot) { item.gridCol = slot.col; item.gridRow = slot.row; this._persistPosition(item); }
            }
            // 与已放置项重叠 → 移到最近空位
            const conflict = placed.find(p =>
                item.gridCol < p.gridCol + p.spanX && item.gridCol + item.spanX > p.gridCol &&
                item.gridRow < p.gridRow + p.spanY && item.gridRow + item.spanY > p.gridRow
            );
            if (conflict) {
                const slot = this._findNearestEmpty(item, placed);
                if (slot) { item.gridCol = slot.col; item.gridRow = slot.row; this._persistPosition(item); }
            }
            placed.push(item);
        }
    }

    // 按曼哈顿距离搜索最近的空位（避开已放置项），用于碰撞重排
    _findNearestEmpty(item, placedItems) {
        const origCol = item.gridCol || 1;
        const origRow = item.gridRow || 1;
        for (let dist = 0; dist <= COLS + ROWS; dist++) {
            for (let r = 1; r <= ROWS - item.spanY + 1; r++) {
                for (let c = 1; c <= COLS - item.spanX + 1; c++) {
                    if (Math.abs(r - origRow) + Math.abs(c - origCol) !== dist) continue;
                    let fits = true;
                    for (const other of placedItems) {
                        if (c < other.gridCol + other.spanX && c + item.spanX > other.gridCol &&
                            r < other.gridRow + other.spanY && r + item.spanY > other.gridRow) {
                            fits = false; break;
                        }
                    }
                    if (fits) return { col: c, row: r };
                }
            }
        }
        return null;
    }

    // 持久化项的位置信息：书签写入 localStorage(moltap-bookmarks)，番茄钟/待办写入 moltap-focus-layout
    _persistPosition(item) {
        if (item.source === 'bookmark') {
            const b = this.bookmarks.findBookmark(item.id);
            if (b) {
                b.gridCol = item.gridCol;
                b.gridRow = item.gridRow;
                b.spanX = item.spanX;
                b.spanY = item.spanY;
                this.bookmarks.save();
            }
        } else if (item.source === 'pomo' || item.source === 'todo') {
            let layout = {};
            try { layout = JSON.parse(localStorage.getItem('moltap-focus-layout') || '{}'); } catch {}
            if (!layout[item.source]) layout[item.source] = {};
            layout[item.source].col = item.gridCol;
            layout[item.source].row = item.gridRow;
            layout[item.source].spanX = item.spanX;
            layout[item.source].spanY = item.spanY;
            localStorage.setItem('moltap-focus-layout', JSON.stringify(layout));
        }
    }

    // 渲染网格：FLIP 动画实现平滑过渡
    // mode='fade' 新项逐个淡入，mode='reposition' 已有项平滑滑动到新位置
    render(mode) {
        // 第一步：记录所有现有元素的旧位置
        const oldPositions = new Map();
        if (!mode) mode = 'fade';
        this.container.querySelectorAll('.grid-item[data-id]').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0) oldPositions.set(el.dataset.id, { left: rect.left, top: rect.top });
        });

        // 第二步：清空容器，重新收集项并计算位置
        this.container.innerHTML = '';
        const items = this.getAllItems();
        this.autoLayout(items);
        this.resolveCollisions(items);

        // 判断动画类型：有旧位置且无新增项 → 使用滑动动画
        const hasOldPositions = oldPositions.size > 0;
        let newIds = new Set(items.map(i => i.id));
        let hasNewItems = false;
        for (const id of newIds) { if (!oldPositions.has(id)) { hasNewItems = true; break; } }

        const shouldAnimateSlide = hasOldPositions && !hasNewItems;

        // 第三步：创建 DOM 元素
        items.forEach((item, idx) => {
            const el = this._renderItem(item);
            if (el) {
                if (!shouldAnimateSlide) {
                    el.style.animationDelay = `${idx * 40}ms`; // 逐个淡入延迟
                }
                this.container.appendChild(el);
            }
        });

        if (this.editMode) {
            const addEl = this._renderAddButton();
            if (addEl) this.container.appendChild(addEl);
        }

        // 第四步：FLIP 动画 - 先偏移到旧位置，再动画回新位置
        if (shouldAnimateSlide) {
            requestAnimationFrame(() => {
                // 计算新旧位置差，设置初始偏移
                const elements = this.container.querySelectorAll('.grid-item[data-id]');
                elements.forEach(el => {
                    const id = el.dataset.id;
                    const oldPos = oldPositions.get(id);
                    if (!oldPos) return;
                    const newRect = el.getBoundingClientRect();
                    const dx = oldPos.left - newRect.left;
                    const dy = oldPos.top - newRect.top;
                    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
                    el.style.transform = `translate(${dx}px, ${dy}px)`;
                    el.style.transition = 'none';
                });
                requestAnimationFrame(() => {
                    // 移除偏移，触发 CSS transition 动画回原位
                    const elements = this.container.querySelectorAll('.grid-item[data-id]');
                    elements.forEach(el => {
                        const id = el.dataset.id;
                        if (!oldPositions.has(id)) return;
                        el.style.transition = 'transform 0.35s cubic-bezier(0.4,0,0.2,1)';
                        el.style.transform = '';
                    });
                    const cleanup = () => {
                        elements.forEach(el => {
                            el.style.transition = '';
                        });
                    };
                    setTimeout(cleanup, 380);
                });
            });
        }
    }

    // 渲染单个网格项：设置 grid 定位、内容、编辑模式下的删除按钮/拖拽/右键菜单
    _renderItem(item) {
        const el = document.createElement('div');
        el.className = 'grid-item' + (item.source === 'bookmark' && item.data?.isFolder ? ' folder' : '');
        el.dataset.id = item.id;
        el.setAttribute('data-local-adapt', '');
        el.style.gridColumn = `${item.gridCol} / ${item.gridCol + item.spanX}`;
        el.style.gridRow = `${item.gridRow} / ${item.gridRow + item.spanY}`;
        if (this.editMode) {
            el.classList.add('editing');
            el.draggable = true;
        }

        if (item.source === 'bookmark') {
            this._renderBookmarkContent(el, item);
        } else if (item.source === 'pomo') {
            this._renderPomoContent(el);
        } else if (item.source === 'todo') {
            this._renderTodoContent(el);
        }

        if (this.editMode) {
            const del = document.createElement('button');
            del.className = 'grid-delete';
            del.textContent = '✕';
            del.addEventListener('click', e => {
                e.stopPropagation();
                this._deleteItem(item);
            });
            el.appendChild(del);
            this._bindDrag(el, item);
            this._bindContextMenu(el, item);
        }

        this._bindLongPress(el, item);
        return el;
    }

    // 渲染书签内容：根据编辑模式和文件夹/普通书签设置不同的点击行为
    _renderBookmarkContent(el, item) {
        const data = item.data;
        if (!this.editMode) {
            if (!data.isFolder) {
                // 普通书签：点击打开链接
                el.style.cursor = 'pointer';
                el.addEventListener('click', () => window.open(data.url, '_blank'));
            } else if (item.spanX <= 1 && item.spanY <= 1) {
                // 1×1 文件夹：点击展开弹窗
                el.style.cursor = 'pointer';
                el.addEventListener('click', () => this._showFolderExpansion(data));
            }
        } else if (data.isFolder) {
            // 编辑模式下点击文件夹弹出右键菜单
            el.addEventListener('click', e => {
                if (e.target.closest('.grid-delete')) return;
                this._showFolderGridMenu(e, item);
            });
        }
        // 大尺寸文件夹（2×2/3×3）渲染内部网格预览
        if (data.isFolder && (item.spanX > 1 || item.spanY > 1)) {
            this._renderFolderGrid(el, item);
            return;
        }
        // 普通书签/1×1 文件夹：渲染图标+名称
        const iconWrap = document.createElement('div');
        iconWrap.className = 'bm-icon-wrap';
        if (data.isFolder) {
            iconWrap.innerHTML = '<span class="folder-icon">📁</span>';
        } else {
            this.bookmarks.renderIcon(iconWrap, data);
        }
        const name = document.createElement('div');
        name.className = 'bm-name';
        name.textContent = data.name;
        el.appendChild(iconWrap);
        el.appendChild(name);
    }

    // 渲染文件夹内部网格预览（2×2 或 3×3），最后一个格子显示"更多"缩略图
    _renderFolderGrid(el, item) {
        const folder = item.data;
        const bms = folder.bookmarks || [];
        const is3x3 = item.spanX >= 3 && item.spanY >= 3;
        const cols = is3x3 ? 3 : 2;
        const rows = is3x3 ? 3 : 2;
        const totalSlots = cols * rows;
        // 是否需要"更多"格子：书签数不足或刚好占满时显示
        const needMore = bms.length < totalSlots || bms.length > totalSlots - 1;
        const individualCount = needMore ? Math.min(bms.length, totalSlots - 1) : totalSlots;
        const remaining = bms.slice(individualCount);
        const moreIndex = individualCount;
        const moreCol = (moreIndex % cols) + 1;
        const moreRow = Math.floor(moreIndex / cols) + 1;

        el.classList.add('folder');
        const grid = document.createElement('div');
        grid.className = 'folder-grid' + (is3x3 ? ' three-col' : '');

        // 逐个渲染书签图标格子
        for (let i = 0; i < individualCount; i++) {
            const b = bms[i];
            const cell = document.createElement('div');
            cell.className = 'folder-grid-cell';
            const icon = document.createElement('div');
            icon.className = 'fg-icon';
            this.bookmarks.renderIcon(icon, b);
            cell.appendChild(icon);
            cell.addEventListener('click', e => {
                e.stopPropagation();
                window.open(b.url, '_blank');
            });
            grid.appendChild(cell);
        }

        // 渲染"更多"格子：显示剩余书签的缩略图标
        if (needMore) {
            const more = document.createElement('div');
            more.className = 'folder-grid-more';
            more.style.gridColumn = moreCol;
            more.style.gridRow = moreRow;
            if (remaining.length > 0) {
                const thumbs = document.createElement('div');
                thumbs.className = 'more-thumbs';
                const preview = remaining.slice(0, 4); // 最多显示4个缩略图
                for (let i = 0; i < preview.length; i++) {
                    const thumb = document.createElement('div');
                    thumb.className = 'thumb';
                    const img = document.createElement('div');
                    img.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
                    this.bookmarks.renderIcon(img, preview[i]);
                    thumb.appendChild(img);
                    thumbs.appendChild(thumb);
                }
                // 填充空位保持 2×2 布局
                for (let i = preview.length; i < 4; i++) {
                    const empty = document.createElement('div');
                    empty.className = 'thumb';
                    thumbs.appendChild(empty);
                }
                more.appendChild(thumbs);
                const label = document.createElement('div');
                label.className = 'more-label';
                label.textContent = remaining.length > 4 ? `+${remaining.length}` : '';
                more.appendChild(label);
            }
            more.addEventListener('click', e => {
                e.stopPropagation();
                if (!this.editMode) this._showFolderExpansion(folder);
            });
            grid.appendChild(more);
        }

        // 点击网格空白区域也展开文件夹
        grid.addEventListener('click', e => {
            if (e.target === grid && !this.editMode) this._showFolderExpansion(folder);
        });
        el.appendChild(grid);
    }

    // 渲染番茄钟卡片内容，延迟绑定事件（等待 DOM 就绪）
    _renderPomoContent(el) {
        const card = document.createElement('div');
        card.className = 'grid-focus-card';
        card.innerHTML = `
            <h4>🍅 番茄钟</h4>
            <div class="pomodoro-display" id="pomoDisplay" title="点击编辑时间">25:00</div>
            <div class="pomodoro-status" id="pomoStatus">准备开始</div>
            <div class="pomodoro-controls">
                <button id="pomoStartBtn">开始</button>
                <button class="secondary" id="pomoResetBtn">重置</button>
            </div>
            <div class="pomodoro-status" id="pomoCycles">已完成 0 个番茄</div>`;
        el.appendChild(card);
        setTimeout(() => this.focus.bindGridPomoEvents(), 0);
    }

    // 渲染待办事项卡片内容，延迟绑定事件
    _renderTodoContent(el) {
        const card = document.createElement('div');
        card.className = 'grid-focus-card';
        card.innerHTML = `
            <h4>📝 待办事项</h4>
            <div class="todo-input-row">
                <input id="todoInput" placeholder="添加新任务..." maxlength="100">
                <button id="todoAddBtn">添加</button>
            </div>
            <div class="todo-list" id="todoList"></div>`;
        el.appendChild(card);
        setTimeout(() => this.focus.bindGridTodoEvents(), 0);
    }

    // 渲染编辑模式下的"+"添加书签按钮，自动放置在第一个空位
    _renderAddButton() {
        const el = document.createElement('div');
        el.className = 'grid-item';
        el.style.cursor = 'pointer';
        el.dataset.id = '__add__';
        const inner = document.createElement('div');
        inner.className = 'add-icon-inner';
        inner.textContent = '+';
        el.appendChild(inner);
        const label = document.createElement('div');
        label.className = 'bm-name';
        label.textContent = '添加';
        el.appendChild(label);
        el.addEventListener('click', () => this.bookmarks.showAddDialog());
        let slot = this._findAddSlot();
        if (slot) {
            el.style.gridColumn = `${slot.col} / ${slot.col + 1}`;
            el.style.gridRow = `${slot.row} / ${slot.row + 1}`;
        }
        return el;
    }

    // 查找添加按钮应放置的空位
    _findAddSlot() {
        const items = this.getAllItems();
        const grid = this._buildOccupancy(items);
        return this._findEmptySlot(grid, 1, 1);
    }

    // 长按 800ms 进入编辑模式（移动端友好），手指移动超过 10px 取消
    _bindLongPress(el, item) {
        let startX = 0, startY = 0;
        el.addEventListener('pointerdown', e => {
            if (this.editMode) return;
            startX = e.clientX;
            startY = e.clientY;
            this._pressTimer = setTimeout(() => {
                this.enterEditMode();
            }, 800);
        });
        el.addEventListener('pointermove', e => {
            if (this._pressTimer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) {
                clearTimeout(this._pressTimer);
                this._pressTimer = null;
            }
        });
        el.addEventListener('pointerup', () => { clearTimeout(this._pressTimer); this._pressTimer = null; });
        el.addEventListener('pointercancel', () => { clearTimeout(this._pressTimer); this._pressTimer = null; });
    }

    // 绑定拖拽事件：dragstart 记录源 ID，dragend 清理状态
    _bindDrag(el, item) {
        el.addEventListener('dragstart', e => {
            this.dragSrcId = item.id;
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.id);
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
            this._clearDropIndicator();
            this.dragSrcId = null;
        });
    }

    // 程序化移动项到指定位置，如果目标位置有其他项则交换位置
    moveItem(id, newCol, newRow) {
        const items = this.getAllItems();
        const srcItem = items.find(i => i.id === id);
        if (!srcItem) return;
        const targetItem = items.find(i => i.id !== id && i.gridCol === newCol && i.gridRow === newRow);
        if (targetItem) {
            // 交换两个项的位置
            const oldCol = srcItem.gridCol;
            const oldRow = srcItem.gridRow;
            srcItem.gridCol = targetItem.gridCol;
            srcItem.gridRow = targetItem.gridRow;
            targetItem.gridCol = oldCol;
            targetItem.gridRow = oldRow;
            this._persistPosition(srcItem);
            this._persistPosition(targetItem);
        } else {
            srcItem.gridCol = newCol;
            srcItem.gridRow = newRow;
            this._persistPosition(srcItem);
        }
        this.render('reposition');
    }

    // 删除网格项：书签调用 bookmarks.deleteBookmark，番茄钟/待办设置 enabled=false
    _deleteItem(item) {
        if (item.source === 'bookmark') {
            this.bookmarks.deleteBookmark(item.id);
        } else if (item.source === 'pomo') {
            localStorage.setItem('moltap-pomo-enabled', 'false');
        } else if (item.source === 'todo') {
            localStorage.setItem('moltap-todo-enabled', 'false');
        }
        this.render('reposition');
    }

    // 显示文件夹展开弹窗：全屏遮罩 + 所有书签水平排列，点击书签打开链接
    _showFolderExpansion(folder) {
        const overlay = document.createElement('div');
        overlay.className = 'folder-expansion-overlay';
        const bookmarks = folder.bookmarks || [];
        overlay.innerHTML = `
            <div class="folder-expansion-modal">
                <div class="folder-expansion-header">
                    <span class="folder-expansion-title">${this._esc(folder.name)}</span>
                    <button class="folder-expansion-close">✕</button>
                </div>
                <div class="folder-expansion-grid">
                    ${bookmarks.map(b => `
                        <div class="folder-expansion-item" data-url="${this._esc(b.url)}">
                            <div class="bm-icon-wrap fe-icon"></div>
                            <div class="bm-name">${this._esc(b.name)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        document.body.appendChild(overlay);
        // 异步渲染图标（需要加载 favicon）
        bookmarks.forEach((b, i) => {
            const iconWrap = overlay.querySelectorAll('.fe-icon')[i];
            if (iconWrap) this.bookmarks.renderIcon(iconWrap, b);
        });
        overlay.querySelectorAll('.folder-expansion-item').forEach(el => {
            el.addEventListener('click', () => { window.open(el.dataset.url, '_blank'); overlay.remove(); });
        });
        const close = () => overlay.remove();
        overlay.querySelector('.folder-expansion-close').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', function handler(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handler); } });
    }

    // 显示文件夹右键菜单：重命名/调整大小(1×1/2×2/3×3)/添加书签/解散/删除
    _showFolderGridMenu(e, item) {
        this._hideGridMenu();
        const menu = document.createElement('div');
        menu.className = 'folder-context-menu';
        menu.id = 'gridContextMenu';
        const sizes = [
            { label: '1×1 小', sx: 1, sy: 1 },
            { label: '2×2 中', sx: 2, sy: 2 },
            { label: '3×3 大', sx: 3, sy: 3 }
        ];
        menu.innerHTML = `
            <div class="ctx-item" data-action="rename">✏️ 重命名</div>
            ${sizes.map(s => `<div class="ctx-item" data-action="resize" data-sx="${s.sx}" data-sy="${s.sy}">📐 ${s.label}</div>`).join('')}
            <div class="ctx-item" data-action="addbm">➕ 添加书签</div>
            <div class="ctx-item" data-action="dissolve">📂 解散文件夹</div>
            <div class="ctx-item danger" data-action="delete">🗑️ 删除文件夹</div>`;
        menu.addEventListener('click', ev => {
            const action = ev.target.closest('.ctx-item')?.dataset.action;
            if (!action) return;
            this._hideGridMenu();
            if (action === 'rename') {
                this._showRenameModal(item);
            } else if (action === 'resize') {
                const sx = +ev.target.closest('.ctx-item').dataset.sx;
                const sy = +ev.target.closest('.ctx-item').dataset.sy;
                const result = this._canResizeTo(item, sx, sy);
                if (result.canResize) {
                    // 将冲突项移到新位置
                    result.relocates.forEach(r => {
                        r.item.gridCol = r.col;
                        r.item.gridRow = r.row;
                        this._persistPosition(r.item);
                    });
                    item.spanX = sx;
                    item.spanY = sy;
                    this._persistPosition(item);
                    this.render('reposition');
                } else {
                    this._showToast('空间不足，无法放大');
                }
            } else if (action === 'addbm') {
                this.bookmarks.showAddToFolderDialog(item.data.id);
            } else if (action === 'dissolve') {
                this.bookmarks.dissolveFolder(item.data.id);
                this.render('reposition');
            } else if (action === 'delete') {
                this.bookmarks.deleteFolder(item.data.id);
                this.render('reposition');
            }
        });
        document.body.appendChild(menu);
        this._positionMenu(menu, e);
        // 延迟绑定点击外部关闭，避免当前事件立即触发
        setTimeout(() => {
            document.addEventListener('pointerdown', this._menuHandler = ev => {
                if (!menu.contains(ev.target)) this._hideGridMenu();
            }, { once: true });
        }, 10);
    }

    // 定位右键菜单：跟随鼠标位置，限制在视口内不溢出
    _positionMenu(menu, e) {
        let x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8);
        let y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
        menu.style.left = Math.max(4, x) + 'px';
        menu.style.top = Math.max(4, y) + 'px';
    }

    // 隐藏并销毁右键菜单
    _hideGridMenu() {
        const existing = document.getElementById('gridContextMenu');
        if (existing) existing.remove();
        if (this._menuHandler) { document.removeEventListener('pointerdown', this._menuHandler); this._menuHandler = null; }
    }

    // 绑定右键菜单：编辑模式下根据项类型显示不同菜单（书签/文件夹/组件）
    _bindContextMenu(el, item) {
        el.addEventListener('contextmenu', e => {
            if (!this.editMode) return;
            e.preventDefault();
            e.stopPropagation();
            this._hideGridMenu();
            if (item.source === 'bookmark' && !item.data?.isFolder) {
                this._showBookmarkGridMenu(e, item);
            } else if (item.source === 'bookmark' && item.data?.isFolder) {
                this._showFolderGridMenu(e, item);
            } else if (item.source === 'pomo' || item.source === 'todo') {
                this._showWidgetGridMenu(e, item);
            }
        });
    }

    // 书签右键菜单：提供编辑名称、编辑链接、修改图标、删除四项操作
    _showBookmarkGridMenu(e, item) {
        this._hideGridMenu();
        const menu = document.createElement('div');
        menu.className = 'folder-context-menu';
        menu.id = 'gridContextMenu';
        menu.innerHTML = `
            <div class="ctx-item" data-action="edit-name">✏️ 编辑名称</div>
            <div class="ctx-item" data-action="edit-url">🔗 编辑链接</div>
            <div class="ctx-item" data-action="edit-icon">🎨 修改图标</div>
            <div class="ctx-item danger" data-action="delete">🗑️ 删除书签</div>`;
        menu.addEventListener('click', ev => {
            const action = ev.target.closest('.ctx-item')?.dataset.action;
            if (!action) return;
            this._hideGridMenu();
            if (action === 'edit-name') {
                this._showInlineEditModal(item, 'name', '编辑书签名称');
            } else if (action === 'edit-url') {
                this._showInlineEditModal(item, 'url', '编辑书签链接');
            } else if (action === 'edit-icon') {
                this._showIconEditModal(item);
            } else if (action === 'delete') {
                this.bookmarks.deleteBookmark(item.id);
                this.render('reposition');
            }
        });
        document.body.appendChild(menu);
        this._positionMenu(menu, e);
        setTimeout(() => {
            document.addEventListener('pointerdown', this._menuHandler = ev => {
                if (!menu.contains(ev.target)) this._hideGridMenu();
            }, { once: true });
        }, 10);
    }

    // 组件（番茄钟/待办）右键菜单：提供调整大小和隐藏两项操作
    _showWidgetGridMenu(e, item) {
        this._hideGridMenu();
        const label = item.source === 'pomo' ? '番茄钟' : '待办事项';
        // 隐藏时写入 localStorage 的 key，render 时读取以决定是否显示
        const key = item.source === 'pomo' ? 'moltap-pomo-enabled' : 'moltap-todo-enabled';
        const menu = document.createElement('div');
        menu.className = 'folder-context-menu';
        menu.id = 'gridContextMenu';
        menu.innerHTML = `
            <div class="ctx-item" data-action="resize">📐 调整大小</div>
            <div class="ctx-item danger" data-action="hide">👁️ 隐藏${label}</div>`;
        menu.addEventListener('click', ev => {
            const action = ev.target.closest('.ctx-item')?.dataset.action;
            if (!action) return;
            this._hideGridMenu();
            if (action === 'hide') {
                localStorage.setItem(key, 'false');
                this.render('reposition');
            } else if (action === 'resize') {
                this._showResizeModal(item);
            }
        });
        document.body.appendChild(menu);
        this._positionMenu(menu, e);
        setTimeout(() => {
            document.addEventListener('pointerdown', this._menuHandler = ev => {
                if (!menu.contains(ev.target)) this._hideGridMenu();
            }, { once: true });
        }, 10);
    }

    // 轻量单字段编辑弹窗：用于右键菜单中编辑书签名称或链接
    // field 参数为 'name' 或 'url'，保存时自动为 URL 补全 https:// 前缀
    _showInlineEditModal(item, field, title) {
        const currentVal = field === 'name' ? item.data.name : item.data.url;
        const overlay = document.createElement('div');
        overlay.className = 'form-modal-overlay';
        overlay.innerHTML = `
            <div class="form-modal-card">
                <h3>${this._esc(title)}</h3>
                <div class="form-field">
                    <label>${field === 'name' ? '名称' : '链接'}</label>
                    <input id="inlineEditInput" type="text" value="${this._esc(currentVal)}" placeholder="${field === 'url' ? 'https://...' : ''}">
                </div>
                <div class="form-actions">
                    <button class="btn-sm" id="inlineEditCancel">取消</button>
                    <button class="btn-sm primary" id="inlineEditSave">保存</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('#inlineEditInput');
        input.focus();
        input.select();
        overlay.querySelector('#inlineEditCancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#inlineEditSave').addEventListener('click', () => {
            const val = input.value.trim();
            if (val) {
                this.bookmarks.updateBookmark(item.id, { [field]: field === 'url' && !val.startsWith('http') ? 'https://' + val : val });
                overlay.remove();
                this.render('reposition');
            }
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') overlay.querySelector('#inlineEditSave').click(); });
    }

    // 图标编辑弹窗：4 种图标类型切换（自动/表情/字母/图片）
    // - auto：运行时自动获取网站 favicon
    // - emoji：从 40 个预设表情中选择
    // - letter：取书签名首字母生成字母图标
    // - image：输入自定义图片 URL
    _showIconEditModal(item) {
        const EMOJIS = ['⭐','🌟','💎','🔥','🎯','🎨','🎵','📚','💡','🌈','❤️','🍀','🎮','📷','🏠','💼','🔧','📱','💻','🌍','🎁','🚀','⚡','🌸','🍎','🎪','🏆','🎭','📌','🔑','🎲','🌙','☀️','🦋','🐬','🌺','🍒','🎈','📝','🔔'];
        let currentType = item.data.iconType || 'auto';
        let currentValue = item.data.iconValue || '';
        const overlay = document.createElement('div');
        overlay.className = 'form-modal-overlay';
        const renderArea = () => {
            const area = overlay.querySelector('#iconEditArea');
            if (currentType === 'emoji') {
                area.innerHTML = `<div class="emoji-picker-grid">${EMOJIS.map(e => `<button class="emoji-picker-btn" data-emoji="${e}" style="${currentValue === e ? 'background:var(--input-bg)' : ''}">${e}</button>`).join('')}</div>`;
                area.querySelector('.emoji-picker-grid').addEventListener('click', ev => {
                    const btn = ev.target.closest('.emoji-picker-btn');
                    if (btn) { currentValue = btn.dataset.emoji; area.querySelectorAll('.emoji-picker-btn').forEach(b => b.style.background = ''); btn.style.background = 'var(--input-bg)'; }
                });
            } else if (currentType === 'image') {
                area.innerHTML = `<input id="iconImageUrl" class="input-sm" placeholder="输入图片URL..." value="${currentValue}" style="width:100%">`;
            } else {
                area.innerHTML = `<p style="font-size:12px;color:var(--text-tertiary)">将使用${currentType === 'auto' ? '网站图标（自动获取）' : '书签名首字母'}作为图标</p>`;
            }
        };
        overlay.innerHTML = `
            <div class="form-modal-card">
                <h3>修改图标</h3>
                <div class="form-field">
                    <label>图标类型</label>
                    <div class="theme-switch" id="iconEditTypeSwitch">
                        <button class="theme-switch-btn ${currentType === 'auto' ? 'active' : ''}" data-type="auto">自动</button>
                        <button class="theme-switch-btn ${currentType === 'emoji' ? 'active' : ''}" data-type="emoji">表情</button>
                        <button class="theme-switch-btn ${currentType === 'letter' ? 'active' : ''}" data-type="letter">字母</button>
                        <button class="theme-switch-btn ${currentType === 'image' ? 'active' : ''}" data-type="image">图片</button>
                    </div>
                </div>
                <div id="iconEditArea"></div>
                <div class="form-actions">
                    <button class="btn-sm" id="iconEditCancel">取消</button>
                    <button class="btn-sm primary" id="iconEditSave">保存</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        renderArea();
        overlay.querySelector('#iconEditTypeSwitch').addEventListener('click', ev => {
            const btn = ev.target.closest('.theme-switch-btn');
            if (btn) { currentType = btn.dataset.type; overlay.querySelectorAll('#iconEditTypeSwitch .theme-switch-btn').forEach(b => b.classList.toggle('active', b === btn)); renderArea(); }
        });
        overlay.querySelector('#iconEditCancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#iconEditSave').addEventListener('click', () => {
            if (currentType === 'image') currentValue = overlay.querySelector('#iconImageUrl')?.value.trim() || '';
            this.bookmarks.updateBookmark(item.id, { iconType: currentType, iconValue: currentValue });
            overlay.remove();
            this.render('reposition');
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    }

    // 调整大小弹窗：提供 2×2、3×2、3×3 三种尺寸
    // 选择后调用 _canResizeTo 检测碰撞并尝试重新安置冲突项
    _showResizeModal(item) {
        const sizes = [
            { label: '2×2', sx: 2, sy: 2 },
            { label: '3×2', sx: 3, sy: 2 },
            { label: '3×3', sx: 3, sy: 3 }
        ];
        const overlay = document.createElement('div');
        overlay.className = 'form-modal-overlay';
        overlay.innerHTML = `
            <div class="form-modal-card">
                <h3>调整大小</h3>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
                    ${sizes.map(s => `<button class="btn-sm ${item.spanX === s.sx && item.spanY === s.sy ? 'primary' : ''}" data-sx="${s.sx}" data-sy="${s.sy}">${s.label}</button>`).join('')}
                </div>
                <div class="form-actions">
                    <button class="btn-sm" id="resizeCancel">取消</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelectorAll('.btn-sm[data-sx]').forEach(btn => {
            btn.addEventListener('click', () => {
                const sx = +btn.dataset.sx;
                const sy = +btn.dataset.sy;
                const result = this._canResizeTo(item, sx, sy);
                if (result.canResize) {
                    result.relocates.forEach(r => {
                        r.item.gridCol = r.col;
                        r.item.gridRow = r.row;
                        this._persistPosition(r.item);
                    });
                    item.spanX = sx;
                    item.spanY = sy;
                    this._persistPosition(item);
                    overlay.remove();
                    this.render('reposition');
                } else {
                    this._showToast('空间不足，无法放大');
                }
            });
        });
        overlay.querySelector('#resizeCancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    }

    // 文件夹重命名弹窗：单输入框表单，Enter 键快捷保存
    _showRenameModal(item) {
        const overlay = document.createElement('div');
        overlay.className = 'form-modal-overlay';
        overlay.innerHTML = `
            <div class="form-modal-card">
                <h3>重命名文件夹</h3>
                <div class="form-field">
                    <label>名称</label>
                    <input id="renameInput" type="text" value="${this._esc(item.data.name)}" placeholder="输入新名称">
                </div>
                <div class="form-actions">
                    <button class="btn-sm" id="renameCancelBtn">取消</button>
                    <button class="btn-sm primary" id="renameSaveBtn">保存</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('#renameInput');
        input.focus();
        input.select();
        overlay.querySelector('#renameCancelBtn').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#renameSaveBtn').addEventListener('click', () => {
            const val = input.value.trim();
            if (val) {
                this.bookmarks.renameFolder(item.data.id, val);
                overlay.remove();
                this.render('reposition');
            }
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') overlay.querySelector('#renameSaveBtn').click(); });
    }

    // 进入编辑模式：设置标志位后重新渲染（显示拖拽手柄、删除按钮、添加按钮）
    enterEditMode() {
        if (this.editMode) return;
        this.editMode = true;
        this.render();
    }

    // 退出编辑模式：清除标志位后重新渲染（恢复正常交互模式）
    exitEditMode() {
        if (!this.editMode) return;
        this.editMode = false;
        this.render();
    }

    // 外部刷新接口：以滑动动画模式重新渲染（不触发入场动画）
    refresh() {
        this.render('reposition');
    }

    // 判断能否将 item 放大到 newSx×newSy
    // 算法：构建目标尺寸的占用网格，逐轮检测冲突项并尝试将其移到最近空位
    // 最多迭代 30 轮；若任一轮无法安置冲突项则回滚所有位移并返回失败
    // 返回 { canResize, relocates } — relocates 记录所有被移动的项及其原始位置（用于回滚）
    _canResizeTo(item, newSx, newSy) {
        if (item.gridCol + newSx - 1 > COLS || item.gridRow + newSy - 1 > ROWS) {
            return { canResize: false, relocates: [] };
        }
        const allItems = this.getAllItems();
        const others = allItems.filter(i => i.id !== item.id);
        const relocates = [];
        for (let iter = 0; iter < 30; iter++) {
            const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
            for (let r = 0; r < newSy; r++) {
                for (let c = 0; c < newSx; c++) {
                    grid[item.gridRow - 1 + r][item.gridCol - 1 + c] = item.id;
                }
            }
            let conflict = null;
            for (const o of others) {
                if (o.gridCol == null || o.gridRow == null) continue;
                let overlaps = false;
                for (let r = 0; r < o.spanY && !overlaps; r++) {
                    for (let c = 0; c < o.spanX && !overlaps; c++) {
                        const rr = o.gridRow - 1 + r, cc = o.gridCol - 1 + c;
                        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && grid[rr][cc] !== null) overlaps = true;
                    }
                }
                if (overlaps) {
                    conflict = o;
                    break;
                }
                for (let r = 0; r < o.spanY; r++) {
                    for (let c = 0; c < o.spanX; c++) {
                        const rr = o.gridRow - 1 + r, cc = o.gridCol - 1 + c;
                        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) grid[rr][cc] = o.id;
                    }
                }
            }
            if (!conflict) return { canResize: true, relocates };
            const slot = this._findNearestEmptyForResize(conflict, grid);
            if (!slot) {
                relocates.forEach(r => { r.item.gridCol = r.origCol; r.item.gridRow = r.origRow; });
                return { canResize: false, relocates: [] };
            }
            relocates.push({ item: conflict, col: slot.col, row: slot.row, origCol: conflict.gridCol, origRow: conflict.gridRow });
            conflict.gridCol = slot.col;
            conflict.gridRow = slot.row;
        }
        relocates.forEach(r => { r.item.gridCol = r.origCol; r.item.gridRow = r.origRow; });
        return { canResize: false, relocates: [] };
    }

    // 曼哈顿距离搜索最近空位（用于 _canResizeTo 中冲突项的重新安置）
    // 基于传入的 grid 占用矩阵判断，与 _findNearestEmpty 的区别在于使用实时网格状态
    _findNearestEmptyForResize(item, grid) {
        const origCol = item.gridCol || 1;
        const origRow = item.gridRow || 1;
        for (let dist = 0; dist <= COLS + ROWS; dist++) {
            for (let r = 1; r <= ROWS - item.spanY + 1; r++) {
                for (let c = 1; c <= COLS - item.spanX + 1; c++) {
                    if (Math.abs(r - origRow) + Math.abs(c - origCol) !== dist) continue;
                    let fits = true;
                    for (let dr = 0; dr < item.spanY && fits; dr++) {
                        for (let dc = 0; dc < item.spanX && fits; dc++) {
                            if (grid[r - 1 + dr][c - 1 + dc] !== null) fits = false;
                        }
                    }
                    if (fits) return { col: c, row: r };
                }
            }
        }
        return null;
    }

    // 显示轻量 Toast 提示：2.2 秒后自动消失，同时只存在一个
    _showToast(msg) {
        const old = document.querySelector('.toast');
        if (old) old.remove();
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2200);
    }

    // HTML 转义：利用 DOM textContent→innerHTML 防止 XSS 注入
    _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}
