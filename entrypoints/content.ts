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

// 初始化全局快捷键监听器（Alt + T 一键切换翻译/还原）
function initHotkeyListener(): void {
    document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (config.on === false) return;
        
        // 匹配 Alt + T (在 Mac 上 Option+T 可能会输出 'å' 或 'Å')
        const isAltT = event.altKey && !event.ctrlKey && !event.metaKey && (
            event.key === 't' || 
            event.key === 'T' || 
            event.key === 'å' || 
            event.key === 'Å'
        );
        
        if (isAltT) {
            // 如果焦点在输入框/编辑器，不触发快捷键，防止干扰打字
            const activeEl = document.activeElement;
            if (activeEl && (
                activeEl.tagName === 'INPUT' || 
                activeEl.tagName === 'TEXTAREA' || 
                activeEl.getAttribute('contenteditable') === 'true'
            )) {
                return;
            }
            
            event.preventDefault();
            event.stopPropagation();
            
            const hasTranslated = document.querySelector('[data-fr-translated="true"]') !== null;
            if (hasTranslated) {
                restoreOriginalContent();
            } else {
                autoTranslateEnglishPage();
            }
        }
    }, { capture: true });
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
        
        // 初始化快捷键监听器
        initHotkeyListener();

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

function shouldAutoTranslateDecision(): { shouldTranslate: boolean; reason: 'noText' | 'blocked' | 'langZh' | 'zhRatio' | 'detectedZh' | 'disabled' | 'whitelist' } {
    if (config.autoTranslate !== true) return { shouldTranslate: false, reason: 'disabled' };

    const mainDomain = getMainDomain(location.href);

    // 1. 如果是“仅白名单”自动翻译模式
    if (config.autoTranslateMode === 'whitelist') {
        // 不在白名单中，直接拦截不翻译
        if (!mainDomain || !config.allowedMainDomains?.includes(mainDomain)) {
            return { shouldTranslate: false, reason: 'disabled' };
        }
        // 在白名单中，则放行进入后续的智能检测流程
    }

    // 2. 智能检测自动翻译模式下的白名单“强翻”逻辑
    if (config.autoTranslateMode === 'smart' && mainDomain && config.allowedMainDomains?.includes(mainDomain)) {
        const sample = getSampleText();
        if (!sample || sample.length < MIN_SAMPLE_LENGTH) {
            return { shouldTranslate: false, reason: 'noText' };
        }
        return { shouldTranslate: true, reason: 'whitelist' };
    }

    // 黑名单拦截（主要用于智能检测模式）
    if (mainDomain && config.blockedMainDomains?.includes(mainDomain)) {
        return { shouldTranslate: false, reason: 'blocked' };
    }

    // YouTube 与 X (Twitter)：页面 UI 里经常夹杂大量中文/本地化文本，或 lang=zh-* 导致被误判为中文站而不触发自动翻译
    // 但我们在具体的节点级翻译中已有 shouldSkipNodeTranslation 过滤进行精准把关，因此此类社交多语种站点直接放行自动翻译触发
    if (mainDomain === 'youtube.com' || mainDomain === 'x.com') {
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
    
    // 如果是仅白名单模式，且 YouTube 不在白名单中，跳过自动翻译
    if (config.autoTranslateMode === 'whitelist' && !config.allowedMainDomains?.includes('youtube.com')) {
        return;
    }

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
