import { autoTranslateEnglishPage, restoreOriginalContent, scanAndRetranslateChangedNodes } from "./main/trans";
import { cache } from "./utils/cache";
import './style.css';
import { config, configReady } from "@/entrypoints/utils/config";
import { detectlang } from "@/entrypoints/utils/common";
import { getMainDomain } from "@/entrypoints/main/compat";
import { cancelAllTranslations } from "@/entrypoints/utils/translateApi";

// ========== 展开重翻：用户操作触发器 ==========

// 防抖：避免短时间内重复扫描
let scanDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SCAN_DEBOUNCE_MS = 150; // 用户操作后等待 DOM 更新的延迟

// 用户操作后触发扫描（检测展开/收起导致的源文变化）
function scheduleRetranslateScan(event: Event): void {
    // 只在自动翻译开启时才处理
    if (config.autoTranslate !== true) return;
    
    // 清除之前的防抖定时器
    if (scanDebounceTimer) {
        clearTimeout(scanDebounceTimer);
    }
    
    // 延迟执行，等待站点完成 DOM 更新
    scanDebounceTimer = setTimeout(() => {
        // 尝试从事件路径找到局部扫描根
        const scanRoot = findScanRoot(event);
        scanAndRetranslateChangedNodes(scanRoot);
    }, SCAN_DEBOUNCE_MS);
}

// 从事件路径中找到合适的扫描根节点
function findScanRoot(event: Event): Element | Document {
    // 尝试使用 composedPath 获取事件路径
    const path = event.composedPath?.() || [];
    
    // 遍历路径，找到包含已翻译节点的最近祖先
    for (const node of path) {
        if (!(node instanceof Element)) continue;
        
        // 检查该节点或其子树是否包含已翻译节点
        if (node.hasAttribute('data-fr-translated') || 
            node.querySelector('[data-fr-translated="true"]')) {
            // 返回该节点的父元素作为扫描根（稍微放宽范围）
            return node.parentElement || node;
        }
    }
    
    // 兜底：返回 document（scanAndRetranslateChangedNodes 内部会限制扫描数量）
    return document;
}

// 初始化用户操作监听器
function initGestureListeners(): void {
    // 使用捕获阶段监听，确保能捕获到所有点击事件
    document.addEventListener('click', scheduleRetranslateScan, { capture: true, passive: true });
    
    // 监听键盘事件（Enter/Space 可能触发展开/收起）
    document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            scheduleRetranslateScan(event);
        }
    }, { capture: true, passive: true });
}

export default defineContentScript({
    matches: ['<all_urls>'],
    runAt: 'document_end',
    async main() {
        await configReady;
        if (config.on === false) return;

        scheduleAutoTranslate();

        // YouTube 是 SPA（切换视频不刷新页面），需要额外监听路由变化以触发自动翻译
        initYouTubeRouteListeners();
        
        // 初始化用户操作监听器（用于展开重翻功能）
        initGestureListeners();

        cache.cleaner();

        browser.runtime.onMessage.addListener((message: { message?: string }, sender: any, sendResponse: () => void) => {
            if (message.message === 'clearCache') cache.clean();
            sendResponse();
            return true;
        });
        
        browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (response?: any) => void) => {
            if (message.type === 'contextMenuTranslate') {
                if (config.on === false) {
                    sendResponse({ status: 'disabled' });
                    return true;
                }
                
                if (message.action === 'fullPage') {
                    autoTranslateEnglishPage();
                    sendResponse({ status: 'success', action: 'translated' });
                    return true;
                }

                if (message.action === 'restore') {
                    restoreOriginalContent();
                    sendResponse({ status: 'success', action: 'restored' });
                    return true;
                }
            }
            return false;
        });
        
        window.addEventListener('beforeunload', () => {
            cancelAllTranslations();
        });
    }
});

const CHINESE_RATIO_THRESHOLD = 0.2;
const SAMPLE_TEXT_LENGTH = 1200;
const MIN_SAMPLE_LENGTH = 80;
const AUTO_TRANSLATE_RETRY_INTERVAL_MS = 600;
const AUTO_TRANSLATE_MAX_RETRY = 20;

function autoTranslationEvent() {
    autoTranslateEnglishPage();
}

