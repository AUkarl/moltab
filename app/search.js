/**
 * SearchManager - 多引擎搜索管理
 * 支持 7 个搜索引擎切换、搜索历史（最多50条）、历史建议下拉、键盘快捷键
 * 快捷键：Ctrl+K 聚焦搜索框、/ 聚焦、Esc 退出、1-9 快速打开书签、? 帮助
 */
export class SearchManager {
    constructor() {
        // 搜索引擎配置：key -> {名称, 搜索URL前缀}
        this.engines = {
            baidu: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
            bing: { name: '必应', url: 'https://www.bing.com/search?q=' },
            google: { name: '谷歌', url: 'https://www.google.com/search?q=' },
            duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
            yandex: { name: 'Yandex', url: 'https://yandex.com/search/?text=' },
            sogou: { name: '搜狗', url: 'https://www.sogou.com/web?query=' },
            '360': { name: '360搜索', url: 'https://www.so.com/s?q=' }
        };
        this.current = localStorage.getItem('moltap-engine') || 'baidu';
        this.input = document.getElementById('searchInput');
        this.submitBtn = document.getElementById('searchSubmitBtn');
        this.clearBtn = document.getElementById('searchClearBtn');
        this.engineBtn = document.getElementById('engineBtn');
        this.engineBtnText = document.getElementById('engineBtnText');
        this.engineArrow = document.getElementById('engineArrow');
        this.dropdown = document.getElementById('engineDropdown');
        this.historyList = [];
        this.historyDropdown = null;
        try { this.historyList = JSON.parse(localStorage.getItem('moltap-search-history') || '[]'); } catch { this.historyList = []; }
    }

