// Listen for extension icon clicks
chrome.action.onClicked.addListener((tab) => {
    // 发送toggle消息，切换侧边栏显示状态
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' }, (response) => {
        // 忽略错误
        if (chrome.runtime.lastError) {
            console.debug('Could not send toggle message to tab:', tab.id, chrome.runtime.lastError);
        }
    });
});

// 监听标签页变化
chrome.tabs.onCreated.addListener(() => {
    notifyTabsChanged();
});

chrome.tabs.onRemoved.addListener(() => {
    notifyTabsChanged();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
        notifyTabsChanged();
    }
});

chrome.tabs.onActivated.addListener(() => {
    notifyTabsChanged();
});

// 通知所有标签页标签页状态变化
function notifyTabsChanged() {
    try {
        chrome.tabs.query({}, (tabs) => {
            if (chrome.runtime.lastError) {
                console.warn('Error querying tabs:', chrome.runtime.lastError);
                return;
            }

            if (!tabs || !Array.isArray(tabs)) {
                console.warn('No tabs found or invalid tabs array');
                return;
            }

            tabs.forEach(tab => {
                if (!tab || !tab.id) return;

                try {
                    chrome.tabs.sendMessage(tab.id, { action: 'tabsChanged' }, (response) => {
                        // 检查是否有错误，但不需要处理
                        if (chrome.runtime.lastError) {
                            // 忽略不能发送消息的标签页
                            // console.debug('Could not send message to tab:', tab.id, chrome.runtime.lastError);
                        }
                    });
                } catch (e) {
                    // 忽略不能发送消息的标签页
                    console.debug('Error sending message to tab:', e);
                }
            });
        });
    } catch (error) {
        console.error('Error in notifyTabsChanged:', error);
    }
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (!request || !request.action) {
            console.warn('Invalid message received');
            return;
        }

        if (request.action === 'openUrl') {
            if (!request.url) {
                console.warn('No URL provided for openUrl action');
                return;
            }
            chrome.tabs.create({ url: request.url });
        } else if (request.action === 'switchOrOpenUrl') {
        // 先检查是否有已打开的标签页，如果有则切换到该标签页
        chrome.tabs.query({}, (tabs) => {
            const url = request.url;
            try {
                const urlObj = new URL(url);
                const domain = urlObj.hostname;

                console.log(`Trying to find tab for domain: ${domain}`);

                // 先尝试找到完全匹配的URL
                let matchingTab = tabs.find(tab => tab.url === url);
                if (matchingTab) {
                    console.log(`Found exact URL match: ${matchingTab.url}`);
                }

                // 如果没有完全匹配的，尝试找到域名匹配的
                if (!matchingTab) {
                    matchingTab = tabs.find(tab => {
                        if (!tab.url) return false;

                        try {
                            const tabUrlObj = new URL(tab.url);
                            const isMatch = tabUrlObj.hostname === domain;
                            if (isMatch) {
                                console.log(`Found domain match: ${tab.url}`);
                            }
                            return isMatch;
                        } catch (e) {
                            console.warn(`Error parsing tab URL: ${tab.url}`, e);
                            return false;
                        }
                    });
                }

                if (matchingTab) {
                    // 如果找到匹配的标签页，切换到该标签页
                    console.log(`Switching to tab: ${matchingTab.id} (${matchingTab.url})`);
                    chrome.tabs.update(matchingTab.id, { active: true });
                    chrome.windows.update(matchingTab.windowId, { focused: true });
                    // 发送响应表示成功
                    sendResponse({ success: true, switched: true });
                } else {
                    // 如果没有找到匹配的标签页，打开新标签页
                    console.log(`No matching tab found, creating new tab for: ${url}`);
                    chrome.tabs.create({ url: url });
                    // 发送响应表示成功
                    sendResponse({ success: true, switched: false });
                }
            } catch (e) {
                // 如果出错，直接打开新标签页
                console.error(`Error in switchOrOpenUrl:`, e);
                chrome.tabs.create({ url: url });
                // 发送响应表示出错
                sendResponse({ success: false, error: e.message });
            }
        });
        return true; // 保持消息通道开放，允许异步响应
    } else if (request.action === 'getOpenTabs') {
        // 获取所有打开的标签页
        try {
            chrome.tabs.query({}, (tabs) => {
                if (chrome.runtime.lastError) {
                    console.warn('Error querying tabs:', chrome.runtime.lastError);
                    sendResponse({ tabs: [] });
                    return;
                }

                if (!tabs || !Array.isArray(tabs)) {
                    console.warn('Invalid tabs result');
                    sendResponse({ tabs: [] });
                    return;
                }

                // 过滤掉无效的标签页
                const validTabs = tabs.filter(tab => tab && tab.url);
                sendResponse({ tabs: validTabs });
            });
            return true; // 保持消息通道开放
        } catch (error) {
            console.error('Error in getOpenTabs:', error);
            sendResponse({ tabs: [] });
            return true;
        }
    } else if (request.action === 'updateShortcut') {
        // 广播新的快捷键设置到所有标签页
        try {
            if (!request.shortcut) {
                console.warn('No shortcut provided for updateShortcut action');
                return;
            }

            chrome.tabs.query({}, (tabs) => {
                if (chrome.runtime.lastError) {
                    console.warn('Error querying tabs:', chrome.runtime.lastError);
                    return;
                }

                if (!tabs || !Array.isArray(tabs)) {
                    console.warn('Invalid tabs result');
                    return;
                }

                tabs.forEach(tab => {
                    if (!tab || !tab.id) return;

                    try {
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'updateShortcut',
                            shortcut: request.shortcut
                        }, () => {
                            // 忽略错误
                            if (chrome.runtime.lastError) {
                                // 忽略不能发送消息的标签页
                            }
                        });
                    } catch (e) {
                        // 忽略不能发送消息的标签页
                    }
                });
            });
        } catch (error) {
            console.error('Error in updateShortcut:', error);
        }
    } else if (request.action === 'getFavicon') {
        (async () => {
            try {
                // 检查请求参数
                if (!request.domain) {
                    console.warn('No domain provided for getFavicon action');
                    sendResponse({ favicon: null, error: 'No domain provided' });
                    return;
                }

                // 首先尝试获取当前标签页的图标
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
                    .catch(error => {
                        console.warn('Error querying active tab:', error);
                        return [];
                    });

                const currentTab = tabs && tabs.length > 0 ? tabs[0] : null;
                const currentDomain = request.domain;

                // 如果当前标签页的域名与请求的域名匹配，并且有图标，则使用当前标签页的图标
                if (currentTab && currentTab.url && currentTab.favIconUrl) {
                    const tabDomain = new URL(currentTab.url).hostname;
                    if (tabDomain === currentDomain) {
                        try {
                            const response = await fetch(currentTab.favIconUrl);
                            const blob = await response.blob();
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                sendResponse({ favicon: reader.result });
                            };
                            reader.readAsDataURL(blob);
                            return;
                        } catch (error) {
                            console.error('Error fetching tab favicon:', error, response?.status);
                            // 如果获取失败，继续尝试其他方法
                        }
                    }
                }

                // 尝试在所有打开的标签页中查找匹配的域名
                const allTabs = await chrome.tabs.query({})
                    .catch(error => {
                        console.warn('Error querying all tabs:', error);
                        return [];
                    });

                if (!allTabs || !Array.isArray(allTabs)) {
                    console.warn('Invalid tabs result');
                    throw new Error('Failed to get tabs');
                }

                for (const tab of allTabs) {
                    if (tab.url && tab.favIconUrl) {
                        try {
                            const tabDomain = new URL(tab.url).hostname;
                            if (tabDomain === currentDomain) {
                                const response = await fetch(tab.favIconUrl);
                                const blob = await response.blob();
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    sendResponse({ favicon: reader.result });
                                };
                                reader.readAsDataURL(blob);
                                return;
                            }
                        } catch (error) {
                            console.error('Error checking tab:', error);
                        }
                    }
                }

                // 如果没有找到匹配的标签页图标，使用 Google 的 favicon 服务
                try {
                    const faviconUrl = `https://www.google.com/s2/favicons?sz=128&domain=${request.domain}`;
                    const response = await fetch(faviconUrl);

                    if (!response.ok) {
                        throw new Error(`Failed to fetch Google favicon: ${response.status} ${response.statusText}`);
                    }

                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        sendResponse({ favicon: reader.result });
                    };
                    reader.onerror = (error) => {
                        console.error('Error reading favicon blob:', error);
                        sendResponse({ favicon: null, error: 'Failed to read favicon data' });
                    };
                    reader.readAsDataURL(blob);
                } catch (error) {
                    console.error('Error fetching Google favicon:', error);
                    throw error; // 向上抛出错误，让外层catch处理
                }
            } catch (error) {
                console.error('Error in getFavicon:', error);

                // 如果所有方法都失败，尝试直接从网站获取
                try {
                    // 再次检查域名
                    if (!request.domain) {
                        console.warn('No domain available for direct favicon fetch');
                        sendResponse({ favicon: null, error: 'No domain provided' });
                        return;
                    }

                    const faviconUrl = `https://${request.domain}/favicon.ico`;
                    console.log('Trying direct favicon URL:', faviconUrl);

                    try {
                        const response = await fetch(faviconUrl, {
                            method: 'GET',
                            mode: 'cors',
                            cache: 'no-cache',
                            timeout: 3000 // 3秒超时
                        });

                        if (!response.ok) {
                            console.warn(`Direct favicon fetch failed: ${response.status} ${response.statusText}`);
                            sendResponse({ favicon: null, error: `HTTP error: ${response.status}` });
                            return;
                        }

                        const blob = await response.blob();
                        if (!blob || blob.size === 0) {
                            console.warn('Empty favicon blob received');
                            sendResponse({ favicon: null, error: 'Empty favicon' });
                            return;
                        }

                        const reader = new FileReader();
                        reader.onloadend = () => {
                            sendResponse({ favicon: reader.result });
                        };
                        reader.onerror = (error) => {
                            console.error('Error reading direct favicon blob:', error);
                            sendResponse({ favicon: null, error: 'Failed to read favicon data' });
                        };
                        reader.readAsDataURL(blob);
                        return;
                    } catch (fetchError) {
                        console.error('Error in direct favicon fetch:', fetchError);
                        throw fetchError;
                    }
                } catch (error) {
                    console.error('Error fetching direct favicon:', error);
                    // 所有方法都失败，返回默认图标
                    sendResponse({ favicon: null, error: error.message });
                }
            }
        })();
        return true; // Keep the message channel open for the async response
    } else if (request.action === 'translate') {
        (async () => {
            try {
                // 检测语言
                const hasChineseChar = /[\u4E00-\u9FFF]/.test(request.text);
                const sourceLang = hasChineseChar ? 'zh' : 'en';
                const targetLang = sourceLang === 'zh' ? 'en' : 'zh';

                // 使用Google翻译API
                const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(request.text)}`);
                const data = await response.json();
                sendResponse({ success: true, translation: data[0][0][0] });
            } catch (error) {
                console.error('Translation error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // 保持消息通道开放
    } else if (request.action === 'updateApps') {
        try {
            if (!request.apps) {
                console.warn('No apps provided for updateApps action');
                sendResponse({ success: false, error: 'No apps provided' });
                return true;
            }

            chrome.storage.local.set({ apps: request.apps }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error saving apps:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message || 'Error saving apps' });
                } else {
                    sendResponse({ success: true });
                }
            });
            return true; // 保持消息通道开放，允许异步响应
        } catch (error) {
            console.error('Error in updateApps:', error);
            sendResponse({ success: false, error: error.message || 'Error processing updateApps request' });
            return true;
        }
    }
    } catch (error) {
        console.error('Error handling message:', error);
        // 如果需要响应，确保发送一个默认响应
        if (request && (request.action === 'getOpenTabs' || request.action === 'getFavicon' || request.action === 'translate')) {
            sendResponse({ error: error.message });
            return true; // 保持消息通道开放
        }
    }
});