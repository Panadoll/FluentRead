// 消息模板工具
import { customModelString, defaultOption, services } from "./option";
import {config} from "@/entrypoints/utils/config";

// 语言代码到语言名称的映射（用于更明确的 prompt）
const languageNameMap: { [key: string]: string } = {
    'zh-Hans': 'Simplified Chinese (简体中文)',
    'zh-Hant': 'Traditional Chinese (繁體中文)',
    'en': 'English',
    'ja': 'Japanese (日本語)',
    'ko': 'Korean (한국어)',
    'fr': 'French (Français)',
    'ru': 'Russian (Русский)',
    'es': 'Spanish (Español)',
    'de': 'German (Deutsch)',
    'it': 'Italian (Italiano)',
    'pt': 'Portuguese (Português)',
    'ar': 'Arabic (العربية)',
    'hi': 'Hindi (हिन्दी)',
    'th': 'Thai (ไทย)',
    'vi': 'Vietnamese (Tiếng Việt)',
};

// 获取目标语言的明确名称
function getTargetLanguageName(langCode: string): string {
    return languageNameMap[langCode] || langCode;
}

// openai 格式的消息模板（通用模板）
export function commonMsgTemplate(origin: string) {
    // 检测是否使用自定义模型
    let model = config.model[config.service] === customModelString ? config.customModel[config.service] : config.model[config.service]

    // 删除模型名称中的中文括号及其内容，如"gpt-4（推荐）" -> "gpt-4"
    model = model.replace(/（.*）/g, "");

    // 获取目标语言的明确名称
    const targetLangName = getTargetLanguageName(config.to);
    
    // 改进的 system prompt：明确指定目标语言
    let system = config.system_role[config.service] || defaultOption.system_role;
    // 如果是自定义服务（Ollama），使用更明确的 system prompt
    if (config.service === services.custom) {
        system = `You are a professional machine translation engine. Your task is to translate text into ${targetLangName}. You MUST only return the translated text in ${targetLangName}, no explanations, no notes, no other languages.`;
    }
    
    // 改进的 user prompt：使用明确的语言名称，并强调目标语言
    let userTemplate = config.user_role[config.service] || defaultOption.user_role;
    // 对于自定义服务，使用更强调的 prompt
    if (config.service === services.custom) {
        userTemplate = `Translate the following text into ${targetLangName}. IMPORTANT: Output MUST be in ${targetLangName} only. If translation is unnecessary (e.g. proper nouns, codes, etc.), return the original text. Return ONLY the translation, no explanations, no notes:

{{origin}}`;
    }
    let user = userTemplate
        .replace('{{to}}', targetLangName)  // 使用明确的语言名称而不是代码
        .replace('{{origin}}', origin);

    return JSON.stringify({
        'model': model,
        // 本地模型更容易“跑偏”，用更低温度提升稳定性
        "temperature": config.service === services.custom ? 0 : 1.0,
        'messages': [
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': user},
        ]
    })
}
