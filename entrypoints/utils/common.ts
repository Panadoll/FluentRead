// 防抖限流函数，可传递参数
import {franc} from "franc-min";

// 防抖限流函数，可传递参数
export function throttle(fn: (...args: any[]) => void, interval: number) {
    let last = 0; // 维护上次执行的时间
    return function (this: any, ...args: any[]) {
        const now = Date.now();
        // 只有当前时间与上次执行时间差大于等于间隔时才执行
        if (now - last >= interval) {
            last = now;
            fn.apply(this, args);  // 使用 apply 来传递参数数组
        }
    };
}

import { config } from "./config";

// 输出标准的语言类型，franc 只返回最可信的结果，francAll 返回所有结果并包含确信度
export function detectlang(origin: string): string {
    // 移除文本中的 URL 以免干扰语言识别
    // 1. 匹配带有 http:// 或 https:// 的完整 URL
    let cleanText = origin.replace(/https?:\/\/\S+/gi, '');
    
    // 2. 匹配没有 http 协议头的常见域名格式网址 (例如: qt.io/blog/xxx)
    cleanText = cleanText.replace(/(?:[a-zA-Z0-9][-a-zA-Z0-9]{0,62}\.)+(?:com|cn|net|org|io|gov|edu|co|info|me|cc|tv|xyz|top|blog|jp|kr|tw|hk)(?:\/\S*)?/gi, '');
    
    // 3. 检查过滤网址后是否还剩下实际需要检测语言的文本字符（包含汉字、英文字母、日文、韩文、俄文等）
    const hasText = /[a-zA-Z\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(cleanText);
    
    if (!hasText) {
        // 如果清洗后只剩下纯网址/数字/标点等，认为该文本的语言就是当前目标语言，从而跳过翻译
        return config.to;
    }

    const find = franc(cleanText, {minLength: 0});
    // 返回对应的标准语言代码
    switch (find) {
        case "cmn":
            return "zh-Hans";
        case "eng":
            return "en";
        case "jpn":
            return "ja";
        case "kor":
            return "ko";
        case "fra":
            return "fr";
        case "rus":
            return "ru";
        default:
            return find; // 返回其他语言的识别结果
    }
}

// 获取触摸点的中心位置
export function getCenterPoint(touches: TouchList, point: number): { x: number, y: number } | undefined {
    // 检查触摸点数量是否等于指定的数量
    if (touches.length !== point) return;

    let centerX = 0;
    let centerY = 0;
    // 累加所有触摸点的坐标
    for (let i = 0; i < touches.length; i++) {
        centerX += touches[i].clientX;
        centerY += touches[i].clientY;
    }
    // 计算中心点坐标
    centerX /= touches.length;
    centerY /= touches.length;

    return {x: centerX, y: centerY};
}

// 按 selector 查找匹配的元素，返回匹配的元素或 false
export function findMatchingElement(element: Element, selector: string): Element | false {
    // 检查当前元素是否匹配传入的选择器
    if (element.matches(selector)) return element;

    // 遍历父元素，直到找到匹配的元素或没有父元素
    let parent = element.parentElement;
    while (parent) {
        if (parent.matches(selector)) return parent;
        parent = parent.parentElement;
    }

    return false; // 未找到匹配元素
}

// 判定该文本节点是否应跳过翻译
export function shouldSkipNodeTranslation(text: string, targetLang: string): boolean {
    if (!text) return true;
    
    const cleanedText = text.replace(/[\s\u3000]/g, '');
    if (!cleanedText) return true;

    // 1. 如果目标语言是中文（简体或繁体），且待翻译文本已经含有一定比例的汉字，则跳过翻译
    // 注意：需排除日语（含有平假名/片假名）和韩语（含有韩文谚文），因为日韩语中也使用汉字，会干扰占比判定
    const isTargetChinese = targetLang.startsWith('zh') || targetLang === 'cmn';
    if (isTargetChinese) {
        const hasJapaneseKana = /[\u3040-\u309f\u30a0-\u30ff]/.test(cleanedText);
        const hasKoreanHangul = /[\uac00-\ud7af]/.test(cleanedText);
        
        if (!hasJapaneseKana && !hasKoreanHangul) {
            const chineseMatches = cleanedText.match(/[\u4e00-\u9fff]/g);
            const chineseCount = chineseMatches ? chineseMatches.length : 0;
            const chineseRatio = chineseCount / cleanedText.length;
            
            // 只要包含汉字且汉字比例达到 10% 以上，就判定为中文，不进行翻译
            if (chineseCount >= 1 && chineseRatio >= 0.10) {
                return true;
            }
        }
    }

    // 2. 传统语言检测：如果检测出的语言等于目标语言，跳过翻译
    const detected = detectlang(cleanedText);
    if (detected === targetLang) {
        return true;
    }
    
    // 如果目标语言和检测语言都属于中文体系
    if (isTargetChinese && (detected.startsWith('zh') || detected === 'cmn')) {
        return true;
    }

    return false;
}