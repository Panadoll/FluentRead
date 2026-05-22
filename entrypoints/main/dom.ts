import { getMainDomain, selectCompatFn } from "@/entrypoints/main/compat";
import { html } from 'js-beautify';
import { handleBtnTranslation } from "@/entrypoints/main/trans";
import { shouldSkipNodeTranslation } from "@/entrypoints/utils/common";
import { config } from "@/entrypoints/utils/config";

// 直接翻译的标签集合（块级元素）
const directSet = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',  // 标题
    'p', 'li', 'dd', 'blockquote',       // 段落和列表
    'figcaption'                         // 图片说明
]);

// 需要跳过的标签
const skipSet = new Set([
    'html', 'body', 'script', 'style', 'noscript', 'iframe',
    'input', 'textarea', 'select', 'button', 'code', 'pre',
]);

// 内联元素集合（可以包含在其他元素内的元素）
export const inlineSet = new Set([
    'a', 'b', 'strong', 'span', 'em', 'i', 'u', 'small', 'sub', 'sup',
    'font', 'mark', 'cite', 'q', 'abbr', 'time', 'ruby', 'bdi', 'bdo',
    'img', 'br', 'wbr', 'svg'
]);

// 传入父节点，返回所有需要翻译的 DOM 元素数组
export function grabAllNode(rootNode: Node): Element[] {
    if (!rootNode) return [];

    // YouTube：用白名单选择器采集（标题/简介/评论），避免通用遍历/过滤误伤导致“完全不翻译”
    if (isYouTubePage()) {
        return grabAllNodeYouTube(rootNode);
    }

    const result: Element[] = [];
    // 用于过滤“重复菜单项”等高频短文本
    const seenShortText = new Map<string, number>();

    const walker = document.createTreeWalker(
        rootNode,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node: Node): number => {
                if (node instanceof Text) return NodeFilter.FILTER_ACCEPT;

                if (!(node instanceof Element)) return NodeFilter.FILTER_SKIP;

                const tag = node.tagName.toLowerCase();

                // 跳过黑名单标签
                if (skipSet.has(tag) ||
                    node.classList?.contains('sr-only') ||
                    node.classList?.contains('notranslate')) {
                    return NodeFilter.FILTER_REJECT;
                }

                // 在初始全局翻译时尽量跳过“站点级”的 header/footer（通常是导航栏/页脚）
                // 但不能无脑拒绝所有 <header>/<footer>：很多站点（含 YouTube）会在正文模块内使用 <header> 包裹标题/信息
                if (tag === 'header' || tag === 'footer') {
                    const parent = node.parentElement;
                    if (parent && parent.tagName.toLowerCase() === 'body') {
                        return NodeFilter.FILTER_REJECT; // 仅拒绝 body 直下的站点头尾
                    }
                    return NodeFilter.FILTER_SKIP; // 允许继续向下遍历，避免误伤正文
                }

                // 检查是否只包含有效文本内容
                let hasText = false;
                let hasElement = false;
                let hasNonEmptyElement = false;

                for (const child of node.childNodes) {
                    if (child.nodeType === Node.ELEMENT_NODE) {
                        hasElement = true;
                        // 检查子元素是否包含文本
                        if (child.textContent?.trim()) {
                            hasNonEmptyElement = true;
                        }
                    }
                    if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
                        hasText = true;
                    }
                }

                // 如果有非空子元素，跳过当前节点
                if (hasNonEmptyElement) {
                    return NodeFilter.FILTER_SKIP;
                }

                if (hasText && !hasElement) {
                    return NodeFilter.FILTER_ACCEPT;
                }

                // 如果有子元素，继续遍历
                if (node.childNodes.length > 0) {
                    return NodeFilter.FILTER_SKIP;
                }

                return NodeFilter.FILTER_REJECT;
            }
        }
    );

    // 遍历出所有可翻译的节点
    let currentNode: Node | null;
    while (currentNode = walker.nextNode()) {
        const translateNode = grabNode(currentNode as Element | Text);
        let ok = true;
        if (translateNode) {
            try {
                ok = shouldTranslateCandidate(translateNode, seenShortText);
            } catch {
                // 过滤器绝不能阻断翻译流程：出错时放行
                ok = true;
            }
        }
        if (translateNode && ok) {
            result.push(translateNode);
            // 跳过已确定要翻译的节点的所有子节点
            walker.currentNode = currentNode.nextSibling || currentNode;
        }
    }
    return Array.from(new Set(result));;
}

