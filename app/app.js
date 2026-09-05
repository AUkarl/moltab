/**
 * MolTab 入口模块
 * 负责实例化所有功能模块并初始化，注册 Service Worker
 */
import { TimeManager } from './time.js';
import { SearchManager } from './search.js';
import { WeatherManager } from './weather.js';
import { HitokotoManager } from './hitokoto.js';
import { WallpaperManager } from './wallpaper.js';
import { ThemeManager } from './theme.js';
import { BookmarkManager } from './bookmarks.js';
import { SettingsManager } from './settings.js';
import { GreetingManager } from './greeting.js';
import { FocusManager } from './focus.js';
import { GridManager } from './grid.js';

// 实例化各功能模块
const time = new TimeManager();
const theme = new ThemeManager();
const wallpaper = new WallpaperManager();
const search = new SearchManager();
const weather = new WeatherManager();
const hitokoto = new HitokotoManager();
const bookmarks = new BookmarkManager(null);
const greeting = new GreetingManager();
const focus = new FocusManager();
const grid = new GridManager(document.getElementById('gridContainer'), { bookmarks, focus });
const settings = new SettingsManager({ wallpaper, theme, weather, bookmarks, hitokoto, grid });

// 建立书签与网格的双向引用
bookmarks.setGridManager(grid);

// 按依赖顺序初始化各模块
theme.init();
wallpaper.init();
// 壁纸切换时同步更新主题亮度采样
wallpaper.onChange(() => {
    theme.updateNightMode();
    theme.localBrightness.update();
});
search.init();
weather.init();
hitokoto.init();
greeting.start();
focus.init();
grid.init();
settings.init();
time.start();

// 注册 Service Worker 实现离线缓存
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}