function scheduleAutoTranslate() {
    let retry = 0;
    const tick = () => {
        const decision = shouldAutoTranslateDecision();
        if (decision.shouldTranslate) {
            autoTranslationEvent();
            return;
        }
        
        // 动态站点：初始文本不足时重试一段时间
        if (decision.reason === 'noText' && retry < AUTO_TRANSLATE_MAX_RETRY) {
            retry++;
            setTimeout(tick, AUTO_TRANSLATE_RETRY_INTERVAL_MS);
        }
    };

    tick();
}

function shouldAutoTranslateDecision(): { shouldTranslate: boolean; reason: 'noText' | 'blocked' | 'langZh' | 'zhRatio' | 'detectedZh' | 'disabled' } {
    if (config.autoTranslate !== true) return { shouldTranslate: false, reason: 'disabled' };

    const mainDomain = getMainDomain(location.href);
    if (mainDomain && config.blockedMainDomains?.includes(mainDomain)) {
        return { shouldTranslate: false, reason: 'blocked' };
    }

    // YouTube：页面 UI 里经常夹杂大量中文/本地化文本，或 lang=zh-* 导致被误判为中文站而不触发自动翻译
    // 但我们在 DOM 采集阶段已经做了 YouTube 白名单（标题/简介/评论）+ 语言检测兜底，因此这里直接放行自动翻译触发
    if (mainDomain === 'youtube.com') {
        return { shouldTranslate: true, reason: 'disabled' };
    }

    const lang = document.documentElement.lang?.toLowerCase().trim();
    if (lang && (lang === 'zh' || lang.startsWith('zh-'))) {
        return { shouldTranslate: false, reason: 'langZh' };
    }

    const sample = getSampleText();
    if (!sample || sample.length < MIN_SAMPLE_LENGTH) {
        return { shouldTranslate: false, reason: 'noText' };
    }

    if (getChineseRatio(sample) >= CHINESE_RATIO_THRESHOLD) {
        return { shouldTranslate: false, reason: 'zhRatio' };
    }

    const detected = detectlang(sample);
    if (detected && detected.startsWith('zh')) {
        return { shouldTranslate: false, reason: 'detectedZh' };
    }

    return { shouldTranslate: true, reason: 'disabled' };
}

function getSampleText(): string {
    const text = document.body?.innerText || document.documentElement?.innerText || '';
    const cleaned = text.replace(/\s+/g, ' ').trim();
    return cleaned.slice(0, SAMPLE_TEXT_LENGTH);
}

function getChineseRatio(text: string): number {
    if (!text) return 0;
    const matches = text.match(/[\u4e00-\u9fff]/g);
    const chineseCount = matches ? matches.length : 0;
    return chineseCount / Math.max(text.length, 1);
}

// ========== YouTube SPA：路由变化触发自动翻译 ==========

let ytRouteDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastYtUrl = '';

function isYouTubePage(): boolean {
    try {
        const host = location.hostname.toLowerCase();
        return host === 'youtube.com' || host.endsWith('.youtube.com');
    } catch {
        return false;
    }
}

function scheduleYouTubeRouteTranslate(): void {
    if (!isYouTubePage()) return;
    if (config.autoTranslate !== true) return;

    const url = location.href;
    if (url === lastYtUrl) return;
    lastYtUrl = url;

    if (ytRouteDebounceTimer) clearTimeout(ytRouteDebounceTimer);
    // 稍微延迟，等 YouTube 完成 DOM 更新/首屏渲染
    ytRouteDebounceTimer = setTimeout(() => {
        // 切页时先清掉上一页的状态，避免 isAutoTranslating 阻挡
        restoreOriginalContent();
        autoTranslateEnglishPage();
    }, 500);
}

function initYouTubeRouteListeners(): void {
    if (!isYouTubePage()) return;

    // 防止重复 patch
    const key = '__fluentread_yt_route_patched__';
    if ((window as any)[key]) return;
    (window as any)[key] = true;

    lastYtUrl = location.href;

    const wrap = (fn: any) => function (this: any, ...args: any[]) {
        const ret = fn.apply(this, args);
        // history API 路由变化
        scheduleYouTubeRouteTranslate();
        return ret;
    };

    try {
        history.pushState = wrap(history.pushState);
        history.replaceState = wrap(history.replaceState);
    } catch {
        // ignore
    }

    window.addEventListener('popstate', () => scheduleYouTubeRouteTranslate(), { passive: true });
}
