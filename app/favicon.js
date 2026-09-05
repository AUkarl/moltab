/**
 * Favicon 工具模块
 * 提供网站图标多源获取（Google/DuckDuckGo/favicon.im/直连）、localStorage 缓存、
 * 域名提取、字母 fallback 图标等功能
 */

// 4 个图标源按优先级排列，依次尝试直到成功
const FAVICON_SOURCES = [
    domain => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    domain => `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    domain => `https://favicon.im/${domain}?size=64`,
    domain => `https://${domain}/favicon.ico`
];

// 图标缓存，从 localStorage 恢复，key 为域名，value 为图标 URL
let cache = {};
try { cache = JSON.parse(localStorage.getItem('moltap-favicon-cache') || '{}'); } catch { cache = {}; }

function saveCache() {
    try { localStorage.setItem('moltap-favicon-cache', JSON.stringify(cache)); } catch {}
}

/** 测试图片 URL 是否可用，超时返回 null */
function testImage(url, timeout = 4000) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(url);
        img.onerror = () => resolve(null);
        setTimeout(() => resolve(null), timeout);
        img.src = url;
    });
}

/** 从 URL 中提取域名 */
export function getDomain(url) {
    try { return new URL(url).hostname; } catch { return ''; }
}

/** 查询缓存中的图标 URL */
export function getCachedIcon(domain) {
    return cache[domain] || null;
}

/** 按优先级依次尝试 4 个图标源，成功后写入缓存 */
export async function fetchFavicon(url) {
    const domain = getDomain(url);
    if (!domain) return '';
    if (cache[domain]) return cache[domain];

    for (const source of FAVICON_SOURCES) {
        const iconUrl = source(domain);
        const result = await testImage(iconUrl);
        if (result) {
            cache[domain] = result;
            saveCache();
            return result;
        }
    }
    return '';
}

/** 清空图标缓存 */
export function clearFaviconCache() {
    cache = {};
    localStorage.removeItem('moltap-favicon-cache');
}

/** 取名称首字母大写作为 fallback 图标 */
export function getLetterIcon(name) {
    return (name || '?')[0].toUpperCase();
}
