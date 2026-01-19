import { checkConfig, searchClassName, skipNode } from "../utils/check";
import { cache } from "../utils/cache";
import { options, servicesType } from "../utils/option";
import { insertFailedTip, insertLoadingSpinner } from "../utils/icon";
import { styles } from "@/entrypoints/utils/constant";
import { beautyHTML, grabNode, grabAllNode, LLMStandardHTML, smashTruncationStyle } from "@/entrypoints/main/dom";
import { detectlang, throttle } from "@/entrypoints/utils/common";
import { getMainDomain, replaceCompatFn } from "@/entrypoints/main/compat";
import { config } from "@/entrypoints/utils/config";
import { translateText, cancelAllTranslations } from '@/entrypoints/utils/translateApi';
import { storage } from '@wxt-dev/storage';
import { swallowExtensionContextInvalidated } from "@/entrypoints/utils/extensionSafe";

let hoverTimer: any; // 鼠标悬停计时器
let htmlSet = new Set(); // 防抖
export let originalContents = new Map(); // 保存原始内容
let isAutoTranslating = false; // 控制是否继续翻译新内容
let observer: IntersectionObserver | null = null; // 保存观察器实例
let mutationObserver: MutationObserver | null = null; // 保存 DOM 变化观察器实例

// 使用自定义属性标记已翻译的节点
const TRANSLATED_ATTR = 'data-fr-translated';
const TRANSLATED_ID_ATTR = 'data-fr-node-id'; // 添加节点ID属性

let nodeIdCounter = 0; // 节点ID计数器

// ========== 展开重翻：源文签名与限流机制 ==========

// 存储已翻译节点的源文签名（用于检测源文变化）
const sourceSignatureMap = new WeakMap<Element, string>();

// 存储每个节点的重翻信息（时间戳与次数）
const retranslateInfoMap = new WeakMap<Element, { lastAt: number; count: number }>();

// 重翻限流配置
const RETRANSLATE_MIN_INTERVAL_MS = 800; // 同一节点最小重翻间隔
const RETRANSLATE_MAX_COUNT = 5; // 同一节点最大重翻次数（页面会话内）

// 抑制 MutationObserver 的全局标记（防止插件自身 DOM 变更触发死循环）
let suppressObserver = false;

// 提取节点的"纯源文"（移除 FluentRead 注入的元素后的文本）
export function extractSourceText(node: Element): string {
    // 克隆节点以避免修改原始 DOM
    const clone = node.cloneNode(true) as Element;
    
    // 移除 FluentRead 注入的所有元素
    const injectSelectors = [
        '.fluent-read-bilingual-content',
        '.fluent-read-loading',
        '.fluent-read-retry-wrapper'
    ];
    injectSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // 获取“可见文本”并尽量保留段落/换行（如 <br>、多段文本）
    // 注意：这里不要做 \s+ 压缩，否则会把段落边界抹掉，导致双语排版变成一坨
    const raw = (clone as any).innerText ?? clone.textContent ?? '';
    return normalizeForTranslation(raw);
}