function grabAllNodeYouTube(rootNode: Node): Element[] {
    const root =
        (rootNode instanceof Document ? rootNode : null) ||
        (rootNode instanceof Element ? rootNode : null);
    if (!root) return [];

    // 目标：标题 / 简介 / 评论
    // 说明：YouTube DOM 会频繁调整，选择器尽量“多路兜底”，并且做数量上限避免一次性抓太多评论
    const selectors = [
        // 标题（watch 页）
        '#title h1 yt-formatted-string',
        'ytd-watch-metadata h1 yt-formatted-string',
        // 简介（description 近年常见为 yt-attributed-string，也可能是 yt-formatted-string）
        '#description yt-attributed-string',
        '#description yt-formatted-string',
        'ytd-text-inline-expander yt-attributed-string',
        'ytd-text-inline-expander yt-formatted-string',
        // 评论正文（content-text）
        '#comments ytd-comment-thread-renderer #content-text',
        '#comments ytd-comment-renderer #content-text',
        '#comments yt-formatted-string#content-text',
        '#comments yt-attributed-string#content-text',
    ].join(',');

    let nodes: Element[] = [];
    try {
        nodes = Array.from((root as Document | Element).querySelectorAll(selectors));
    } catch {
        nodes = [];
    }

    // 去重 + 基础过滤（不在这里做复杂过滤，交给后续 shouldTranslateCandidate 兜底）
    const uniq: Element[] = [];
    const seen = new Set<Element>();
    for (const el of nodes) {
        if (!el || seen.has(el)) continue;
        seen.add(el);

        // 跳过 FluentRead 自身注入节点
        if (el.classList.contains('fluent-read-bilingual-content') ||
            el.classList.contains('fluent-read-loading') ||
            el.classList.contains('fluent-read-retry-wrapper')) {
            continue;
        }

        const text = normalizeForFilter((el as any).innerText ?? el.textContent ?? '');
        if (!text) continue;
        // 标题/评论里可能有很短的内容（例如“👍”），这里先做一个非常宽松的下限
        if (countNonWhitespaceChars(text) < 2) continue;

        uniq.push(el);
        // 限制数量，避免评论过多导致观察器压力过大
        if (uniq.length >= 120) break;
    }

    return uniq;
}

// 判断一个候选节点是否值得翻译（过滤无关文本，降低请求数量）
function shouldTranslateCandidate(node: Element, seenShortText: Map<string, number>): boolean {
    // 跳过 FluentRead 自身注入节点
    if (node.classList.contains('fluent-read-bilingual-content') ||
        node.classList.contains('fluent-read-loading') ||
        node.classList.contains('fluent-read-retry-wrapper')) {
        return false;
    }

    // 导航/评论/侧栏/推荐/工具条等区域过滤
    if (isInExcludedContainer(node)) return false;

    // 隐藏/不可见区域过滤（display/visibility/opacity/尺寸为0）
    if (!isElementVisible(node)) return false;

    const raw = (node as any).innerText ?? node.textContent ?? '';
    const normalized = normalizeForFilter(raw);

    // 纯空白
    if (!normalized) return false;

    // 忽略太短：默认 < 8 字符；YouTube 评论区放宽，避免短评论全部被过滤
    const minLen = isYouTubeCommentsArea(node) ? 3 : 8;
    if (countNonWhitespaceChars(normalized) < minLen) return false;

    // 纯符号/分隔线
    if (isSymbolOnly(normalized)) return false;

    // 纯链接（URL/域名/路径），常见于导航、分享、引用链接
    if (isUrlLike(normalized)) return false;

    // 重复菜单项：短文本重复出现时跳过（仅对短文本生效，避免误伤正文重复段落）
    if (normalized.length <= 30) {
        const key = normalized.toLowerCase();
        const prev = seenShortText.get(key) ?? 0;
        seenShortText.set(key, prev + 1);
        if (prev >= 1) return false;
    }

    // 单独链接文案：如 “Home / About / Contact” 等
    const closestLink = node.closest?.('a');
    if (closestLink && closestLink instanceof HTMLAnchorElement) {
        const linkText = normalizeForFilter(closestLink.innerText || closestLink.textContent || '');
        if (linkText && linkText === normalized && (isUrlLike(linkText) || linkText.length <= 30)) {
            return false;
        }
    }

    return true;
}

