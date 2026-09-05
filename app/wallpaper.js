/**
 * 壁纸管理模块
 * 5个内置图库（自然/建筑/抽象/极简/必应每日）+ 自定义图库
 * 基于种子的随机壁纸算法：同一天同一图库生成相同的壁纸序列
 * 支持渐进式加载（先缩略图后高清）、自定义壁纸URL、固定单张壁纸
 */
const BUILTIN_GALLERIES = [
    { id: 'nature', name: '自然风光', keywords: 'nature,landscape,mountain,forest,ocean,sunset,sky,waterfall' },
    { id: 'architecture', name: '城市建筑', keywords: 'architecture,building,city,urban,skyline,bridge,tower' },
    { id: 'abstract', name: '抽象艺术', keywords: 'abstract,art,color,pattern,gradient,painting,digital' },
    { id: 'minimal', name: '极简风格', keywords: 'minimal,simple,clean,white,elegant,soft,pastel' },
    { id: 'bing', name: '必应每日', keywords: '' }
];

/**
 * 壁纸管理器
 * - seeds: 当前图库的图片种子列表，每个种子包含 url(可选) 和 seed(用于Picsum)
 * - currentBgIndex: 当前显示的图片索引
 * - customBgUrl: 自定义壁纸URL，优先级最高
 * - customGalleries: 用户添加的自定义图库（URL列表或API接口）
 */
export class WallpaperManager {
    constructor() {
        this.currentGallery = localStorage.getItem('moltap-gallery') || 'nature';
        this.currentBgIndex = parseInt(localStorage.getItem('moltap-bgindex') || '0', 10) || 0;
        this.customBgUrl = localStorage.getItem('moltap-custombg') || '';
        this.seeds = [];
        this.customGalleries = [];
        try { this.customGalleries = JSON.parse(localStorage.getItem('moltap-custom-galleries') || '[]'); } catch { this.customGalleries = []; }
        this.bgLoading = document.querySelector('.bg-loading');
        this.onChangeCallbacks = [];
    }

    init() {
        if (this.isPinned()) {
            this.restorePinned();
        } else {
            this.loadSeeds();
        }
        this.applyBackground();
    }

    onChange(cb) { this.onChangeCallbacks.push(cb); }
    notifyChange() { this.onChangeCallbacks.forEach(cb => cb()); }

    getAllGalleries() {
        return [...BUILTIN_GALLERIES.map(g => ({ ...g, type: 'builtin' })), ...this.customGalleries.map(g => ({ ...g, type: 'custom' }))];
    }

    /** 加载种子列表：同一天同一图库复用缓存，否则重新生成 */
    loadSeeds() {
        if (this.isPinned()) return;
        const today = new Date().toISOString().slice(0, 10);
        const storedDate = localStorage.getItem('moltap-wallpaper-date');
        const storedGallery = localStorage.getItem('moltap-wallpaper-gallery');
        if (storedDate !== today || storedGallery !== this.currentGallery) {
            this.generateSeeds();
            localStorage.setItem('moltap-wallpaper-date', today);
            localStorage.setItem('moltap-wallpaper-gallery', this.currentGallery);
            localStorage.setItem('moltap-wallpaper-seeds', JSON.stringify(this.seeds));
            this.currentBgIndex = 0;
            localStorage.setItem('moltap-bgindex', '0');
        } else {
            try { this.seeds = JSON.parse(localStorage.getItem('moltap-wallpaper-seeds') || '[]'); } catch { this.seeds = []; }
            if (!this.seeds.length) this.generateSeeds();
        }
    }

