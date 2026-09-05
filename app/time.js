import { solarToLunar } from './lunar.js';

/**
 * TimeManager - 时钟与日期显示管理
 * 支持网络校时（WorldTimeAPI），每秒刷新时钟，显示公历日期+星期+农历
 */
export class TimeManager {
    constructor() {
        this.offset = 0; // 本地时间与网络时间的差值（毫秒）
        this.el = document.getElementById('timeDisplay');
        this.dateEl = document.getElementById('dateDisplay');
    }

    /** 从 WorldTimeAPI 获取准确时间，计算与本地时钟的偏移量 */
    async syncTime() {
        try {
            const r = await fetch('https://worldtimeapi.org/api/timezone/Asia/Shanghai', { signal: AbortSignal.timeout(3000) });
            const d = await r.json();
            if (d?.unixtime) this.offset = d.unixtime * 1000 - Date.now();
        } catch (e) {}
    }

    /** 更新时钟和日期显示，使用偏移量校正后的时间 */
    update() {
        const now = new Date(Date.now() + this.offset);
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        this.el.textContent = `${h}:${m}:${s}`;

        // 日期行：月日 + 星期 + 农历
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const weekDay = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
        const lunar = solarToLunar(now.getFullYear(), month, day);
        this.dateEl.innerHTML = `<span>${month}月${day}日 星期${weekDay} · ${lunar}</span>`;
    }

    /** 启动时钟：立即更新，每秒刷新，500ms 后执行网络校时 */
    start() {
        this.update();
        setInterval(() => this.update(), 1000);
        setTimeout(() => this.syncTime(), 500);
    }
}