    init() {
        this.setEngine(this.current);
        this.submitBtn.addEventListener('click', () => this.search(this.input.value));
        this.input.addEventListener('keydown', e => {
            if (e.key === 'Enter') this.search(this.input.value);
            if (e.key === 'Escape') { this.input.blur(); this.hideHistory(); }
            // 上下箭头浏览搜索历史
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.navigateHistory(e.key === 'ArrowDown' ? 1 : -1); }
        });
        this.input.addEventListener('input', () => {
            this.clearBtn.classList.toggle('visible', this.input.value.length > 0);
            this.showHistorySuggestions(this.input.value);
        });
        this.input.addEventListener('focus', () => { if (this.input.value.length === 0) this.showHistorySuggestions(''); });
        this.clearBtn.addEventListener('click', () => { this.input.value = ''; this.clearBtn.classList.remove('visible'); this.input.focus(); });
        this.engineBtn.addEventListener('click', e => { e.stopPropagation(); this.toggleDropdown(); });
        this.dropdown.addEventListener('click', e => { const opt = e.target.closest('.engine-option'); if (opt) this.setEngine(opt.dataset.engine); });
        // 点击外部关闭下拉菜单
        document.addEventListener('click', e => {
            if (!this.dropdown.contains(e.target) && e.target !== this.engineBtn) this.closeDropdown();
            if (this.historyDropdown && !this.historyDropdown.contains(e.target) && e.target !== this.input) this.hideHistory();
        });
        this.initKeyboardShortcuts();
    }

    /** 注册全局键盘快捷键 */
    initKeyboardShortcuts() {
        document.addEventListener('keydown', e => {
            const modal = document.getElementById('modalOverlay');
            const kbdHelp = document.getElementById('kbdHelpOverlay');
            if (e.key === 'Escape') {
                if (!kbdHelp?.classList.contains('hidden')) { kbdHelp.classList.add('hidden'); return; }
                if (this.input === document.activeElement) { this.input.blur(); this.hideHistory(); return; }
            }
            // Ctrl+K 聚焦搜索框
            if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); this.input.focus(); this.input.select(); return; }
            // Ctrl+, 打开设置
            if (e.ctrlKey && e.key === ',') { e.preventDefault(); document.getElementById('settingsBtn')?.click(); return; }
            // ? 显示/隐藏键盘帮助
            if (e.key === '?' && this.input !== document.activeElement && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                kbdHelp?.classList.toggle('hidden');
                return;
            }
            // / 聚焦搜索框
            if (e.key === '/' && this.input !== document.activeElement && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                this.input.focus();
                return;
            }
            // 数字键 1-9 快速打开对应书签
            if (this.input !== document.activeElement && !e.ctrlKey && !e.altKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
                const bookmarks = document.querySelectorAll('.bookmark-item:not(.folder)');
                const idx = parseInt(e.key) - 1;
                if (bookmarks[idx]) {
                    const url = bookmarks[idx].querySelector('.bm-name')?.textContent;
                    const allItems = document.querySelectorAll('.bookmark-item');
                    let count = 0;
                    for (const item of allItems) {
                        if (item.classList.contains('folder')) continue;
                        if (count === idx) {
                            item.click();
                            break;
                        }
                        count++;
                    }
                }
            }
        });
    }

    /** 切换当前搜索引擎并持久化 */
    setEngine(key) {
        this.current = key;
        localStorage.setItem('moltap-engine', key);
        this.engineBtnText.textContent = this.engines[key].name;
        this.input.placeholder = `在 ${this.engines[key].name} 中搜索...`;
        this.dropdown.querySelectorAll('.engine-option').forEach(o => o.classList.toggle('selected', o.dataset.engine === key));
        this.closeDropdown();
    }

    /** 执行搜索：保存历史后跳转到搜索引擎结果页 */
    search(q) {
        q = q.trim();
        if (!q) return;
        this.saveHistory(q);
        this.hideHistory();
        window.open(this.engines[this.current].url + encodeURIComponent(q), '_self');
    }

    /** 保存搜索关键词到历史（去重，最多50条） */
    saveHistory(q) {
        this.historyList = this.historyList.filter(h => h !== q);
        this.historyList.unshift(q);
        if (this.historyList.length > 50) this.historyList = this.historyList.slice(0, 50);
        localStorage.setItem('moltap-search-history', JSON.stringify(this.historyList));
    }

    /** 显示搜索历史建议下拉（最多6条，按输入过滤） */
    showHistorySuggestions(query) {
        this.hideHistory();
        const filtered = query ? this.historyList.filter(h => h.toLowerCase().includes(query.toLowerCase())).slice(0, 6) : this.historyList.slice(0, 6);
        if (!filtered.length) return;
        if (!this.historyDropdown) {
            this.historyDropdown = document.createElement('div');
            this.historyDropdown.className = 'search-history-dropdown';
            this.input.parentElement.appendChild(this.historyDropdown);
        }
        this.historyDropdown.innerHTML = filtered.map(h => `<div class="history-item" data-q="${this.esc(h)}">${this.esc(h)}</div>`).join('');
        this.historyDropdown.classList.add('active');
        this.historyDropdown.addEventListener('click', e => {
            const item = e.target.closest('.history-item');
            if (item) { this.input.value = item.dataset.q; this.search(item.dataset.q); }
        });
    }

    hideHistory() { if (this.historyDropdown) { this.historyDropdown.classList.remove('active'); } }

    /** 上下箭头浏览历史，修改搜索框内容 */
    navigateHistory(dir) {
        if (!this.historyList.length) return;
        const current = this.input.value;
        if (!this._histIdx) this._histIdx = -1;
        this._histIdx = Math.max(-1, Math.min(this.historyList.length - 1, this._histIdx + dir));
        this.input.value = this._histIdx === -1 ? current : this.historyList[this._histIdx];
    }

    /** HTML 转义防止 XSS */
    esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    toggleDropdown() { this.dropdown.classList.toggle('active'); this.engineArrow.classList.toggle('open'); }
    closeDropdown() { this.dropdown.classList.remove('active'); this.engineArrow.classList.remove('open'); }
}
