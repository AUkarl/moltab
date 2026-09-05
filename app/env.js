/**
 * 环境检测模块
 * 区分网页版与浏览器扩展版，提供扩展 API 访问入口
 */
const api = globalThis.browser || globalThis.chrome;

/** 是否运行在浏览器扩展上下文中 */
export const IS_EXTENSION = !!(api && api.runtime && api.runtime.id);

/** 扩展 API 引用（扩展环境下为 chrome/browser 对象，网页环境下为 null） */
export const ext = IS_EXTENSION ? api : null;

/** 是否为 Firefox 浏览器 */
export const IS_FIREFOX = IS_EXTENSION && navigator.userAgent.includes('Firefox');

/** 是否支持标签页分组 API（仅 Chrome/Edge 支持） */
export const HAS_TAB_GROUPS = IS_EXTENSION && typeof api?.tabs?.group === 'function';