function normalizeForFilter(text: string): string {
    if (!text) return '';
    // 过滤时做轻量标准化：合并空白，避免把同一菜单项当成不同文本
    return text.replace(/\s+/g, ' ').trim();
}

function countNonWhitespaceChars(text: string): number {
    return text.replace(/[\s\u3000]/g, '').length;
}

function isSymbolOnly(text: string): boolean {
    const t = text.trim();
    if (!t) return true;
    // 若完全不包含字母/数字/汉字等“可读字符”，则视为纯符号
    // 这里用宽松判断：只要包含任意字母/数字/汉字就放行
    // 避免使用 \p{L}/\p{N}（部分环境不支持会导致脚本直接报错）
    if (/[A-Za-z0-9\u4e00-\u9fff]/.test(t)) return false;
    return true;
}

function isUrlLike(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    // 常见 URL / 域名 / www / 路径形式
    if (/^(https?:\/\/|www\.)/i.test(t)) return true;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(t)) return true;
    // 类似 “/path/to/page” 或 “./foo”
    if (/^(\/|\.\.?\/)\S+$/i.test(t)) return true;
    return false;
}

function isElementVisible(el: Element): boolean {
    // 快速属性过滤
    if ((el as any).hidden) return false;
    if (el.closest?.('[hidden],[aria-hidden="true"]')) return false;

    // 逐层检查 display/visibility/opacity，避免隐藏菜单/弹窗内容被翻译
    let cur: Element | null = el;
    for (let i = 0; cur && i < 15; i++, cur = cur.parentElement) {
        const style = getComputedStyle(cur as Element);
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        if (Number.parseFloat(style.opacity) === 0) return false;
    }

    // 尺寸为0的节点通常不可见（例如占位、隐藏容器）
    // 但像 YouTube 这类站点大量使用 display: contents / 自定义元素，其自身可能没有 box（宽高为0），但子元素可见
    // 因此：
    // - display: contents 放行（由后续文本内容过滤兜底）
    // - YouTube 页面不使用 rect=0 判定（避免误伤标题/简介/评论）
    try {
        const selfStyle = getComputedStyle(el);
        if (selfStyle.display === 'contents') return true;
    } catch {
        // ignore
    }
    if (!isYouTubePage() && el instanceof HTMLElement) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
    }
    return true;
}