// 标准化文本（用于签名对比：忽略纯空白差异）
function normalizeForSignature(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

// 标准化文本（用于翻译：保留换行/段落，清理多余空白）
function normalizeForTranslation(text: string): string {
    if (!text) return '';
    // 统一换行符
    let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // 去掉每行行尾空白
    t = t.replace(/[ \t]+\n/g, '\n');
    // 合并过多的空行（保留段落分隔）
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
}

// 计算源文签名（当前直接使用标准化后的文本，后续可改为 hash）
export function computeSourceSignature(node: Element): string {
    return normalizeForSignature(extractSourceText(node));
}

// 保存节点的源文签名
export function saveSourceSignature(node: Element): void {
    const sig = computeSourceSignature(node);
    sourceSignatureMap.set(node, sig);
}

// 获取节点的已保存源文签名
export function getSourceSignature(node: Element): string | undefined {
    return sourceSignatureMap.get(node);
}

// 检查节点源文是否发生变化
export function hasSourceChanged(node: Element): boolean {
    const oldSig = getSourceSignature(node);
    if (oldSig === undefined) return false; // 无历史签名，视为未变化
    const newSig = computeSourceSignature(node);
    return oldSig !== newSig;
}

// 检查节点是否可以重翻（限流检查）
export function canRetranslate(node: Element): boolean {
    const info = retranslateInfoMap.get(node);
    if (!info) return true; // 首次重翻
    
    const now = Date.now();
    // 检查时间间隔
    if (now - info.lastAt < RETRANSLATE_MIN_INTERVAL_MS) return false;
    // 检查次数上限
    if (info.count >= RETRANSLATE_MAX_COUNT) return false;
    
    return true;
}

// 记录重翻（更新限流信息）
function recordRetranslate(node: Element): void {
    const info = retranslateInfoMap.get(node);
    const now = Date.now();
    if (info) {
        info.lastAt = now;
        info.count++;
    } else {
        retranslateInfoMap.set(node, { lastAt: now, count: 1 });
    }
}

// 包装函数：在执行期间抑制 MutationObserver
export function withSuppressedObserver<T>(fn: () => T): T {
    suppressObserver = true;
    try {
        return fn();
    } finally {
        // 使用 queueMicrotask 确保 DOM 变更完成后再解除抑制
        queueMicrotask(() => {
            suppressObserver = false;
        });
    }
}

// 检查当前是否应抑制 observer
export function isObserverSuppressed(): boolean {
    return suppressObserver;
}

// 恢复原文内容
export function restoreOriginalContent() {
    // 取消所有等待中的翻译任务
    cancelAllTranslations();
    
    // 1. 遍历所有已翻译的节点
    document.querySelectorAll(`[${TRANSLATED_ATTR}="true"]`).forEach(node => {
        const nodeId = node.getAttribute(TRANSLATED_ID_ATTR);
        if (nodeId && originalContents.has(nodeId)) {
            const originalContent = originalContents.get(nodeId);
            node.innerHTML = originalContent;
            node.removeAttribute(TRANSLATED_ATTR);
            node.removeAttribute(TRANSLATED_ID_ATTR);
            
            // 移除可能添加的翻译相关类
            node.classList.remove('fluent-read-bilingual');
        }
    });
    
    // 2. 移除所有翻译内容元素
    document.querySelectorAll('.fluent-read-bilingual-content').forEach(element => {
        element.remove();
    });
    
    // 3. 移除所有翻译过程中添加的加载动画和错误提示
    document.querySelectorAll('.fluent-read-loading, .fluent-read-retry-wrapper').forEach(element => {
        element.remove();
    });
    
    // 4. 清空存储的原始内容
    originalContents.clear();
    
    // 5. 停止所有观察器
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }
    
    // 6. 重置所有翻译相关的状态
    isAutoTranslating = false;
    htmlSet.clear(); // 清空防抖集合
    nodeIdCounter = 0; // 重置节点ID计数器
    
    // 7. 消除可能存在的全局样式污染
    const tempStyleElements = document.querySelectorAll('style[data-fr-temp-style]');
    tempStyleElements.forEach(el => el.remove());
}

