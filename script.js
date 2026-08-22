(function() {
    const ENGINE_URLS = { baidu:'https://www.baidu.com/s?wd=', bing:'https://www.bing.com/search?q=', google:'https://www.google.com/search?q=', duckduckgo:'https://duckduckgo.com/?q=', yandex:'https://yandex.com/search/?text=', sogou:'https://www.sogou.com/web?query=', '360':'https://www.so.com/s?q=' };
    const ENGINE_NAMES = { baidu:'百度', bing:'必应', google:'谷歌', duckduckgo:'DuckDuckGo', yandex:'Yandex', sogou:'搜狗', '360':'360搜索' };
    const $ = id => document.getElementById(id);
    let currentEngine = localStorage.getItem('moltap-engine') || 'baidu';
    let timeOffset = 0, bookmarks = [], wallpaperSeeds = [], currentBgIndex = 0;
    let nightMode = localStorage.getItem('moltap-nightmode') === 'true', darkTheme = localStorage.getItem('moltap-darktheme') === 'true';
    let autoTheme = localStorage.getItem('moltap-auto-theme') !== 'false';
    let customBgUrl = localStorage.getItem('moltap-custombg') || '';
    let hitokotoCustom = localStorage.getItem('moltap-hitokoto-custom') || '', hitokotoSourceType = localStorage.getItem('moltap-hitokoto-source') || 'api', hitokotoEnabled = localStorage.getItem('moltap-hitokoto-enabled') !== 'false';
    let weatherMode = localStorage.getItem('moltap-weather-mode') || 'auto', manualCity = localStorage.getItem('moltap-manual-city') || '', manualLat = parseFloat(localStorage.getItem('moltap-manual-lat')) || null, manualLon = parseFloat(localStorage.getItem('moltap-manual-lon')) || null;
    let editingBookmarkId = null, longPressTimer;

    function fetchWithTimeout(url, options = {}, timeout = 3000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
    }

    function applyTheme(forceDark) {
        const isDark = forceDark !== undefined ? forceDark : darkTheme;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
        darkTheme = isDark;
        localStorage.setItem('moltap-darktheme', isDark);
        $('bgOverlay').classList.toggle('night-mode', nightMode);
    }

    function initWallpapers() {
        const today = new Date().toISOString().slice(0,10);
        if(localStorage.getItem('moltap-wallpaper-date') !== today) {
            wallpaperSeeds = Array.from({length:20}, (_,i) => `${today}-${i+1}`);
            localStorage.setItem('moltap-wallpaper-date', today);
            localStorage.setItem('moltap-wallpaper-seeds', JSON.stringify(wallpaperSeeds));
            currentBgIndex = 0;
            localStorage.setItem('moltap-bgindex', '0');
        } else {
            try { wallpaperSeeds = JSON.parse(localStorage.getItem('moltap-wallpaper-seeds') || '[]'); } catch { wallpaperSeeds = []; }
            if(!wallpaperSeeds.length) wallpaperSeeds = Array.from({length:20}, (_,i) => `${today}-${i+1}`);
            currentBgIndex = parseInt(localStorage.getItem('moltap-bgindex') || '0', 10) || 0;
        }
    }

    function updateBgImage() {
        if(customBgUrl) document.body.style.backgroundImage = `url(${customBgUrl})`;
        else if(wallpaperSeeds[currentBgIndex]) document.body.style.backgroundImage = `url(https://picsum.photos/seed/${wallpaperSeeds[currentBgIndex]}/1920/1080)`;
        else document.body.style.backgroundImage = 'linear-gradient(135deg, #e8ecf1, #c3d0dc)';
        if(autoTheme) setTimeout(detectBrightness, 0);
    }

    function refreshWallpaperLibrary() {
        const ts = Date.now();
        wallpaperSeeds = Array.from({length:20}, (_,i) => `moltap-${ts}-${i}`);
        localStorage.setItem('moltap-wallpaper-date', new Date().toISOString().slice(0,10));
        localStorage.setItem('moltap-wallpaper-seeds', JSON.stringify(wallpaperSeeds));
        currentBgIndex = 0; localStorage.setItem('moltap-bgindex', '0');
        customBgUrl = ''; localStorage.removeItem('moltap-custombg');
        updateBgImage();
        if(!$('modalOverlay').classList.contains('hidden')) renderModalContent(document.querySelector('.modal-tab.active')?.dataset.tab || 'bg');
        showToast('壁纸库已刷新');
    }

    function setBgImage(i) { customBgUrl = ''; localStorage.removeItem('moltap-custombg'); currentBgIndex = i; localStorage.setItem('moltap-bgindex', i); updateBgImage(); }
    function setCustomBg(url) { customBgUrl = url; localStorage.setItem('moltap-custombg', url); updateBgImage(); showToast('自定义背景已设置'); }

    async function detectBrightness() {
        if(!autoTheme) return;
        try {
            const url = customBgUrl || (wallpaperSeeds[currentBgIndex] ? `https://picsum.photos/seed/${wallpaperSeeds[currentBgIndex]}/1920/1080` : null);
            if(!url) { applyTheme(false); return; }
            const img = new Image(); img.crossOrigin = 'anonymous';
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; setTimeout(rej, 3000); });
            const c = document.createElement('canvas'); c.width = c.height = 1; const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, 1, 1);
            const [r,g,b] = ctx.getImageData(0,0,1,1).data;
            const brightness = (0.2126*r + 0.7152*g + 0.0722*b);
            applyTheme(brightness < 128);
        } catch { applyTheme(darkTheme); }
    }

    function updateTimeDisplay() {
        const now = new Date(Date.now() + timeOffset);
        $('timeDisplay').textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
        const m = now.getMonth() + 1, d = now.getDate();
        const lunar = solarToLunar(now.getFullYear(), m, d);
        // 使用 textContent 避免 innerHTML 警告（此处为纯文本）
        $('dateDisplay').textContent = `${m}月${d}日 星期${['日','一','二','三','四','五','六'][now.getDay()]} · ${lunar}`;
    }

    const lunarInfo = [0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a4d0,0x0d150,0x0f252,0x0d520];
    const lunarMonths = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
    const lunarDays = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
    function getLunarYearInfo(y) { return lunarInfo[y-1900]||0x04bd8 }
    function solarToLunar(y,m,d) {
        const base = new Date(1900,0,31), target = new Date(y,m-1,d);
        let offset = Math.round((target - base) / 86400000), ly, lm, ld, isLeap = false;
        for(ly = 1900; ly < 2101 && offset > 0; ly++) { const days = getLunarYearDays(ly); if(offset < days) break; offset -= days }
        const leapMonth = getLunarLeapMonth(ly);
        for(lm = 1; lm < 13 && offset > 0; lm++) {
            let mDays;
            if(leapMonth > 0 && lm === leapMonth + 1 && !isLeap) { lm--; isLeap = true; mDays = (getLunarYearInfo(ly) & 0x10000) ? 30 : 29 }
            else { mDays = getLunarMonthDays(ly, lm) }
            if(isLeap && lm === leapMonth + 1) isLeap = false;
            if(offset < mDays) break; offset -= mDays
        }
        ld = offset + 1;
        const prefix = isLeap ? '闰' : '';
        return `${prefix}${lunarMonths[lm-1]||'腊'}月${lunarDays[Math.min(ld-1,29)]||'三十'}`;
    }
    function getLunarYearDays(y) { let s = 348; for(let i=0x8000; i>0x8; i>>=1) s += (getLunarYearInfo(y) & i) ? 1 : 0; const leap = getLunarLeapMonth(y); if(leap) s += (getLunarYearInfo(y) & 0x10000) ? 30 : 29; return s }
    function getLunarLeapMonth(y) { return getLunarYearInfo(y) & 0xf }
    function getLunarMonthDays(y,m) { return (getLunarYearInfo(y) & (0x10000 >> m)) ? 30 : 29 }

    async function getLocation() {
        const today = new Date().toDateString();
        if(localStorage.getItem('moltap-location-date') === today) {
            const c = localStorage.getItem('moltap-city'), lat = localStorage.getItem('moltap-lat'), lon = localStorage.getItem('moltap-lon');
            if(c && lat && lon) return { city: c, lat: +lat, lon: +lon };
        }
        const tryGPS = () => new Promise(resolve => {
            if(!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }), () => resolve(null), { timeout: 4000, maximumAge: 600000 });
        });
        const ipServices = [
            async () => { const r = await fetchWithTimeout('https://ipapi.co/json/'); const d = await r.json(); return { city: d.city || '北京', lat: d.latitude || 39.9, lon: d.longitude || 116.4 }; },
            async () => { const r = await fetchWithTimeout('https://api.ip.sb/geoip'); const d = await r.json(); return { city: d.city || '北京', lat: d.latitude || 39.9, lon: d.longitude || 116.4 }; },
            async () => { const r = await fetchWithTimeout('https://ipinfo.io/json?token=8c3e4f0c3f1b3d'); const d = await r.json(); const loc = d.loc?.split(','); return { city: d.city || '北京', lat: loc? parseFloat(loc[0]) : 39.9, lon: loc? parseFloat(loc[1]) : 116.4 }; }
        ];
        const gpsPos = await tryGPS();
        if(gpsPos) {
            try {
                const resp = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?latitude=${gpsPos.lat}&longitude=${gpsPos.lon}&count=1&language=zh`);
                const data = await resp.json();
                const city = data.results?.[0]?.name || '未知城市';
                const result = { city, lat: gpsPos.lat, lon: gpsPos.lon };
                localStorage.setItem('moltap-city', result.city); localStorage.setItem('moltap-lat', result.lat); localStorage.setItem('moltap-lon', result.lon); localStorage.setItem('moltap-location-date', today);
                return result;
            } catch(e) {}
        }
        for(let fn of ipServices) {
            try {
                const res = await fn();
                localStorage.setItem('moltap-city', res.city); localStorage.setItem('moltap-lat', res.lat); localStorage.setItem('moltap-lon', res.lon); localStorage.setItem('moltap-location-date', today);
                return res;
            } catch(e) {}
        }
        const def = { city: '北京', lat: 39.9, lon: 116.4 };
        localStorage.setItem('moltap-city', def.city); localStorage.setItem('moltap-lat', def.lat); localStorage.setItem('moltap-lon', def.lon); localStorage.setItem('moltap-location-date', today);
        return def;
    }

    async function fetchWeather() {
        try {
            let lat, lon, city;
            if(weatherMode === 'manual' && manualLat && manualLon && manualCity) { lat = manualLat; lon = manualLon; city = manualCity; }
            else { const loc = await getLocation(); lat = loc.lat; lon = loc.lon; city = loc.city; }
            const resp = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`, {}, 5000);
            const data = await resp.json();
            if(data?.current_weather) {
                const w = data.current_weather;
                $('weatherIcon').textContent = {0:'☀️',1:'⛅',2:'⛅',3:'⛅',45:'🌫️',48:'🌫️',51:'🌧️',53:'🌧️',55:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',71:'❄️',73:'❄️',75:'❄️',80:'🌧️',81:'🌧️',82:'🌧️',95:'⛈️',96:'⛈️',99:'⛈️'}[w.weathercode]||'🌤️';
                $('weatherCity').textContent = city;
                $('weatherTemp').textContent = `${Math.round(w.temperature)}°`;
                $('weatherDesc').textContent = {0:'晴',1:'多云',2:'多云',3:'多云',45:'雾',48:'雾',51:'小雨',53:'小雨',55:'小雨',61:'雨',63:'雨',65:'雨',71:'雪',73:'雪',75:'雪',80:'阵雨',81:'阵雨',82:'阵雨',95:'雷暴',96:'雷暴',99:'雷暴'}[w.weathercode]||'未知';
            }
        } catch(e) {}
    }

    function setEngine(e) {
        currentEngine = e; localStorage.setItem('moltap-engine', e);
        $('engineBtnText').textContent = ENGINE_NAMES[e];
        document.querySelectorAll('.engine-option').forEach(o => o.classList.toggle('selected', o.dataset.engine === e));
        $('searchInput').placeholder = `在 ${ENGINE_NAMES[e]} 中搜索...`;
        closeEngineDropdown();
    }
    function performSearch(q) { if(q = q.trim()) window.open((ENGINE_URLS[currentEngine] || ENGINE_URLS.baidu) + encodeURIComponent(q), '_self'); }
    function toggleEngineDropdown() { $('engineDropdown').classList.toggle('active'); $('engineArrow').classList.toggle('open'); }
    function closeEngineDropdown() { $('engineDropdown').classList.remove('active'); $('engineArrow').classList.remove('open'); }

    function loadBookmarks() {
        try { bookmarks = JSON.parse(localStorage.getItem('moltap-bookmarks') || '[]'); } catch { bookmarks = []; }
        if(!bookmarks.length && !localStorage.getItem('moltap-bookmarks-init')) {
            bookmarks = [
                {id:'b1',name:'DeepSeek',url:'https://chat.deepseek.com/',icon:''},
                {id:'b2',name:'豆包',url:'https://www.doubao.com/',icon:''},
                {id:'b3',name:'ChatGPT',url:'https://chat.openai.com/',icon:''},
                {id:'b4',name:'Z-Library',url:'https://z-lib.org/',icon:''},
                {id:'b5',name:'GitHub',url:'https://github.com',icon:''},
                {id:'b6',name:'知乎',url:'https://www.zhihu.com',icon:''},
                {id:'b7',name:'B站',url:'https://www.bilibili.com',icon:''}
            ];
            saveBookmarks(); localStorage.setItem('moltap-bookmarks-init', '1');
        }
        renderBookmarks();
    }
    function saveBookmarks() { localStorage.setItem('moltap-bookmarks', JSON.stringify(bookmarks)); }

    function renderBookmarks() {
        $('bookmarksContainer').innerHTML = '';
        bookmarks.forEach(bm => {
            const item = document.createElement('a');
            item.className = 'bookmark-item' + (editingBookmarkId === bm.id ? ' editing' : '');
            item.href = bm.url; item.target = '_blank'; item.title = bm.name;
            const iconSrc = bm.icon || `https://api.iowen.cn/favicon/get?url=${encodeURIComponent(bm.url)}`;
            item.innerHTML = `<div class="bm-icon"><img src="${iconSrc}" loading="lazy" onerror="this.style.display='none';this.parentElement.textContent='${bm.name[0].toUpperCase()}';"></div><span class="bm-name">${escapeHtml(bm.name)}</span><button class="bm-delete" data-action="delete">✕</button>`;
            let startX = 0, startY = 0;
            item.addEventListener('pointerdown', e => {
                if(e.target.closest('[data-action="delete"]')) return;
                startX = e.clientX; startY = e.clientY;
                longPressTimer = setTimeout(() => { editingBookmarkId = bm.id; renderBookmarks(); showToast('进入编辑模式，再次点击书签退出'); }, 800);
            });
            item.addEventListener('pointermove', e => {
                if(longPressTimer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) { clearTimeout(longPressTimer); longPressTimer = null; }
            });
            item.addEventListener('pointerup', () => { clearTimeout(longPressTimer); longPressTimer = null; });
            item.addEventListener('pointerleave', () => { clearTimeout(longPressTimer); longPressTimer = null; });
            item.addEventListener('click', e => {
                const deleteBtn = e.target.closest('[data-action="delete"]');
                if(deleteBtn) { e.preventDefault(); e.stopPropagation(); deleteBookmark(bm.id); return; }
                if(editingBookmarkId === bm.id) { e.preventDefault(); editingBookmarkId = null; renderBookmarks(); return; }
                if(editingBookmarkId) { editingBookmarkId = null; renderBookmarks(); }
            });
            $('bookmarksContainer').appendChild(item);
        });
    }
    function deleteBookmark(id) { bookmarks = bookmarks.filter(b => b.id !== id); saveBookmarks(); if(editingBookmarkId === id) editingBookmarkId = null; renderBookmarks(); showToast('书签已删除'); }
    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    function updateHitokotoVisibility() { $('hitokotoContainer').style.display = hitokotoEnabled ? '' : 'none'; }
    async function fetchHitokoto() {
        updateHitokotoVisibility();
        if(!hitokotoEnabled) return;
        if(hitokotoSourceType === 'custom' && hitokotoCustom) {
            $('hitokotoText').textContent = hitokotoCustom;
            $('hitokotoSource').textContent = '—— 自定义';
            return;
        }
        try {
            const r = await fetchWithTimeout('https://v1.hitokoto.cn/?encode=json');
            const d = await r.json();
            if(d?.hitokoto) {
                $('hitokotoText').textContent = d.hitokoto;
                $('hitokotoSource').textContent = `—— ${d.from || '佚名'}`;
            }
        } catch(e) {}
    }
    function setHitokotoSource(type, text) {
        hitokotoSourceType = type; localStorage.setItem('moltap-hitokoto-source', type);
        if(type === 'custom' && text !== undefined) { hitokotoCustom = text; localStorage.setItem('moltap-hitokoto-custom', text); }
        fetchHitokoto();
    }
    function toggleHitokoto() { hitokotoEnabled = !hitokotoEnabled; localStorage.setItem('moltap-hitokoto-enabled', hitokotoEnabled); fetchHitokoto(); showToast(hitokotoEnabled ? '一言已开启' : '一言已关闭'); }

    function openSettings(tab = 'bg') { $('modalOverlay').classList.remove('hidden'); document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab)); renderModalContent(tab); }
    function closeSettings() { $('modalOverlay').classList.add('hidden'); editingBookmarkId = null; renderBookmarks(); }

    function renderModalContent(tab) {
        switch(tab) {
            case 'bg': renderBgSettings(); break;
            case 'weather': renderWeatherSettings(); break;
            case 'bookmarks': renderBookmarkSettings(); break;
            case 'hitokoto': renderHitokotoSettings(); break;
            case 'export': renderExportSettings(); break;
            case 'about': renderAboutSettings(); break;
        }
    }

    function renderBgSettings() {
        let html = '<div class="section-title">主题设置</div>';
        html += `<div class="setting-row"><span class="setting-label">深色主题</span><div class="toggle-switch ${darkTheme?'on':''}" id="toggleDarkTheme"></div></div>`;
        html += `<div class="setting-row"><span class="setting-label">夜间模式</span><div class="toggle-switch ${nightMode?'on':''}" id="toggleNightMode"></div></div>`;
        html += `<div class="section-title">壁纸库 <button class="btn-sm primary" id="refreshWallpaperLibBtn">刷新壁纸库</button></div><div class="bg-preview-grid" id="bgPreviewGrid">`;
        wallpaperSeeds.forEach((s,i) => html += `<div class="bg-preview-item ${i===currentBgIndex&&!customBgUrl?'active':''}" data-index="${i}" style="background-image:url(https://picsum.photos/seed/${s}/320/180)">${i===currentBgIndex&&!customBgUrl?'<div class="check-mark">✓</div>':''}</div>`);
        html += `</div><div class="section-title">自定义背景</div><div class="setting-row"><input class="input-sm" id="customBgInput" value="${escapeHtml(customBgUrl)}"><button class="btn-sm" id="applyCustomBgBtn">应用</button><button class="btn-sm danger" id="clearCustomBgBtn">清除</button></div>`;
        $('modalBody').innerHTML = html;
        $('toggleDarkTheme').addEventListener('click', () => { darkTheme = !darkTheme; autoTheme = false; localStorage.setItem('moltap-auto-theme', false); applyTheme(darkTheme); $('toggleDarkTheme').classList.toggle('on', darkTheme); });
        $('toggleNightMode').addEventListener('click', () => { nightMode = !nightMode; localStorage.setItem('moltap-nightmode', nightMode); applyTheme(darkTheme); $('toggleNightMode').classList.toggle('on', nightMode); });
        $('refreshWallpaperLibBtn').addEventListener('click', refreshWallpaperLibrary);
        $('applyCustomBgBtn').addEventListener('click', () => setCustomBg($('customBgInput').value.trim()));
        $('clearCustomBgBtn').addEventListener('click', () => { customBgUrl = ''; localStorage.removeItem('moltap-custombg'); updateBgImage(); renderBgSettings(); showToast('已恢复壁纸'); });
        document.querySelectorAll('#bgPreviewGrid .bg-preview-item').forEach(el => el.addEventListener('click', () => { setBgImage(parseInt(el.dataset.index)); renderBgSettings(); }));
    }

    function renderWeatherSettings() {
        let html = '<div class="section-title">天气设置</div>';
        html += `<div class="setting-row"><span class="setting-label">定位方式</span><select class="input-sm" id="weatherModeSelect"><option value="auto" ${weatherMode==='auto'?'selected':''}>自动获取 (GPS)</option><option value="manual" ${weatherMode==='manual'?'selected':''}>手动设置</option></select></div>`;
        html += `<div id="manualPanel" style="display:${weatherMode==='manual'?'flex':'none'};flex-direction:column;gap:8px;"><input class="input-sm" id="manualCityInput" placeholder="城市名称" value="${escapeHtml(manualCity)}"><button class="btn-sm primary" id="fetchManualWeatherBtn">查询并保存</button></div>`;
        $('modalBody').innerHTML = html;
        $('weatherModeSelect').addEventListener('change', function() {
            weatherMode = this.value; localStorage.setItem('moltap-weather-mode', weatherMode);
            $('manualPanel').style.display = weatherMode==='manual'?'flex':'none';
            if(weatherMode==='auto') { manualCity=''; manualLat=null; manualLon=null; ['city','lat','lon'].forEach(k=>localStorage.removeItem(`moltap-manual-${k}`)); fetchWeather(); showToast('已切换为GPS自动定位'); }
        });
        $('fetchManualWeatherBtn')?.addEventListener('click', async () => {
            const city = $('manualCityInput').value.trim();
            if(!city) return showToast('请输入城市');
            try {
                const r = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`, {}, 4000);
                const d = await r.json();
                if(d.results?.length) {
                    manualCity = d.results[0].name || city; manualLat = d.results[0].latitude; manualLon = d.results[0].longitude;
                    localStorage.setItem('moltap-manual-city', manualCity); localStorage.setItem('moltap-manual-lat', manualLat); localStorage.setItem('moltap-manual-lon', manualLon);
                    fetchWeather(); showToast(`天气位置：${manualCity}`);
                } else showToast('未找到城市');
            } catch(e) { showToast('查询失败'); }
        });
    }

    function renderBookmarkSettings() {
        let html = '<div class="section-title">书签管理</div><p style="font-size:11px;color:var(--text-tertiary);">留空图标URL则自动获取</p>';
        bookmarks.forEach(bm => html += `<div class="bookmark-edit-row"><input value="${escapeHtml(bm.name)}" data-id="${bm.id}" data-field="name"><input value="${escapeHtml(bm.url)}" data-id="${bm.id}" data-field="url"><input value="${escapeHtml(bm.icon||'')}" data-id="${bm.id}" data-field="icon"><button class="btn-sm danger" data-del="${bm.id}">删</button></div>`);
        html += '<button class="btn-sm primary" id="addBmBtn">+ 添加书签</button>';
        $('modalBody').innerHTML = html;
        document.querySelectorAll('input[data-field]').forEach(inp => inp.addEventListener('change', function() { const bm = bookmarks.find(b => b.id === this.dataset.id); if(bm) { bm[this.dataset.field] = this.value.trim(); saveBookmarks(); renderBookmarks(); } }));
        document.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', function() { deleteBookmark(this.dataset.del); renderBookmarkSettings(); }));
        $('addBmBtn')?.addEventListener('click', () => {
            const n = prompt('名称：'); if(!n?.trim()) return;
            const u = prompt('网址：'); if(!u?.trim()) return;
            bookmarks.push({ id:'bm'+Date.now(), name:n.trim(), url:u.trim().startsWith('http')?u.trim():'https://'+u.trim(), icon:'' });
            saveBookmarks(); renderBookmarkSettings(); renderBookmarks();
        });
    }

    function renderHitokotoSettings() {
        let html = '<div class="section-title">一言设置</div>';
        html += `<div class="setting-row"><span class="setting-label">启用一言</span><div class="toggle-switch ${hitokotoEnabled?'on':''}" id="toggleHitokotoBtn"></div></div>`;
        html += `<div class="setting-row"><span class="setting-label">数据来源</span><select class="input-sm" id="hitokotoSourceSelect"><option value="api" ${hitokotoSourceType==='api'?'selected':''}>一言API</option><option value="custom" ${hitokotoSourceType==='custom'?'selected':''}>自定义</option></select></div>`;
        html += `<div class="setting-row"><input class="input-sm" id="hitokotoCustomInput" placeholder="输入自定义一言内容" value="${escapeHtml(hitokotoCustom)}"><button class="btn-sm primary" id="saveHitokotoBtn">保存</button></div>`;
        html += '<button class="btn-sm" id="refreshHitokotoBtn">刷新一言</button>';
        $('modalBody').innerHTML = html;
        $('toggleHitokotoBtn').addEventListener('click', () => { toggleHitokoto(); renderHitokotoSettings(); });
        $('hitokotoSourceSelect').addEventListener('change', function() {
            const isCustom = this.value === 'custom';
            if(isCustom) { hitokotoSourceType = 'custom'; localStorage.setItem('moltap-hitokoto-source', 'custom'); }
            else { hitokotoSourceType = 'api'; localStorage.setItem('moltap-hitokoto-source', 'api'); setHitokotoSource('api'); }
            $('hitokotoCustomInput').disabled = !isCustom;
        });
        $('saveHitokotoBtn').addEventListener('click', () => { setHitokotoSource($('hitokotoSourceSelect').value, $('hitokotoCustomInput').value.trim()); showToast('一言已保存'); });
        $('refreshHitokotoBtn').addEventListener('click', () => { fetchHitokoto(); showToast('已刷新'); });
    }

    function renderExportSettings() {
        $('modalBody').innerHTML = `<div class="section-title">备份与恢复</div><div class="setting-row"><button class="btn-sm primary" id="exportBtn">📥 导出设置</button><label class="btn-sm" style="cursor:pointer;">📤 导入设置<input type="file" id="importFileInput" hidden accept=".json"></label></div>`;
        $('exportBtn').addEventListener('click', () => {
            const keys = ['moltap-engine','moltap-nightmode','moltap-darktheme','moltap-auto-theme','moltap-custombg','moltap-hitokoto-custom','moltap-hitokoto-source','moltap-hitokoto-enabled','moltap-weather-mode','moltap-manual-city','moltap-manual-lat','moltap-manual-lon','moltap-bookmarks','moltap-wallpaper-date','moltap-wallpaper-seeds','moltap-bgindex'];
            const data = {}; keys.forEach(k => { const v = localStorage.getItem(k); if(v !== null) data[k] = v; });
            const blob = new Blob([JSON.stringify(data)], { type:'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `moltap-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
        });
        $('importFileInput').addEventListener('change', e => {
            const file = e.target.files[0]; if(!file) return;
            const reader = new FileReader();
            reader.onload = ev => { try { const data = JSON.parse(ev.target.result); Object.entries(data).forEach(([k,v]) => localStorage.setItem(k,v)); location.reload(); } catch(ex) { showToast('文件格式错误'); } };
            reader.readAsText(file);
        });
    }

    function renderAboutSettings() {
        const html = `
            <div class="about-section">
                <div class="about-logo">MolTab <span style="font-size:14px;color:var(--text-tertiary);margin-left:8px;font-weight:400;">By Hardy</span></div>
                <div class="about-version">v1.0 · 更新于 2025年7月</div>
                <div class="section-title">主要功能</div>
                <div class="about-desc">• 极简搜索标签<br>• 实时天气与日期显示<br>• 每日壁纸，自适应主题<br>• 自定义书签栏，长按编辑<br>• 设置导入/导出备份</div>
                <div class="section-title">近期更新</div>
                <div class="about-desc">• v1.0<br>• 发现bug可点击下方邮件反馈</div>
                <div class="about-action-row" style="margin-bottom:8px;">
                    <a href="https://github.com/aukarl" target="_blank" class="btn-sm">🐙 AUkarl</a>
                    <a href="https://twitter.com/eastlisi" target="_blank" class="btn-sm">𝕏 EastLisi</a>
                    <a href="https://instagram.com/eastlisi" target="_blank" class="btn-sm">📷 EastLisi</a>
                </div>
                <div class="about-action-row">
                    <a href="mailto:hdywong@gmail.com" class="btn-sm">📧 hdywong@gmail.com</a>
                    <a href="https://molyun.com" target="_blank" class="btn-sm">🌐 应用官网</a>
                    <button id="supportBtn" class="btn-sm">💖 支持一下</button>
                </div>
                <div class="legal-links" style="margin-top:16px;">
                    <span id="showDisclaimer">免责声明</span>
                    <span id="showPrivacy">隐私政策</span>
                    <span id="showCopyright">版权声明</span>
                </div>
            </div>
        `;
        $('modalBody').innerHTML = html;
        $('supportBtn').addEventListener('click', () => { $('qrcodeImg').src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://payapp.wechatpay.cn/sjt/qr/link_e0feda39426874648e4e32d677f7716b_001'; $('qrcodeModal').classList.remove('hidden'); });
        $('showDisclaimer').addEventListener('click', () => showLegal('免责声明', disclaimerText));
        $('showPrivacy').addEventListener('click', () => showLegal('隐私政策', privacyText));
        $('showCopyright').addEventListener('click', () => showLegal('版权声明', copyrightText));
    }

    const disclaimerText = `免责声明\n\nMolTab 是一个基于浏览器的搜索起始页工具，用户可自行选择搜索引擎进行查询。本工具不对任何搜索结果的准确性、合法性、安全性承担责任。使用本工具时，您应遵守相关法律法规，不得用于非法用途。作者不对因使用本工具而产生的任何直接或间接损失负责。`;
    const privacyText = `隐私政策\n\nMolTab 高度重视用户隐私。本工具不会收集、存储或传输任何个人身份信息。所有设置（如书签、主题、天气位置）仅保存在您的浏览器本地存储中，不会上传至任何服务器。天气定位信息仅在您授权后使用浏览器GPS，位置数据不会上传或分享。一言API调用为匿名请求。`;
    const copyrightText = `版权声明\n\n© 2025 MolTab by Hardy. 保留所有权利。本工具代码结构及视觉设计归作者所有。您可自由使用本页面作为个人起始页，但未经许可不得用于商业用途或二次分发。`;

    function showLegal(title, text) { $('legalTitle').textContent = title; $('legalContent').textContent = text; $('legalModal').classList.remove('hidden'); }
    function showToast(msg) { const old = document.querySelector('.toast'); if(old) old.remove(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }

    $('legalCloseBtn').addEventListener('click', () => $('legalModal').classList.add('hidden'));
    $('qrcodeCloseBtn').addEventListener('click', () => $('qrcodeModal').classList.add('hidden'));
    document.addEventListener('click', e => { if(!$('engineDropdown').contains(e.target) && e.target !== $('engineBtn')) closeEngineDropdown(); });
    $('engineBtn').addEventListener('click', e => { e.stopPropagation(); toggleEngineDropdown(); });
    $('engineDropdown').addEventListener('click', e => { const opt = e.target.closest('.engine-option'); if(opt) setEngine(opt.dataset.engine); });
    $('searchSubmitBtn').addEventListener('click', () => performSearch($('searchInput').value));
    $('searchInput').addEventListener('keydown', e => { if(e.key === 'Enter') performSearch($('searchInput').value); });
    $('searchInput').addEventListener('input', () => $('searchClearBtn').classList.toggle('visible', $('searchInput').value.length > 0));
    $('searchClearBtn').addEventListener('click', () => { $('searchInput').value = ''; $('searchClearBtn').classList.remove('visible'); $('searchInput').focus(); });
    $('settingsBtn').addEventListener('click', () => openSettings('bg'));
    $('modalCloseBtn').addEventListener('click', closeSettings);
    $('modalOverlay').addEventListener('click', e => { if(e.target === $('modalOverlay')) closeSettings(); });
    $('modalTabs').addEventListener('click', e => { const tab = e.target.closest('.modal-tab'); if(!tab) return; openSettings(tab.dataset.tab); });
    document.addEventListener('keydown', e => { if((e.ctrlKey && e.key === 'k') || (e.key === '/' && document.activeElement !== $('searchInput'))) { e.preventDefault(); $('searchInput').focus(); } if(e.key === 'Escape') { closeSettings(); if(editingBookmarkId) { editingBookmarkId = null; renderBookmarks(); } closeEngineDropdown(); } });
    $('weatherWidget').addEventListener('click', () => { fetchWeather(); showToast('刷新天气中...'); });

    initWallpapers(); applyTheme(darkTheme); setEngine(currentEngine); loadBookmarks(); updateBgImage(); updateTimeDisplay();
    setInterval(updateTimeDisplay, 1000);
    setTimeout(() => {
        fetchWeather(); setInterval(fetchWeather, 15*60*1000);
        fetchHitokoto(); setInterval(fetchHitokoto, 3600*1000);
        (async function syncTime() { try { const r = await fetchWithTimeout('https://worldtimeapi.org/api/timezone/Asia/Shanghai', {}, 4000); const d = await r.json(); if(d?.unixtime) timeOffset = d.unixtime*1000 - Date.now(); } catch(e) {} })();
        if(autoTheme) setTimeout(detectBrightness, 200);
    }, 200);
})();