function isInExcludedContainer(el: Element): boolean {
    // YouTube：明确允许标题/简介/评论区域，避免被通用关键词误伤
    if (isYouTubePage()) {
        const allow = el.closest?.(
            'ytd-watch-metadata,#title,#description,' +
            '#comments,ytd-comments,ytd-comment-thread-renderer,ytd-comment-renderer'
        );
        if (allow) return false;
    }

    // 标签/role 层面的排除
    // 注意：不要使用 CSS4 的属性选择器 flags（如 [attr*="x" i]），部分环境会抛 SyntaxError
    const structuralSelector =
        'nav,aside,header,footer,' +
        '[role="navigation"],[role="banner"],[role="contentinfo"],[role="complementary"],' +
        '[role="search"],[role="menu"],[role="menubar"],[role="toolbar"],' +
        '[aria-label*="breadcrumb"],[aria-label*="Breadcrumb"],[aria-label*="面包屑"]';
    let structural: Element | null = null;
    try {
        structural = el.closest?.(structuralSelector) ?? null;
    } catch {
        structural = null;
    }
    if (structural) return true;

    // class/id 关键词排除（覆盖常见导航/评论/推荐/分享/工具条等）
    // 注意：不能用简单 includes('ad') 这类子串判断，会误伤诸如 header/read/lead 等正常类名
    const exactTokenKeywords = new Set([
        'nav', 'navbar', 'menu', 'breadcrumb', 'breadcrumbs',
        // 不要把 header/footer 当作 class/id 关键词过滤：很多站点（含 YouTube）正文容器也会用 id="header" 之类包裹
        'sidebar', 'aside', 'toolbar', 'tool-bar',
        'comment', 'comments', 'reply', 'replies',
        'recommend', 'recommended', 'related', 'share', 'social',
        'pagination', 'pager', 'subscribe', 'newsletter',
        'advert', 'advertisement', 'sponsor', 'sponsored',
        'cookie', 'consent', 'popup', 'modal', 'drawer',
    ]);

    // 广告类 token 用更严格的规则：仅当 token 本身就是 ad/ads 或 ad-xxx 这种形式才命中
    const tokenRegexKeywords: RegExp[] = [
        /^ad$/i,
        /^ads$/i,
        /^ad[-_].+/i,
        /^ads[-_].+/i,
        /^advert[-_].+/i,
        /^sponsor(ed)?[-_].+/i,
    ];

    // 中文关键词允许子串匹配（中文 class/id 往往不是 token 化的）
    const cnSubstrings = ['导航', '侧栏', '评论', '推荐', '相关', '分享', '广告', '面包屑'];

    let cur: Element | null = el;
    for (let i = 0; cur && i < 15; i++, cur = cur.parentElement) {
        const id = (cur as HTMLElement).id || '';
        const cls = (cur as HTMLElement).className || '';
        const hay = `${id} ${cls}`;
        if (!hay) continue;

        // 1) 中文子串快速判断
        for (const k of cnSubstrings) {
            if (hay.includes(k)) return true;
        }

        // 2) 以“token”为单位判断（避免子串误伤）
        const tokens = hay
            .toLowerCase()
            .split(/[^a-z0-9\u4e00-\u9fff]+/g)
            .filter(Boolean);

        for (const t of tokens) {
            // YouTube：不要因为 comments/reply 等 token 就整块排除（用户需要翻译评论）
            if (isYouTubePage() && (t === 'comment' || t === 'comments' || t === 'reply' || t === 'replies')) {
                continue;
            }
            if (exactTokenKeywords.has(t)) return true;
            for (const re of tokenRegexKeywords) {
                if (re.test(t)) return true;
            }
        }
    }
    return false;
}

function isYouTubePage(): boolean {
    try {
        const host = location.hostname.toLowerCase();
        return host === 'youtube.com' || host.endsWith('.youtube.com');
    } catch {
        return false;
    }
}

function isYouTubeCommentsArea(el: Element): boolean {
    if (!isYouTubePage()) return false;
    return !!el.closest?.('#comments,ytd-comments,ytd-comment-thread-renderer,ytd-comment-renderer');
}

// 返回最终应该翻译的父节点或 false
export function grabNode(node: any): any {
    // 空节点检查
    if (!node) return false;

    // 对于 Text 节点，尝试找到其可翻译的父节点
    if (node instanceof Text) {
        // YouTube 的关键文本（标题/简介/评论）大量包在 yt-formatted-string 等自定义元素中，
        // 如果按通用规则找不到可翻译父节点，会导致几乎没有候选节点进入队列
        if (isYouTubePage()) {
            const parentEl = node.parentElement;
            const ytFormatted = parentEl?.closest?.('yt-formatted-string');
            if (ytFormatted) return ytFormatted;
            const h1 = parentEl?.closest?.('h1');
            if (h1) return h1;
        }
        const parentOrSelf = findTranslatableParent(node);
        if (parentOrSelf && parentOrSelf !== node) {
            return parentOrSelf;
        }
        return false;
    }

    if (!node.tagName) return false;

    const curTag = node.tagName.toLowerCase();

    // 1. 快速过滤：跳过不需要翻译的节点
    if (shouldSkipNode(node, curTag)) return false;

    // 2. 特殊适配：根据域名进行特殊处理
    const domainHandler = selectCompatFn[getMainDomain(location.href.split('?')[0])];
    if (domainHandler) {
        const result = domainHandler(node);
        // 如果返回的是对象且包含skip属性为true，则跳过该节点
        if (result && typeof result === 'object' && 'skip' in result && result.skip === true) {
            return false;
        }
        // 如果返回值为节点或其他真值，则返回该值作为翻译节点
        if (result) return result;
    }

    // 3. 直接翻译：块级元素
    // YouTube：允许直接翻译 yt-formatted-string（标题/简介/评论正文常用）
    if (isYouTubePage() && curTag === 'yt-formatted-string') return node;
    if (directSet.has(curTag)) return node;

    // 4. 按钮处理：特殊处理按钮内的文本
    if (isButton(node, curTag)) {
        handleButtonTranslation(node);
        return false;
    }

    // 5. 内联元素处理：向上查找合适的父节点
    if (isInlineElement(node, curTag)) {
        return findTranslatableParent(node);
    }

    // 6. 首行文本处理：处理 div 和 label 的首行文本
    if (curTag === 'div' || curTag === 'label') {
        return handleFirstLineText(node);
    }

    return false;
}