// 自动翻译整个页面的功能
export function autoTranslateEnglishPage() {
    // 如果已经在翻译中，则返回
    if (isAutoTranslating) return;
    
    // 获取当前页面的语言（暂时注释，存在识别问题）
    // const text = document.documentElement.innerText || '';
    // const cleanText = text.replace(/[\s\u3000]+/g, ' ').trim().slice(0, 500);
    // const language = detectlang(cleanText);
    // console.log('当前页面语言：', language);
    // const to = config.to;
    // if (to.includes(language)) {
    //     console.log('目标语言与当前页面语言相同，不进行翻译');
    //     return;
    // }
    // console.log('当前页面非目标语言，开始翻译');

    // 获取所有需要翻译的节点
    const nodes = grabAllNode(document.body);
    if (!nodes.length) return;

    isAutoTranslating = true;

    const youtubeMode = isYouTubePage();
    const youtubeObserveMap = youtubeMode ? new WeakMap<Element, Element>() : null;

    const startTranslateNode = (node: Element) => {
        // 去重
        if (node.hasAttribute(TRANSLATED_ATTR)) return;

        // 为节点分配唯一ID
        const nodeId = `fr-node-${nodeIdCounter++}`;
        node.setAttribute(TRANSLATED_ID_ATTR, nodeId);

        // 保存原始内容
        originalContents.set(nodeId, node.innerHTML);

        // 标记为已翻译
        node.setAttribute(TRANSLATED_ATTR, 'true');

        handleBilingualTranslation(node, false);
    };

    const findObservableTarget = (node: Element): Element => {
        // YouTube 上经常出现 display: contents 或无 box 的元素（如 yt-formatted-string）
        // IntersectionObserver 观察这种元素可能永远不触发，因此需要向上找一个有 box 的祖先作为观察目标
        let cur: Element | null = node;
        for (let i = 0; cur && i < 8; i++, cur = cur.parentElement) {
            try {
                const style = getComputedStyle(cur);
                if (style.display === 'contents') continue;
            } catch {
                // ignore
            }
            if (cur instanceof HTMLElement) {
                const rect = cur.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) return cur;
            }
        }
        return node.parentElement || node;
    };

    const observeCandidate = (node: Element) => {
        if (!observer) return;
        if (!youtubeMode) {
            observer.observe(node);
            return;
        }

        const target = findObservableTarget(node);
        youtubeObserveMap?.set(target, node);
        observer.observe(target);
    };

    // 创建观察器
    observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && isAutoTranslating) {
                const target = entry.target as Element;
                const node = youtubeObserveMap?.get(target) || target;

                startTranslateNode(node);

                // 停止观察该目标（YouTube 可能是祖先元素）
                observer.unobserve(target);
            }
        });
    }, {
        root: null,
        rootMargin: '50px',
        threshold: 0.1 // 只要出现10%就开始翻译
    });

    // 开始观察所有节点
    nodes.forEach(node => {
        observeCandidate(node);
    });

    // 创建 MutationObserver 监听 DOM 变化
    mutationObserver = new MutationObserver((mutations) => {
        // 如果插件自身正在修改 DOM，跳过以防死循环
        if (suppressObserver) return;
        if (!isAutoTranslating) return;
        
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // 元素节点
                    // 只处理未翻译的新节点
                    const newNodes = grabAllNode(node as Element).filter(
                        n => !n.hasAttribute(TRANSLATED_ATTR)
                    );
                    newNodes.forEach(n => observeCandidate(n));
                }
            });
        });
    });

    // 监听整个 body 的变化
    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function isYouTubePage(): boolean {
    try {
        const host = location.hostname.toLowerCase();
        return host === 'youtube.com' || host.endsWith('.youtube.com');
    } catch {
        return false;
    }
}

// 处理鼠标悬停翻译的主函数
export function handleTranslation(mouseX: number, mouseY: number, delayTime: number = 0) {
    // 检查配置
    if (!checkConfig()) return;

    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {

        let node = grabNode(document.elementFromPoint(mouseX, mouseY));

        // 判断是否跳过节点
        if (skipNode(node)) return;

        // 防抖
        let nodeOuterHTML = node.outerHTML;
        if (htmlSet.has(nodeOuterHTML)) return;
        htmlSet.add(nodeOuterHTML);

        // 根据翻译模式进行翻译
        handleBilingualTranslation(node, delayTime > 0);  // 根据 delayTime 可判断是否为滑动翻译
    }, delayTime);
}

// 双语翻译
export function handleBilingualTranslation(node: any, slide: boolean) {
    let nodeOuterHTML = node.outerHTML;
    // 如果已经翻译过，250ms 后删除翻译结果
    let bilingualNode = searchClassName(node, 'fluent-read-bilingual');
    if (bilingualNode) {
        if (slide) {
            htmlSet.delete(nodeOuterHTML);
            return;
        }
        let spinner = insertLoadingSpinner(bilingualNode as HTMLElement, true);
        setTimeout(() => {
            withSuppressedObserver(() => {
                spinner.remove();
                const content = searchClassName(bilingualNode as HTMLElement, 'fluent-read-bilingual-content');
                if (content && content instanceof HTMLElement) content.remove();
                (bilingualNode as HTMLElement).classList.remove('fluent-read-bilingual');
            });
            htmlSet.delete(nodeOuterHTML);
        }, 250);
        return;
    }

    // 检查是否有缓存
    let cached = cache.localGet(node.textContent);
    if (cached) {
        let spinner = insertLoadingSpinner(node, true);
        setTimeout(() => {
            withSuppressedObserver(() => spinner.remove());
            htmlSet.delete(nodeOuterHTML);
            bilingualAppendChild(node, cached);
        }, 250);
        return;
    }

    // 翻译
    bilingualTranslate(node, nodeOuterHTML);
}

