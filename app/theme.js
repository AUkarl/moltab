/**
 * 局部亮度适配器
 * 将背景图缩小到100px宽绘制到canvas上，然后对每个带 data-local-adapt 属性的元素
 * 采样其覆盖区域的像素亮度，自动切换文字颜色（深色背景→浅色文字，反之亦然）
 * 夜间模式下将采样亮度乘以0.45，强制按深色背景处理
 */
class LocalBrightness {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.imgWidth = 0;
        this.imgHeight = 0;
        this.imageLoaded = false;
        this.currentUrl = '';
        this.nightMode = false;
        this._resizeTimer = null;
        this._observer = null;
        window.addEventListener('resize', () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => this.update(), 200);
        });
    }

    /** 监听DOM变化（弹窗打开/关闭等），延迟重新采样 */
    initObserver() {
        this._observer = new MutationObserver(() => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => this.update(), 50);
        });
        this._observer.observe(document.body, { childList: true, subtree: true });
    }

    /**
     * 加载背景图到canvas
     * 缩放到宽100px等比高度，用于后续像素采样
     * 相同URL会跳过重复加载
     */
    async loadImage(url) {
        if (this.currentUrl === url && this.imageLoaded) return;
        this.currentUrl = url;
        this.imageLoaded = false;
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const w = 100;
                    const h = Math.round(100 * img.naturalHeight / img.naturalWidth);
                    this.canvas.width = w;
                    this.canvas.height = h;
                    this.ctx.drawImage(img, 0, 0, w, h);
                    this.imgWidth = w;
                    this.imgHeight = h;
                    this.ctx.getImageData(0, 0, 1, 1);
                    this.imageLoaded = true;
                    resolve(true);
                } catch {
                    this.imageLoaded = false;
                    resolve(false);
                }
            };
            img.onerror = () => {
                this.imageLoaded = false;
                resolve(false);
            };
            img.src = url;
        });
    }

    /** 计算背景图以cover模式铺满视口时的绘制矩形 */
    _getCoverRect(vw, vh) {
        const imgAspect = this.imgWidth / this.imgHeight;
        const vpAspect = vw / vh;
        let drawW, drawH;
        if (imgAspect > vpAspect) {
            drawH = vh;
            drawW = vh * imgAspect;
        } else {
            drawW = vw;
            drawH = vw / imgAspect;
        }
        return { x: (vw - drawW) / 2, y: (vh - drawH) / 2, w: drawW, h: drawH };
    }

    /** 采样单个像素的亮度（ITU-R BT.601加权） */
    _sampleAt(clientX, clientY, vw, vh) {
        const rect = this._getCoverRect(vw, vh);
        const px = (clientX - rect.x) / rect.w * this.imgWidth;
        const py = (clientY - rect.y) / rect.h * this.imgHeight;
        const ix = Math.max(0, Math.min(Math.floor(px), this.imgWidth - 1));
        const iy = Math.max(0, Math.min(Math.floor(py), this.imgHeight - 1));
        const data = this.ctx.getImageData(ix, iy, 1, 1).data;
        return data[0] * 0.299 + data[1] * 0.587 + data[2] * 0.114;
    }

    /** 采样区域的平均亮度，每40个像素取一次样以提高性能 */
    _sampleArea(left, top, width, height, vw, vh) {
        const rect = this._getCoverRect(vw, vh);
        const x1 = Math.max(0, Math.floor((left - rect.x) / rect.w * this.imgWidth));
        const y1 = Math.max(0, Math.floor((top - rect.y) / rect.h * this.imgHeight));
        const x2 = Math.min(this.imgWidth - 1, Math.ceil((left + width - rect.x) / rect.w * this.imgWidth));
        const y2 = Math.min(this.imgHeight - 1, Math.ceil((top + height - rect.y) / rect.h * this.imgHeight));
        const w = x2 - x1 + 1;
        const h = y2 - y1 + 1;
        if (w <= 0 || h <= 0) return 128;
        const data = this.ctx.getImageData(x1, y1, w, h).data;
        let total = 0, count = 0;
        for (let i = 0; i < data.length; i += 40) {
            total += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            count++;
        }
        return count > 0 ? total / count : 128;
    }

    setNightMode(on) {
        this.nightMode = on;
        this.update();
    }

    /** 核心方法：对所有 [data-local-adapt] 元素采样并设置CSS变量 */
    async update() {
        const bgStyle = document.body.style.backgroundImage;
        const match = bgStyle.match(/url\(["']?(.+?)["']?\)/);
        if (!match) {
            this._applyFallback();
            return;
        }
        const url = match[1];
        const loaded = await this.loadImage(url);
        if (!loaded || !this.imageLoaded) {
            this._applyFallback();
            return;
        }
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const elements = document.querySelectorAll('[data-local-adapt]');
        elements.forEach(el => {
            const r = el.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            let brightness;
            if (r.width > 100 || r.height > 60) {
                brightness = this._sampleArea(r.left, r.top, r.width, r.height, vw, vh);
            } else {
                brightness = this._sampleAt(cx, cy, vw, vh);
            }
            if (this.nightMode) brightness *= 0.45;
            this._applyToElement(el, brightness);
        });
    }

    /** 根据亮度设置元素的文字颜色、次要颜色、阴影CSS变量 */
    _applyToElement(el, brightness) {
        if (brightness < 128) {
            el.style.setProperty('--adapt-color', '#f0f0f5');
            el.style.setProperty('--adapt-secondary', '#c8c8d0');
            el.style.setProperty('--adapt-shadow', '0 2px 12px rgba(0,0,0,0.4)');
        } else {
            el.style.setProperty('--adapt-color', '#1d1d1f');
            el.style.setProperty('--adapt-secondary', '#4a4a52');
            el.style.setProperty('--adapt-shadow', '0 2px 12px rgba(255,255,255,0.3)');
        }
    }

    /** 无法获取背景图时，根据当前主题模式设置默认颜色 */
    _applyFallback() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const color = isDark ? '#f0f0f5' : '#1d1d1f';
        const secondary = isDark ? '#c8c8d0' : '#4a4a52';
        const shadow = isDark ? '0 2px 12px rgba(0,0,0,0.3)' : '0 2px 12px rgba(255,255,255,0.3)';
        document.querySelectorAll('[data-local-adapt]').forEach(el => {
            el.style.setProperty('--adapt-color', color);
            el.style.setProperty('--adapt-secondary', secondary);
            el.style.setProperty('--adapt-shadow', shadow);
        });
    }
}

/**
 * 主题管理器
 * 支持浅色/深色/跟随系统三种模式
 * 集成 LocalBrightness 实现元素级文字智能反色
 * 夜间模式叠加层可降低整体亮度
 */
export class ThemeManager {
    constructor() {
        this.mode = localStorage.getItem('moltap-theme') || 'auto';
        this.nightOverride = false;
        this.localBrightness = new LocalBrightness();
    }

    init() {
        this.apply();
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener('change', () => {
            if (this.mode === 'auto') this.apply();
        });
        this.localBrightness.initObserver();
    }

    /** 获取实际生效的主题（auto模式下根据系统偏好返回light/dark） */
    getEffective() {
        if (this.mode === 'auto') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return this.mode;
    }

    /** 应用主题到html元素并更新亮度采样 */
    apply() {
        document.documentElement.setAttribute('data-theme', this.getEffective());
        this.updateNightMode();
    }

    setMode(mode) {
        this.mode = mode;
        localStorage.setItem('moltap-theme', mode);
        this.apply();
    }

    setNightOverride(on) {
        this.nightOverride = on;
        this.updateNightMode();
    }

    /** 夜间模式：切换overlay样式类并通知亮度采样器 */
    updateNightMode() {
        const overlay = document.getElementById('bgOverlay');
        if (!overlay) return;
        if (this.nightOverride) {
            overlay.classList.add('night-mode');
            this.localBrightness.setNightMode(true);
        } else {
            overlay.classList.remove('night-mode');
            this.localBrightness.setNightMode(false);
            this.localBrightness.update();
        }
    }
}