// 检查是否应该跳过节点
function shouldSkipNode(node: any, tag: string): boolean {
    // 1. 判断标签是否在 skipSet 内
    // 2. 检查是否具有 notranslate 类
    // 3. 判断节点是否可编辑
    // 4. 判断文本是否过长
    // 5. 判断文本是否为纯数字或标准数字格式（仅当节点内容几乎全是数字时才跳过）
    // 6. 判断是否为纯网址/链接
    return skipSet.has(tag) ||
        node.classList?.contains('notranslate') ||
        node.isContentEditable ||
        checkTextSize(node) ||
        isMainlyNumericContent(node) ||
        isUrlLike(node.textContent || '');
}

// 检查文本长度
function checkTextSize(node: any): boolean {
    // 1. 若文本内容长度超过 3072
    // 2. 或者 outerHTML 长度超过 4096，都视为过长
    // 3. 少于3个字符
    return node.textContent.length > 3072 ||
        (node.outerHTML && node.outerHTML.length > 4096) ||
        node.textContent.length < 3;
}

// 检查节点内容是否主要为数字
function isMainlyNumericContent(node: any): boolean {
    if (!node || !node.textContent) return false;
    
    const text = node.textContent.trim();
    if (!text) return false;
    
    // 如果内容很短，且是纯数字格式，则跳过
    // 对于短文本，直接判断整体是否为数字格式
    if (text.length < 30 && isNumericContent(text)) return true;
    
    // 检查是否为用户名或用户ID格式
    if (isUserIdentifier(text)) return true;
    
    // 对于较长的内容，检查是否主要为数字格式
    // 处理节点可能含有多个文本子节点的情况
    // 这有助于更精确地识别混合内容中的数字部分
    const textNodes = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    let textNode;
    while (textNode = walker.nextNode()) {
        const nodeText = textNode.textContent?.trim() || '';
        if (nodeText) {
            textNodes.push(nodeText);
        }
    }
    
    // 如果只有一个文本节点且为数字，则跳过翻译
    if (textNodes.length === 1 && isNumericContent(textNodes[0])) return true;
    
    // 如果所有文本节点都是数字，则跳过翻译
    // 这可能是表格中的数字列或者纯数字列表等
    if (textNodes.length > 0 && textNodes.every(t => isNumericContent(t))) return true;
    
    // 否则不跳过，允许翻译
    return false;
}

/**
 * 检查文本是否为用户标识符（用户名、ID等）
 */
function isUserIdentifier(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    
    const trimmedText = text.trim();
    
    // 检查是否为社交媒体用户名格式
    if (/^@\w+/.test(trimmedText)) return true;  // Twitter格式：@username
    if (/^u\/\w+/.test(trimmedText)) return true; // Reddit格式：u/username
    
    // 检查是否为x.com或twitter.com的ID格式
    if (/^id@https?:\/\/(x\.com|twitter\.com)\/[\w-]+\/status\/\d+/.test(trimmedText)) return true;
    
    // 检查是否包含"关注"相关内容
    if (/关注.*\w+/.test(trimmedText) || /Follow.*\w+/.test(trimmedText)) return true;
    
    // 检查是否为纯粹的用户名格式（字母、数字、下划线组合）
    if (/^[A-Za-z0-9_]{1,15}$/.test(trimmedText)) return true;
    
    // 特殊格式：带点击动作的用户名
    if (/点击.*\w+/.test(trimmedText) && trimmedText.length < 50) return true;
    
    return false;
}