// 单语翻译
export function handleSingleTranslation(node: any, slide: boolean) {
    let nodeOuterHTML = node.outerHTML;
    let outerHTMLCache = cache.localGet(node.outerHTML);


    if (outerHTMLCache) {
        // handleTranslation 已处理防抖 故删除判断 原bug 在保存完成后 刷新页面 可以取得缓存 直接return并没有翻译
        let spinner = insertLoadingSpinner(node, true);
        setTimeout(() => {
            withSuppressedObserver(() => {
                spinner.remove();
                htmlSet.delete(nodeOuterHTML);

                // 兼容部分网站独特的 DOM 结构
                let fn = replaceCompatFn[getMainDomain(document.location.hostname)];
                if (fn) fn(node, outerHTMLCache);
                else node.outerHTML = outerHTMLCache;
            });
        }, 250);
        return;
    }

    singleTranslate(node);
}


function bilingualTranslate(node: any, nodeOuterHTML: any) {
    if (detectlang(node.textContent.replace(/[\s\u3000]/g, '')) === config.to) return;

    // bilingual 模式也尽量保留段落/换行，避免译文排版被压扁
    const origin = (node as HTMLElement)?.innerText ?? node.textContent;
    let spinner = insertLoadingSpinner(node);
    
    // 使用队列管理的翻译API
    translateText(origin, document.title)
        .then((text: string) => {
            withSuppressedObserver(() => spinner.remove());
            htmlSet.delete(nodeOuterHTML);
            bilingualAppendChild(node, text);
        })
        .catch((error: Error) => {
            withSuppressedObserver(() => spinner.remove());
            insertFailedTip(node, error.toString() || "翻译失败", spinner);
        });
}


export function singleTranslate(node: any) {
    if (detectlang(node.textContent.replace(/[\s\u3000]/g, '')) === config.to) return;

    let origin = servicesType.isMachine(config.service) ? node.innerHTML : LLMStandardHTML(node);
    let spinner = insertLoadingSpinner(node);
    
    // 使用队列管理的翻译API
    translateText(origin, document.title)
        .then((text: string) => {
            withSuppressedObserver(() => {
                spinner.remove();
                
                text = beautyHTML(text);
                
                if (!text || origin === text) return;
                
                let oldOuterHtml = node.outerHTML;
                node.innerHTML = text;
                let newOuterHtml = node.outerHTML;
                
                // 缓存翻译结果
                cache.localSetDual(oldOuterHtml, newOuterHtml);
                cache.set(htmlSet, newOuterHtml, 250);
                htmlSet.delete(oldOuterHtml);
            });
        })
        .catch((error: Error) => {
            withSuppressedObserver(() => spinner.remove());
            insertFailedTip(node, error.toString() || "翻译失败", spinner);
        });
}

export const handleBtnTranslation = throttle((node: any) => {
    let origin = node.innerText;
    let rs = cache.localGet(origin);
    if (rs) {
        node.innerText = rs;
        return;
    }

    const prevCount = config.count++;
    if (prevCount > 0) {
        void swallowExtensionContextInvalidated(
            storage.setItem('local:config', JSON.stringify(config)),
        );
    }

    browser.runtime.sendMessage({ context: document.title, origin: origin })
        .then((text: string) => {
            cache.localSetDual(origin, text);
            node.innerText = text;
        }).catch((error: any) => console.error('调用失败:', error))
}, 250)


