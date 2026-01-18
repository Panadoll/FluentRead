import { autoTranslateEnglishPage, restoreOriginalContent } from "./main/trans";
import { cache } from "./utils/cache";
import './style.css';
import { config, configReady } from "@/entrypoints/utils/config";
import { detectlang } from "@/entrypoints/utils/common";
import { getMainDomain } from "@/entrypoints/main/compat";
import { cancelAllTranslations } from "@/entrypoints/utils/translateApi";

export default defineContentScript({
    matches: ['<all_urls>'],
    runAt: 'document_end',
    async main() {
        await configReady;
        if (config.on === false) return;

        scheduleAutoTranslate();

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