/**
 * 检查文本是否为纯数字或标准数字格式
 * 
 * 识别以下数字格式：
 * 1. 整数 (例如: 12345, -123)
 * 2. 带千位分隔符的数字 (例如: 1,234,567)
 * 3. 数字范围 (例如: 1-100, 5~10)
 * 4. 小数 (例如: 3.14159)
 * 5. 百分比 (例如: 85%, -2.5%)
 * 6. 科学计数法 (例如: 1.23e+4)
 * 7. 货币金额 (例如: $123.45, €100)
 * 8. 常见日期格式 (例如: 2023-01-01, 01/01/2023)
 * 9. 时间格式 (例如: 13:45:30, 9:30)
 * 10. 版本号 (例如: 1.0.0, 2.3.5-beta)
 * 11. ID格式 (例如: id@x.com/user/status/123456789)
 * 12. 用户名格式 (例如: @username, gunsnrosesgirl3)
 * 13. #数字 格式的
 * 
 * 这些格式的数字和用户标识符通常不需要翻译，保持原样更有利于页面理解。
 */
function isNumericContent(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    
    // 去除空白字符
    const trimmedText = text.trim();
    if (!trimmedText) return false;

    // 首先检查是否为用户标识符
    if (isUserIdentifier(trimmedText)) return true;
    
    // 如果包含多个单词，则不视为纯数字内容
    if (/\s+/.test(trimmedText.replace(/[\d,.\-%+]/g, ''))) return false;
    
    // 检查是否为纯数字
    if (/^-?\d+$/.test(trimmedText)) return true;
    
    // 检查是否为标准数字格式：带逗号的数字 (例如: 1,234,567)
    if (/^-?(\d{1,3}(,\d{3})+)$/.test(trimmedText)) return true;
    
    // 检查是否为范围数字 (例如: 1-123)
    if (/^\d+\s*[-~]\s*\d+$/.test(trimmedText)) return true;
    
    // 检查是否为小数
    if (/^-?\d+\.\d+$/.test(trimmedText)) return true;
    
    // 检查是否为百分比
    if (/^-?\d+(\.\d+)?%$/.test(trimmedText)) return true;
    
    // 检查是否为科学计数法 (例如: 1.23e+4)
    if (/^-?\d+(\.\d+)?(e[-+]\d+)?$/i.test(trimmedText)) return true;
    
    // 检查是否为带货币符号的金额 (例如: $123.45, €123, ¥123)
    if (/^[$€¥£₹₽₩]?\s*-?\d+(,\d{3})*(\.\d+)?$/.test(trimmedText)) return true;
    
    // 检查是否为日期时间格式 (仅考虑常见的数字日期格式)
    // 匹配 YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YYYY, MM-DD-YYYY, MM/DD/YYYY
    if (/^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{1,2})$/.test(trimmedText)) return true;
    
    // 匹配时间格式 HH:MM:SS, HH:MM
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmedText)) return true;
    
    // 匹配版本号 (例如: 1.0.0, 2.3.5-beta)
    if (/^\d+(\.\d+){1,3}(-[a-zA-Z0-9]+)?$/.test(trimmedText)) return true;
    
    // 匹配社交媒体的ID格式
    if (/^id@https?:\/\/(x\.com|twitter\.com)\/[\w-]+\/status\/\d+/.test(trimmedText)) return true;
    
    // 匹配常见的数字ID格式
    if (/^ID[:：]?\s*\d+$/.test(trimmedText)) return true;
    if (/^No[\.:]?\s*\d+$/i.test(trimmedText)) return true;

    // #数字 格式的
    if (/^#[\d]+$/.test(trimmedText)) return true;

    return false;
}

// 检查是否为按钮
function isButton(node: any, tag: string): boolean {
    // 1. 若当前标签就是 button
    // 2. 或者当前标签为 span 并且其父节点为 button，则视为按钮
    return tag === 'button' ||
        (tag === 'span' && node.parentNode?.tagName.toLowerCase() === 'button');
}

// 处理按钮翻译
function handleButtonTranslation(node: any): void {
    // 1. 若文本非空，则调用 handleBtnTranslation 进行按钮文本翻译处理
    if (node.textContent.trim()) {
        handleBtnTranslation(node);
    }
}