function bilingualAppendChild(node: any, text: string) {
    withSuppressedObserver(() => {
        node.classList.add("fluent-read-bilingual");
        let newNode = document.createElement("span");
        newNode.classList.add("fluent-read-bilingual-content");
        // find the style
        const style = options.styles.find(s => s.value === config.style && !s.disabled);
        if (style?.class) {
            newNode.classList.add(style.class);
        }
        newNode.append(text);
        smashTruncationStyle(node);
        node.appendChild(newNode);
        
        // 保存源文签名（用于后续检测展开/变化）
        saveSourceSignature(node);
    });
}

// ========== 展开重翻：重翻已翻译节点 ==========

// 重翻已翻译的双语节点（当源文发生变化时调用）
export function retranslateBilingualNode(node: Element): boolean {
    // 1. 检查节点是否已被翻译
    if (!node.hasAttribute(TRANSLATED_ATTR)) {
        return false;
    }
    
    // 2. 检查源文是否真的发生了变化
    if (!hasSourceChanged(node)) {
        return false;
    }
    
    // 3. 检查限流（时间间隔和次数）
    if (!canRetranslate(node)) {
        console.log('[FluentRead] 重翻被限流，跳过节点:', node);
        return false;
    }
    
    // 4. 记录重翻（更新限流信息）
    recordRetranslate(node);
    
    // 5. 移除旧的译文（保留源文）
    withSuppressedObserver(() => {
        const oldContent = node.querySelector('.fluent-read-bilingual-content');
        if (oldContent) {
            oldContent.remove();
        }
        // 移除可能存在的加载动画和错误提示
        node.querySelectorAll('.fluent-read-loading, .fluent-read-retry-wrapper').forEach(el => el.remove());
        node.classList.remove('fluent-read-bilingual');
        node.classList.remove('fluent-read-failure');
    });
    
    // 6. 提取新的源文
    const newSourceText = extractSourceText(node);
    
    // 7. 检查语言（如果已经是目标语言则跳过）
    if (detectlang(newSourceText.replace(/[\s\u3000]/g, '')) === config.to) {
        // 更新签名但不翻译
        saveSourceSignature(node);
        return false;
    }
    
    // 8. 执行翻译
    const spinner = withSuppressedObserver(() => insertLoadingSpinner(node as HTMLElement));
    
    translateText(newSourceText, document.title)
        .then((text: string) => {
            withSuppressedObserver(() => {
                spinner.remove();
                bilingualAppendChild(node, text);
            });
        })
        .catch((error: Error) => {
            withSuppressedObserver(() => {
                spinner.remove();
                insertFailedTip(node as HTMLElement, error.toString() || "重翻失败", spinner);
            });
        });
    
    return true;
}

// 扫描并重翻指定范围内源文发生变化的已翻译节点
export function scanAndRetranslateChangedNodes(root: Element | Document = document): number {
    const translatedNodes = root.querySelectorAll(`[${TRANSLATED_ATTR}="true"]`);
    let retranslatedCount = 0;
    
    // 限制单次扫描的节点数量（防止性能问题）
    const MAX_SCAN_NODES = 80;
    const nodesToCheck = Array.from(translatedNodes).slice(0, MAX_SCAN_NODES);
    
    for (const node of nodesToCheck) {
        // 只处理视口内可见的节点
        if (!isNodeInViewport(node)) continue;
        
        // 跳过 FluentRead 自身注入的节点
        if (node.classList.contains('fluent-read-bilingual-content') ||
            node.classList.contains('fluent-read-loading') ||
            node.classList.contains('fluent-read-retry-wrapper')) {
            continue;
        }
        
        if (retranslateBilingualNode(node)) {
            retranslatedCount++;
        }
    }
    
    return retranslatedCount;
}

// 检查节点是否在视口内
function isNodeInViewport(node: Element): boolean {
    const rect = node.getBoundingClientRect();
    // 稍微放宽范围，包括视口上下 100px 的区域
    const margin = 100;
    return (
        rect.bottom >= -margin &&
        rect.top <= (window.innerHeight || document.documentElement.clientHeight) + margin &&
        rect.right >= 0 &&
        rect.left <= (window.innerWidth || document.documentElement.clientWidth)
    );
}