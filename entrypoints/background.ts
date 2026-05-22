import {_service} from "@/entrypoints/service/_service";
import {config} from "@/entrypoints/utils/config";
import {CONTEXT_MENU_IDS} from "@/entrypoints/utils/constant";
import { storage } from '@wxt-dev/storage';
import { WeightedLoadBalancer, isRateLimitError } from "@/entrypoints/utils/loadBalancer";

// 翻译状态管理
let translationStateMap = new Map<number, boolean>(); // tabId -> isTranslated
const loadBalancer = new WeightedLoadBalancer(60000);

function getMainDomainFromUrl(url?: string): string {
    if (!url) return '';
    try {
        const noProtocol = url.replace(/^(https?:\/\/)/, '');
        const hostname = noProtocol.split('/')[0].replace(/^www\./, '');
        const parts = hostname.split('.');
        if (parts.length >= 3 &&
            ((parts[parts.length - 2] === 'co' || parts[parts.length - 2] === 'com') &&
                parts[parts.length - 1].length === 2)) {
            return parts.slice(-3).join('.');
        }
        if (parts.length >= 2) {
            return parts.slice(-2).join('.');
        }
        return hostname;
    } catch (error) {
        console.error('getMainDomainFromUrl error:', error);
        return '';
    }
}

async function updateBlacklist(mainDomain: string, shouldAdd: boolean) {
    if (!mainDomain) return;
    const value = await storage.getItem('local:config');
    const parsed = typeof value === 'string' && value ? JSON.parse(value) : {};
    const list = Array.isArray(parsed.blockedMainDomains) ? parsed.blockedMainDomains : [];
    const next = shouldAdd
        ? Array.from(new Set([...list, mainDomain]))
        : list.filter((item: string) => item !== mainDomain);

    parsed.blockedMainDomains = next;
    
    // 如果加入黑名单，从白名单中移出
    if (shouldAdd) {
        const whitelist = Array.isArray(parsed.allowedMainDomains) ? parsed.allowedMainDomains : [];
        parsed.allowedMainDomains = whitelist.filter((item: string) => item !== mainDomain);
    }

    Object.assign(config, parsed);
    await storage.setItem('local:config', JSON.stringify(parsed));
}

async function updateWhitelist(mainDomain: string, shouldAdd: boolean) {
    if (!mainDomain) return;
    const value = await storage.getItem('local:config');
    const parsed = typeof value === 'string' && value ? JSON.parse(value) : {};
    const list = Array.isArray(parsed.allowedMainDomains) ? parsed.allowedMainDomains : [];
    const next = shouldAdd
        ? Array.from(new Set([...list, mainDomain]))
        : list.filter((item: string) => item !== mainDomain);

    parsed.allowedMainDomains = next;

    // 如果加入白名单，从黑名单中移出
    if (shouldAdd) {
        const blacklist = Array.isArray(parsed.blockedMainDomains) ? parsed.blockedMainDomains : [];
        parsed.blockedMainDomains = blacklist.filter((item: string) => item !== mainDomain);
    }

    Object.assign(config, parsed);
    await storage.setItem('local:config', JSON.stringify(parsed));
}

/**
 * 在background脚本中调用微软翻译API（避免Firefox CORS问题）
 */
async function translateWithMicrosoftInBackground(text: string, targetLang: string): Promise<string> {
    try {
        // 获取微软翻译的JWT令牌
        const jwtToken = await refreshMicrosoftTokenInBackground();
        
        // 调用微软翻译API
        const response = await fetch(`https://api-edge.cognitive.microsofttranslator.com/translate?from=&to=${targetLang}&api-version=3.0&includeSentenceLength=true&textType=html`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + jwtToken
            },
            body: JSON.stringify([{Text: text}])
        });

        if (response.ok) {
            const result = await response.json();
            return result[0].translations[0].text;
        } else {
            throw new Error(`微软翻译失败: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        console.error('微软翻译请求失败:', error);
        throw error;
    }
}

/**
 * 在background脚本中刷新微软翻译令牌
 */
async function refreshMicrosoftTokenInBackground(): Promise<string> {
    try {
        const response = await fetch("https://edge.microsoft.com/translate/auth");
        if (response.ok) {
            return await response.text();
        } else {
            throw new Error(`获取微软翻译令牌失败: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        console.error('获取微软翻译令牌失败:', error);
        throw error;
    }
}