    /**
     * 生成种子列表
     * - 自定义图库：直接使用URL列表
     * - 必应每日：调用Bing API获取8张图
     * - 内置图库：用日期+图库名+关键词生成16个种子，由Picsum根据seed返回确定性图片
     */
    generateSeeds() {
        const today = new Date().toISOString().slice(0, 10);
        const gallery = this.getAllGalleries().find(g => g.id === this.currentGallery);
        if (!gallery) { this.seeds = []; return; }
        if (gallery.type === 'custom') {
            this.seeds = gallery.urls.map((url, i) => ({ url, seed: `custom-${i}` }));
        } else if (gallery.id === 'bing') {
            this.seeds = [];
            return this.fetchBingSeeds();
        } else {
            const keywords = gallery.keywords.split(',');
            this.seeds = Array.from({ length: 16 }, (_, i) => {
                const kw = keywords[i % keywords.length];
                return { url: null, seed: `${today}-${this.currentGallery}-${kw}-${i}` };
            });
        }
    }

    /** 从Bing API获取每日壁纸，失败时用种子fallback */
    async fetchBingSeeds() {
        try {
            const resp = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN');
            const data = await resp.json();
            if (data?.images) {
                this.seeds = data.images.map(img => ({
                    url: `https://www.bing.com${img.url}`,
                    seed: `bing-${img.startdate}`,
                    title: img.title || ''
                }));
                localStorage.setItem('moltap-wallpaper-seeds', JSON.stringify(this.seeds));
                this.applyBackground();
                this.notifyChange();
            }
        } catch (e) {
            this.seeds = Array.from({ length: 8 }, (_, i) => ({
                url: null,
                seed: `bing-fallback-${new Date().toISOString().slice(0, 10)}-${i}`
            }));
        }
    }

    /** 获取缩略图URL（320×180），用于预览网格 */
    getThumbUrl(item) {
        if (!item) return '';
        if (item.url) return item.url;
        return `https://picsum.photos/seed/${item.seed}/320/180`;
    }

    /** 获取高清URL（1920×1080），用于实际背景 */
    getFullUrl(item) {
        if (!item) return '';
        if (item.url) return item.url;
        return `https://picsum.photos/seed/${item.seed}/1920/1080`;
    }

    /** 应用当前壁纸到body背景 */
    async applyBackground() {
        const item = this.seeds[this.currentBgIndex];
        if (this.customBgUrl) {
            await this.progressiveLoad(this.customBgUrl, null);
            return;
        }
        if (!item) {
            document.body.style.backgroundImage = 'linear-gradient(135deg, #e8ecf1, #c3d0dc)';
            if (this.bgLoading) this.bgLoading.classList.add('loaded');
            return;
        }
        const thumbUrl = this.getThumbUrl(item);
        const fullUrl = this.getFullUrl(item);
        await this.progressiveLoad(fullUrl, thumbUrl);
    }

    /**
     * 渐进式加载：先显示缩略图（模糊），再加载高清替换
     * 15秒超时保护，失败时显示渐变兜底
     */
    async progressiveLoad(fullUrl, thumbUrl) {
        if (this.bgLoading) this.bgLoading.classList.remove('loaded');
        if (thumbUrl) {
            const thumb = new Image();
            await new Promise(resolve => {
                thumb.onload = resolve;
                thumb.onerror = resolve;
                thumb.src = thumbUrl;
            });
            document.body.style.backgroundImage = `url(${thumbUrl})`;
        }
        return new Promise(resolve => {
            let settled = false;
            const settle = () => { if (!settled) { settled = true; resolve(); } };
            const img = new Image();
            const timer = setTimeout(() => {
                if (!settled) {
                    if (!thumbUrl) {
                        document.body.style.backgroundImage = 'linear-gradient(135deg, #e8ecf1, #c3d0dc)';
                    }
                    if (this.bgLoading) this.bgLoading.classList.add('loaded');
                    settle();
                }
            }, 15000);
            img.onload = () => {
                clearTimeout(timer);
                document.body.style.backgroundImage = `url(${fullUrl})`;
                if (this.bgLoading) this.bgLoading.classList.add('loaded');
                settle();
            };
            img.onerror = () => {
                clearTimeout(timer);
                if (!thumbUrl) {
                    document.body.style.backgroundImage = 'linear-gradient(135deg, #e8ecf1, #c3d0dc)';
                }
                if (this.bgLoading) this.bgLoading.classList.add('loaded');
                settle();
            };
            img.src = fullUrl;
        });
    }

