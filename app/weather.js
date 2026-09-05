/**
 * WeatherManager - 天气显示管理
 * 使用 Open-Meteo API 获取天气，支持自动定位（GPS→IP多源回退）和手动设置城市
 * 每 15 分钟自动刷新，点击天气组件可手动刷新
 */
export class WeatherManager {
    constructor() {
        // 定位模式：auto（自动）或 manual（手动）
        this.mode = localStorage.getItem('moltap-weather-mode') || 'auto';
        // 手动模式下的城市配置
        this.manualCity = localStorage.getItem('moltap-manual-city') || '';
        this.manualLat = parseFloat(localStorage.getItem('moltap-manual-lat')) || null;
        this.manualLon = parseFloat(localStorage.getItem('moltap-manual-lon')) || null;
        this.widget = document.getElementById('weatherWidget');
        this.iconEl = document.getElementById('weatherIcon');
        this.cityEl = document.getElementById('weatherCity');
        this.tempEl = document.getElementById('weatherTemp');
        this.descEl = document.getElementById('weatherDesc');
    }

    init() {
        // 点击天气组件刷新数据
        this.widget.addEventListener('click', () => { this.fetch(); showToast('刷新天气中...'); });
        // 延迟 300ms 后首次获取，之后每 15 分钟刷新
        setTimeout(() => { this.fetch(); setInterval(() => this.fetch(), 15 * 60 * 1000); }, 300);
    }

    /**
     * 获取当前位置，回退链：GPS → ipapi.co → ip.sb → ipinfo.io → 默认北京
     * 定位结果缓存到当天（同一天不重复定位）
     */
    async getLocation() {
        const today = new Date().toDateString();
        // 当天已定位过，直接读取缓存
        if (localStorage.getItem('moltap-location-date') === today) {
            const c = localStorage.getItem('moltap-city'), lat = localStorage.getItem('moltap-lat'), lon = localStorage.getItem('moltap-lon');
            if (c && lat && lon) return { city: c, lat: +lat, lon: +lon };
        }
        // 尝试 GPS 定位（4秒超时）
        const tryGPS = () => new Promise(resolve => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
                pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                () => resolve(null),
                { timeout: 4000, maximumAge: 600000 }
            );
        });
        // IP 定位服务列表（按优先级排列）
        const ipServices = [
            async () => { const r = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) }); const d = await r.json(); return { city: d.city || '北京', lat: d.latitude || 39.9, lon: d.longitude || 116.4 }; },
            async () => { const r = await fetch('https://api.ip.sb/geoip', { signal: AbortSignal.timeout(3000) }); const d = await r.json(); return { city: d.city || '北京', lat: d.latitude || 39.9, lon: d.longitude || 116.4 }; },
            async () => { const r = await fetch('https://ipinfo.io/json?token=8c3e4f0c3f1b3d', { signal: AbortSignal.timeout(3000) }); const d = await r.json(); const loc = d.loc?.split(','); return { city: d.city || '北京', lat: loc ? parseFloat(loc[0]) : 39.9, lon: loc ? parseFloat(loc[1]) : 116.4 }; }
        ];
        // 优先尝试 GPS + 反向地理编码获取城市名
        const gpsPos = await tryGPS();
        if (gpsPos) {
            try {
                const resp = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${gpsPos.lat}&longitude=${gpsPos.lon}&localityLanguage=zh`);
                const data = await resp.json();
                const city = data.city || data.locality || data.principalSubdivision || '未知城市';
                const result = { city, lat: gpsPos.lat, lon: gpsPos.lon };
                localStorage.setItem('moltap-city', result.city); localStorage.setItem('moltap-lat', result.lat); localStorage.setItem('moltap-lon', result.lon); localStorage.setItem('moltap-location-date', today);
                return result;
            } catch (e) {}
        }
        // GPS 失败，依次尝试 IP 定位服务
        for (let fn of ipServices) {
            try {
                const res = await fn();
                localStorage.setItem('moltap-city', res.city); localStorage.setItem('moltap-lat', res.lat); localStorage.setItem('moltap-lon', res.lon); localStorage.setItem('moltap-location-date', today);
                return res;
            } catch (e) {}
        }
        // 全部失败，默认北京
        const def = { city: '北京', lat: 39.9, lon: 116.4 };
        localStorage.setItem('moltap-city', def.city); localStorage.setItem('moltap-lat', def.lat); localStorage.setItem('moltap-lon', def.lon); localStorage.setItem('moltap-location-date', today);
        return def;
    }

    /** 获取天气数据并更新 UI */
    async fetch() {
        try {
            let lat, lon, city;
            if (this.mode === 'manual' && this.manualLat && this.manualLon && this.manualCity) { lat = this.manualLat; lon = this.manualLon; city = this.manualCity; }
            else { const loc = await this.getLocation(); lat = loc.lat; lon = loc.lon; city = loc.city; }
            const resp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
            const data = await resp.json();
            if (data?.current_weather) {
                const w = data.current_weather;
                // WMO 天气代码 → 图标/描述映射
                const codeMap = { 0: '☀️', 1: '⛅', 2: '⛅', 3: '⛅', 45: '🌫️', 48: '🌫️', 51: '🌧️', 53: '🌧️', 55: '🌧️', 61: '🌧️', 63: '🌧️', 65: '🌧️', 71: '❄️', 73: '❄️', 75: '❄️', 80: '🌧️', 81: '🌧️', 82: '🌧️', 95: '⛈️', 96: '⛈️', 99: '⛈️' };
                const descMap = { 0: '晴', 1: '多云', 2: '多云', 3: '多云', 45: '雾', 48: '雾', 51: '小雨', 53: '小雨', 55: '小雨', 61: '雨', 63: '雨', 65: '雨', 71: '雪', 73: '雪', 75: '雪', 80: '阵雨', 81: '阵雨', 82: '阵雨', 95: '雷暴', 96: '雷暴', 99: '雷暴' };
                this.iconEl.textContent = codeMap[w.weathercode] || '🌤️';
                this.cityEl.textContent = city;
                this.tempEl.textContent = `${Math.round(w.temperature)}°`;
                this.descEl.textContent = descMap[w.weathercode] || '未知';
            }
        } catch (e) {}
    }
}

/** 显示临时 Toast 提示，2.2秒后自动消失 */
function showToast(msg) { const old = document.querySelector('.toast'); if (old) old.remove(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