// 检查是否为内联元素
function isInlineElement(node: any, tag: string): boolean {
    // 1. 判断是否在 inlineSet 中
    // 2. 判断是否文本节点
    // 3. 检查子元素中是否包含非内联元素
    return inlineSet.has(tag) ||
        node.nodeType === Node.TEXT_NODE ||
        detectChildMeta(node);
}

// 查找可翻译的父节点
function findTranslatableParent(node: any): any {
    // 1. 递归调用 grabNode 查找父节点是否可翻译
    // 2. 若父节点不可翻译，则返回当前节点
    const parentResult = grabNode(node.parentNode);
    return parentResult || node;
}

// 处理首行文本
function handleFirstLineText(node: any): boolean {
    // 1. 遍历子节点，找到首个文本节点
    // 2. 若存在可翻译文本，则通过 browser.runtime.sendMessage 进行翻译
    // 3. 翻译成功后，替换该文本；出现错误时，打印错误日志
    let child = node.firstChild;
    while (child) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
            if (shouldSkipNodeTranslation(child.textContent, config.to)) {
                return false;
            }
            browser.runtime.sendMessage({
                context: document.title,
                origin: child.textContent
            })
                .then((text: string) => child.textContent = text)
                .catch((error: any) => console.error('翻译失败:', error));
            return false;
        }
        child = child.nextSibling;
    }
    return false;
}

// 检测子元素中是否包含指定标签以外的元素
function detectChildMeta(parent: any): boolean {
    // 1. 逐个检查子节点
    // 2. 若发现非内联元素则返回 false；否则全部检查通过则返回 true
    let child = parent.firstChild;
    while (child) {
        if (child.nodeType === Node.ELEMENT_NODE && !inlineSet.has(child.nodeName.toLowerCase())) {
            return false;
        }
        child = child.nextSibling;
    }
    return true;
}

// 仅译文模式下获取 LLM 应当翻译的标准 HTML
export function LLMStandardHTML(node: any) {
    // 1. 初始化空字符串 text
    // 2. 遍历子节点
    // 3. 若为文本节点，拼接其文本内容
    // 4. 若为元素节点且在 inlineSet 中，拼接其 outerHTML
    // 5. 否则继续递归处理子节点
    let text = "";
    node.childNodes.forEach((child: any) => {
        if (child.nodeType === Node.TEXT_NODE) {
            text += child.nodeValue;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            if (inlineSet.has(child.tagName.toLowerCase())) {
                text += child.outerHTML;
            } else {
                text += LLMStandardHTML(child);
            }
        }
    });
    return text;
}

export function beautyHTML(text: string): string {
    // 1. 先替换 SVG 中的大小写敏感词
    // 2. 再使用 js-beautify 格式化 HTML
    text = replaceSensitiveWords(text);
    return html(text)
}

// 替换 svg 标签中的一些大小写敏感的词（html 不区分大小写，但 svg 标签区分大小写）
function replaceSensitiveWords(text: string): string {
    // 1. 使用正则匹配大小写敏感词
    // 2. 逐个替换为正确大小写形式
    return text.replace(/viewbox|preserveaspectratio|clippathunits|gradienttransform|patterncontentunits|lineargradient|clippath/gi, (match) => {
        switch (match.toLowerCase()) {
            case 'viewbox':
                return 'viewBox';
            case 'preserveaspectratio':
                return 'preserveAspectRatio';
            case 'clippathunits':
                return 'clipPathUnits';
            case 'gradienttransform':
                return 'gradientTransform';
            case 'patterncontentunits':
                return 'patternContentUnits';
            case 'lineargradient':
                return 'linearGradient';
            case 'clippath':
                return 'clipPath';
            default:
                return match;
        }
    });
}

// 移除特定样式
export function checkAndRemoveStyle(node: any, styleProperty: any) {
    // 1. 若节点存在样式且对应属性不为 undefined，则清空该属性
    if (node.style && node.style[styleProperty] !== undefined) {
        node.style[styleProperty] = '';
    }
}

// 移除截断样式
export function smashTruncationStyle(node: any) {
    // 1. 先调用 checkAndRemoveStyle 移除 webkitLineClamp 属性
    // 2. 将节点的相关样式设为 'unset'
    checkAndRemoveStyle(node, 'webkitLineClamp');
    node.style.webkitLineClamp = 'unset';
    node.style.maxHeight = 'unset';
}