    /** 切换图库，重置索引和种子 */
    async setGallery(galleryId) {
        this.currentGallery = galleryId;
        localStorage.setItem('moltap-gallery', galleryId);
        await this.generateSeeds();
        localStorage.setItem('moltap-wallpaper-seeds', JSON.stringify(this.seeds));
        localStorage.setItem('moltap-wallpaper-gallery', this.currentGallery);
        localStorage.setItem('moltap-wallpaper-date', new Date().toISOString().slice(0, 10));
        this.currentBgIndex = 0;
        localStorage.setItem('moltap-bgindex', '0');
        this.customBgUrl = '';
        localStorage.removeItem('moltap-custombg');
        this.applyBackground();
        this.notifyChange();
    }

    /** 切换到指定索引的背景图 */
    setBgImage(index) {
        this.customBgUrl = '';
        localStorage.removeItem('moltap-custombg');
        this.currentBgIndex = index;
        localStorage.setItem('moltap-bgindex', index);
        this.applyBackground();
        this.notifyChange();
    }

    /** 设置自定义壁纸URL */
    setCustomBg(url) {
        this.customBgUrl = url;
        localStorage.setItem('moltap-custombg', url);
        this.applyBackground();
        this.notifyChange();
    }

    clearCustomBg() {
        this.customBgUrl = '';
        localStorage.removeItem('moltap-custombg');
        this.applyBackground();
        this.notifyChange();
    }

    /** 强制刷新：重新生成种子，回到第一张 */
    refresh() {
        this.generateSeeds();
        localStorage.setItem('moltap-wallpaper-date', new Date().toISOString().slice(0, 10));
        localStorage.setItem('moltap-wallpaper-seeds', JSON.stringify(this.seeds));
        localStorage.setItem('moltap-wallpaper-gallery', this.currentGallery);
        this.currentBgIndex = 0;
        localStorage.setItem('moltap-bgindex', '0');
        this.customBgUrl = '';
        localStorage.removeItem('moltap-custombg');
        this.applyBackground();
        this.notifyChange();
    }

    isPinned() {
        return localStorage.getItem('moltap-wallpaper-pinned') === 'true';
    }

    /** 固定当前壁纸状态（索引、图库、种子、自定义URL），停止自动切换 */
    pinCurrent() {
        localStorage.setItem('moltap-wallpaper-pinned', 'true');
        localStorage.setItem('moltap-wallpaper-pinned-index', this.currentBgIndex);
        localStorage.setItem('moltap-wallpaper-pinned-gallery', this.currentGallery);
        localStorage.setItem('moltap-wallpaper-pinned-seeds', JSON.stringify(this.seeds));
        localStorage.setItem('moltap-wallpaper-pinned-custom', this.customBgUrl);
    }

    /** 取消固定，恢复正常的每日切换逻辑 */
    unpin() {
        localStorage.removeItem('moltap-wallpaper-pinned');
        localStorage.removeItem('moltap-wallpaper-pinned-index');
        localStorage.removeItem('moltap-wallpaper-pinned-gallery');
        localStorage.removeItem('moltap-wallpaper-pinned-seeds');
        localStorage.removeItem('moltap-wallpaper-pinned-custom');
        this.loadSeeds();
        this.applyBackground();
        this.notifyChange();
    }

    /** 从localStorage恢复固定的壁纸状态 */
    restorePinned() {
        try {
            this.currentBgIndex = parseInt(localStorage.getItem('moltap-wallpaper-pinned-index') || '0', 10) || 0;
            this.currentGallery = localStorage.getItem('moltap-wallpaper-pinned-gallery') || this.currentGallery;
            this.seeds = JSON.parse(localStorage.getItem('moltap-wallpaper-pinned-seeds') || '[]');
            this.customBgUrl = localStorage.getItem('moltap-wallpaper-pinned-custom') || '';
        } catch {}
    }

    getCurrentUrl() {
        if (this.customBgUrl) return this.customBgUrl;
        const item = this.seeds[this.currentBgIndex];
        return item ? this.getFullUrl(item) : '';
    }
}
