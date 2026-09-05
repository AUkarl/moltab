/**
 * GreetingManager - 根据当前时间段显示对应的问候语
 * 每 60 秒自动刷新，支持 6 个时段：凌晨/早/上午/中午/下午/晚上
 */
export class GreetingManager {
    constructor() {
        this.el = document.getElementById('greetingText');
    }

    /** 根据小时返回对应问候语，共 6 个时段 */
    getGreeting() {
        const h = new Date().getHours();
        if (h >= 5 && h < 8) return '早上好';
        if (h >= 8 && h < 12) return '上午好';
        if (h >= 12 && h < 14) return '中午好';
        if (h >= 14 && h < 18) return '下午好';
        if (h >= 18 && h < 22) return '晚上好';
        return '夜深了'; // 22:00 ~ 05:00
    }

    update() {
        if (this.el) this.el.textContent = this.getGreeting();
    }

    /** 立即更新一次，之后每分钟刷新 */
    start() {
        this.update();
        setInterval(() => this.update(), 60000);
    }
}
