export const services = {
    microsoft: "microsoft",
    google: "google",
    custom: "custom",
};

export const servicesType = {
    machine: new Set([services.microsoft, services.google]),
    AI: new Set([services.custom]),
    useToken: new Set([]),
    useModel: new Set([services.custom]),
    useProxy: new Set([services.google]),
    useCustomUrl: new Set([services.custom]),

    isMachine: (service: string) => servicesType.machine.has(service),
    isAI: (service: string) => servicesType.AI.has(service),
    isUseToken: (service: string) => servicesType.useToken.has(service),
    isUseProxy: (service: string) => servicesType.useProxy.has(service),
    isUseModel: (service: string) => servicesType.useModel.has(service),
    isCustom: (service: string) => service === services.custom,
    isUseCustomUrl: (service: string) => servicesType.useCustomUrl.has(service),
};

export const customModelString = "自定义模型";
export const models = new Map<string, Array<string>>([
    [services.custom, ["llama3", "llama2:7b", "qwen2.5:7b", "gemma:7b", customModelString]],
]);

export const options = {
    on: [
        {value: true, label: "开启"},
        {value: false, label: "关闭"},
    ],
    // 是否即时翻译
    autoTranslate: [
        {value: true, label: "开启"},
        {value: false, label: "关闭"},
    ],
    // 是否使用缓存
    useCache: [
        {value: true, label: "开启"},
        {value: false, label: "关闭"},
    ],
    form: [{value: "auto", label: "自动检测"}],
    to: [
        {value: "zh-Hans", label: "中文"},
        {value: "en", label: "英语"},
        {value: "ja", label: "日语"},
        {value: "ko", label: "韩语"},
        {value: "fr", label: "法语"},
        {value: "ru", label: "俄语"},
    ],
    keys: [
        {value: "none", label: "禁用快捷键"},

        {value: "Computer", label: "键盘选项", disabled: true},
        {value: "Control", label: "Ctrl"},
        {value: "Alt", label: "Alt"},
        {value: "Shift", label: "Shift"},
        {value: "Escape", label: "ESC"},
        {value: "`", label: "波浪号键"},

        {value: "mouse", label: "鼠标选项", disabled: true},
        {value: "DoubleClick", label: "鼠标双击"},
        {value: "LongPress", label: "鼠标长按"},
        {value: "MiddleClick", label: "鼠标滚轮单击"},

        {value: "touchscreen", label: "触屏设备选项", disabled: true},
        {value: "TwoFinger", label: "双指翻译"},
        {value: "ThreeFinger", label: "三指翻译"},
        {value: "FourFinger", label: "四指翻译"},
        {value: "DoubleClickScree", label: "双击翻译"},
        {value: "TripleClickScree", label: "三击翻译"},
        
        {value: "custom", label: "自定义快捷键（测试版）"},
    ],
    services: [
        {value: services.microsoft, label: "微软翻译"},
        {value: services.google, label: "谷歌翻译"},
        {value: services.custom, label: "本地模型 (Ollama)"},
    ],
    display: [
        {value: 1, label: "双语对照模式"},
    ],
    // 双语翻译样式
    styles: [
        {value: 0, label: "朴素模式", class: "fluent-display-default"},
    ],
    // 悬浮球快捷键选项
    floatingBallHotkeys: [
        {value: "none", label: "禁用快捷键"},
        {value: "Alt+T", label: "Alt+T / Option+T (默认)"},
        {value: "Alt+A", label: "Alt+A / Option+A"},
        {value: "Alt+S", label: "Alt+S / Option+S"},
        {value: "Alt+D", label: "Alt+D / Option+D"},
        {value: "Alt+Q", label: "Alt+Q / Option+Q"},
        {value: "Ctrl+Shift+T", label: "Ctrl+Shift+T / Control+Shift+T"},
        {value: "Ctrl+Shift+A", label: "Ctrl+Shift+A / Control+Shift+A"},
        {value: "F9", label: "F9"},
        {value: "F10", label: "F10"},
        {value: "F11", label: "F11"},
        {value: "F12", label: "F12"},
        {value: "custom", label: "自定义快捷键（测试版）"},
    ],
    theme: [
        {value: "auto", label: "跟随操作系统"},
        {value: "light", label: "亮色主题"},
        {value: "dark", label: "暗色主题"},
    ],
    // 输入框翻译目标语言选项
    inputBoxTranslationTarget: [
        {value: "zh-Hans", label: "中文"},
        {value: "en", label: "英语"},
        {value: "ja", label: "日语"},
        {value: "ko", label: "韩语"},
        {value: "fr", label: "法语"},
        {value: "ru", label: "俄语"},
        {value: "es", label: "西班牙语"},
        {value: "de", label: "德语"},
        {value: "pt", label: "葡萄牙语"},
        {value: "it", label: "意大利语"},
    ],
    // 输入框翻译触发方式选项
    inputBoxTranslationTrigger: [
        {value: "disabled", label: "关闭"},
        {value: "triple_space", label: "连按三下空格"},
        {value: "triple_equal", label: "连按三下等号(=)"},
        {value: "triple_dash", label: "连按三下短横线(-)"},
    ],
};

export const defaultOption = {
    on: true,
    from: "auto",
    to: "zh-Hans",
    style: 0,
    display: 1,
    hotkey: "Control",
    service: services.microsoft,
    custom: "http://localhost:11434/v1/chat/completions",
    deeplx: "http://localhost:1188/translate",
    system_role:
        "You are a professional, authentic machine translation engine.",
    user_role: `Translate the following text into {{to}}, If translation is unnecessary (e.g. proper nouns, codes, etc.), return the original text. NO explanations. NO notes:

{{origin}}`,
    count: 0,
    useCache: true,
    floatingBallHotkey: "Alt+T", // 默认悬浮球快捷键
    inputBoxTranslationTrigger: "disabled", // 默认关闭输入框翻译
    inputBoxTranslationTarget: "en", // 默认翻译成英文
};