export default defineBackground({
    persistent: {
        safari: false,
    },
    main() {
        // 创建右键菜单项
        try {
            // 创建父菜单
            browser.contextMenus.create({
                id: 'fluentread-parent',
                title: 'FluentRead',
                contexts: ['page', 'selection'],
            });
            
            // 创建全文翻译子菜单
            browser.contextMenus.create({
                id: CONTEXT_MENU_IDS.TRANSLATE_FULL_PAGE,
                title: '全文翻译',
                parentId: 'fluentread-parent',
                contexts: ['page', 'selection'],
            });
            
            // 创建撤销翻译子菜单
            browser.contextMenus.create({
                id: CONTEXT_MENU_IDS.RESTORE_ORIGINAL,
                title: '撤销翻译',
                parentId: 'fluentread-parent',
                contexts: ['page', 'selection'],
                enabled: false, // 初始状态为禁用
            });

            browser.contextMenus.create({
                id: CONTEXT_MENU_IDS.ADD_TO_BLACKLIST,
                title: '从不翻译此域名',
                parentId: 'fluentread-parent',
                contexts: ['page', 'selection'],
            });

            browser.contextMenus.create({
                id: CONTEXT_MENU_IDS.REMOVE_FROM_BLACKLIST,
                title: '恢复默认智能翻译（从黑名单移除）',
                parentId: 'fluentread-parent',
                contexts: ['page', 'selection'],
            });

            browser.contextMenus.create({
                id: CONTEXT_MENU_IDS.ADD_TO_WHITELIST,
                title: '总是自动翻译此域名',
                parentId: 'fluentread-parent',
                contexts: ['page', 'selection'],
            });

            browser.contextMenus.create({
                id: CONTEXT_MENU_IDS.REMOVE_FROM_WHITELIST,
                title: '恢复默认智能翻译（从白名单移除）',
                parentId: 'fluentread-parent',
                contexts: ['page', 'selection'],
            });
        } catch (error) {
            console.error('Error setting up context menu:', error);
        }

        // 监听右键菜单点击事件
        browser.contextMenus.onClicked.addListener((info: any, tab: any) => {
            if (!tab?.id) return;
            
            if (info.menuItemId === CONTEXT_MENU_IDS.TRANSLATE_FULL_PAGE) {
                // 发送消息到内容脚本触发全文翻译
                browser.tabs.sendMessage(tab.id, {
                    type: 'contextMenuTranslate',
                    action: 'fullPage'
                }).then(() => {
                    // 更新翻译状态
                    translationStateMap.set(tab.id!, true);
                    updateContextMenus(tab.id!);
                }).catch((error: any) => {
                    console.error('Failed to send message to content script:', error);
                });
            } else if (info.menuItemId === CONTEXT_MENU_IDS.RESTORE_ORIGINAL) {
                // 发送消息到内容脚本撤销翻译
                browser.tabs.sendMessage(tab.id, {
                    type: 'contextMenuTranslate',
                    action: 'restore'
                }).then(() => {
                    // 更新翻译状态
                    translationStateMap.set(tab.id!, false);
                    updateContextMenus(tab.id!);
                }).catch((error: any) => {
                    console.error('Failed to send message to content script:', error);
                });
            } else if (info.menuItemId === CONTEXT_MENU_IDS.ADD_TO_BLACKLIST) {
                const mainDomain = getMainDomainFromUrl(tab.url);
                updateBlacklist(mainDomain, true).then(() => {
                    browser.tabs.sendMessage(tab.id, {
                        type: 'contextMenuTranslate',
                        action: 'restore'
                    }).catch(() => {
                        // 忽略发送失败
                    });
                }).catch((error: any) => {
                    console.error('Failed to update blacklist:', error);
                });
            } else if (info.menuItemId === CONTEXT_MENU_IDS.REMOVE_FROM_BLACKLIST) {
                const mainDomain = getMainDomainFromUrl(tab.url);
                updateBlacklist(mainDomain, false).catch((error: any) => {
                    console.error('Failed to update blacklist:', error);
                });
            } else if (info.menuItemId === CONTEXT_MENU_IDS.ADD_TO_WHITELIST) {
                const mainDomain = getMainDomainFromUrl(tab.url);
                updateWhitelist(mainDomain, true).then(() => {
                    browser.tabs.sendMessage(tab.id, {
                        type: 'contextMenuTranslate',
                        action: 'fullPage'
                    }).catch(() => {});
                }).catch((error: any) => {
                    console.error('Failed to update whitelist:', error);
                });
            } else if (info.menuItemId === CONTEXT_MENU_IDS.REMOVE_FROM_WHITELIST) {
                const mainDomain = getMainDomainFromUrl(tab.url);
                updateWhitelist(mainDomain, false).catch((error: any) => {
                    console.error('Failed to update whitelist:', error);
                });
            }
        });

        // 更新右键菜单状态
        const updateContextMenus = async (tabId: number) => {
            const isTranslated = translationStateMap.get(tabId) || false;
            
            try {
                // 更新全文翻译菜单项
                browser.contextMenus.update(CONTEXT_MENU_IDS.TRANSLATE_FULL_PAGE, {
                    enabled: !isTranslated,
                    title: isTranslated ? '全文翻译 (已翻译)' : '全文翻译'
                });
                
                // 更新撤销翻译菜单项
                browser.contextMenus.update(CONTEXT_MENU_IDS.RESTORE_ORIGINAL, {
                    enabled: isTranslated,
                    title: isTranslated ? '撤销翻译' : '撤销翻译 (无翻译)'
                });

                // 获取当前 tab 网址以决定白名单/黑名单显示
                const tab = await browser.tabs.get(tabId);
                const mainDomain = getMainDomainFromUrl(tab?.url);
                
                // 判断当前自动翻译范围模式
                const isWhitelistMode = config.autoTranslateMode === 'whitelist';

                if (mainDomain) {
                    const isBlocked = config.blockedMainDomains?.includes(mainDomain);
                    const isAllowed = config.allowedMainDomains?.includes(mainDomain);
                    
                    // 黑名单菜单控制
                    browser.contextMenus.update(CONTEXT_MENU_IDS.ADD_TO_BLACKLIST, {
                        visible: !isWhitelistMode, // 如果是白名单模式，则隐藏“从不翻译”
                        enabled: !isBlocked,
                        title: isBlocked ? '已加入从不翻译名单' : '从不翻译此域名'
                    });
                    
                    browser.contextMenus.update(CONTEXT_MENU_IDS.REMOVE_FROM_BLACKLIST, {
                        visible: !isWhitelistMode, // 如果是白名单模式，则隐藏
                        enabled: isBlocked
                    });
                    
                    // 白名单菜单控制
                    browser.contextMenus.update(CONTEXT_MENU_IDS.ADD_TO_WHITELIST, {
                        enabled: !isAllowed,
                        title: isAllowed 
                            ? (isWhitelistMode ? '已加入检测白名单' : '已加入总是翻译名单') 
                            : (isWhitelistMode ? '在此域名开启智能检测' : '总是自动翻译此域名')
                    });
                    
                    browser.contextMenus.update(CONTEXT_MENU_IDS.REMOVE_FROM_WHITELIST, {
                        enabled: isAllowed,
                        title: isWhitelistMode ? '在此域名关闭智能检测' : '恢复默认智能翻译（从白名单移除）'
                    });
                }
            } catch (error) {
                console.error('Failed to update context menus:', error);
            }
        };

        // 监听标签页切换事件，更新菜单状态
        browser.tabs.onActivated.addListener((activeInfo: any) => {
            updateContextMenus(activeInfo.tabId);
        });

        // 监听标签页更新事件（页面刷新等）
        browser.tabs.onUpdated.addListener((tabId: any, changeInfo: any) => {
            if (changeInfo.status === 'complete') {
                // 页面加载完成，重置翻译状态
                translationStateMap.set(tabId, false);
                updateContextMenus(tabId);
            }
        });

        // 监听标签页关闭事件，清理状态
        browser.tabs.onRemoved.addListener((tabId: any) => {
            translationStateMap.delete(tabId);
        });

        // 监听配置改变，刷新当前活动标签页的菜单
        storage.watch('local:config', async () => {
            try {
                const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                const activeTab = tabs[0];
                if (activeTab?.id) {
                    updateContextMenus(activeTab.id);
                }
            } catch (err) {
                console.error('Failed to update context menus on config change:', err);
            }
        });

        // 处理翻译请求
        browser.runtime.onMessage.addListener((message: any) => {
            return new Promise(async (resolve, reject) => {
                try {
                    // 处理输入框翻译请求
                    if (message.type === 'inputBoxTranslation') {
                        const translatedText = await translateWithMicrosoftInBackground(message.text, message.targetLang);
                        resolve({ success: true, translatedText });
                        return;
                    }
                    
                    // 处理普通翻译请求（支持同一 service 多Key 加权轮询 + 60s 冷却）
                    const service = config.service;
                    const rawToken = config.token?.[service];
                    const pool = config.loadBalanceEnabled ? loadBalancer.parseTokenPool(rawToken) : [];

                    if (!config.loadBalanceEnabled || pool.length <= 1) {
                        _service[service](message)
                            .then(resp => resolve(resp))
                            .catch(error => reject(error));
                        return;
                    }

                    const tried = new Set<string>();
                    let lastError: any;
                    for (let attempt = 0; attempt < pool.length; attempt++) {
                        const token = loadBalancer.chooseToken({ service, config, pool, tried });
                        if (!token) break;
                        tried.add(token);

                        try {
                            const resp = await _service[service]({
                                ...message,
                                __fr: { ...(message?.__fr || {}), token }
                            });
                            resolve(resp);
                            return;
                        } catch (error) {
                            lastError = error;
                            if (isRateLimitError(error)) {
                                loadBalancer.markRateLimited({
                                    service,
                                    token,
                                    cooldownMs: config.loadBalanceCooldownMs || 60000,
                                });
                                continue; // 换下一个 key
                            }
                            reject(error);
                            return;
                        }
                    }

                    reject(lastError ?? new Error('翻译失败：所有 Key 均不可用（可能处于冷却中）'));
                } catch (error) {
                    resolve({ success: false, error: error instanceof Error ? error.message : String(error) });
                }
            });
        });
    }
});
