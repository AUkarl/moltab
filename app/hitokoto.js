/**
 * HitokotoManager - 一言（随机句子）管理
 * 支持三种来源：API（hitokoto.cn）、自定义文本、关闭
 * 每小时自动刷新一次，可通过设置面板切换来源
 */
export class HitokotoManager {
    constructor() {
        // 从 localStorage 读取用户配置，默认开启 API 模式
        this.enabled = localStorage.getItem('moltap-hitokoto-enabled') !== 'false';
        this.sourceType = localStorage.getItem('moltap-hitokoto-source') || 'api';
        this.custom = localStorage.getItem('moltap-hitokoto-custom') || '';
        this.container = document.getElementById('hitokotoContainer');
        this.textEl = document.getElementById('hitokotoText');
        this.sourceEl = document.getElementById('hitokotoSource');
    }

    init() {
        this.updateVisibility();
        // 延迟 400ms 后首次获取，之后每小时刷新
        setTimeout(() => { this.fetch(); setInterval(() => this.fetch(), 3600 * 1000); }, 400);
    }

    /** 根据开关状态控制容器显隐 */
    updateVisibility() { this.container.style.display = this.enabled ? '' : 'none'; }

    /** 获取并显示一言内容，自定义模式直接使用用户文本 */
    async fetch() {
        this.updateVisibility();
        if (!this.enabled) return;
        if (this.sourceType === 'custom' && this.custom) {
            this.textEl.textContent = this.custom;
            this.sourceEl.textContent = '—— 自定义';
            return;
        }
        try {
            const r = await fetch('https://v1.hitokoto.cn/?encode=json', { signal: AbortSignal.timeout(3000) });
            const d = await r.json();
            if (d?.hitokoto) {
                this.textEl.textContent = d.hitokoto;
                this.sourceEl.textContent = `—— ${d.from || '佚名'}`;
            }
        } catch (e) {}
    }

    /** 切换一言显示/隐藏 */
    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('moltap-hitokoto-enabled', this.enabled);
        this.fetch();
    }

    /** 设置来源类型（api/custom）和自定义文本 */
    setSource(type, text) {
        this.sourceType = type;
        localStorage.setItem('moltap-hitokoto-source', type);
        if (type === 'custom' && text !== undefined) {
            this.custom = text;
            localStorage.setItem('moltap-hitokoto-custom', text);
        }
        this.fetch();
    }
}
