// Listen for extension icon clicks
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
});

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openUrl') {
        chrome.tabs.create({ url: request.url });
    } else if (request.action === 'updateShortcut') {
        // 广播新的快捷键设置到所有标签页
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updateShortcut',
                    shortcut: request.shortcut
                }).catch(() => {
                    // 忽略不能发送消息的标签页
                });
            });
        });
    } else if (request.action === 'getFavicon') {
        (async () => {
            try {
                // 首先尝试获取当前标签页的图标
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                const currentTab = tabs[0];
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
                const allTabs = await chrome.tabs.query({});
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
                const faviconUrl = `https://www.google.com/s2/favicons?sz=128&domain=${request.domain}`;
                const response = await fetch(faviconUrl);
                const blob = await response.blob();
                const reader = new FileReader();
                reader.onloadend = () => {
                    sendResponse({ favicon: reader.result });
                };
                reader.readAsDataURL(blob);
            } catch (error) {
                console.error('Error in getFavicon:', error);
                
                // 如果所有方法都失败，尝试直接从网站获取
                try {
                    const faviconUrl = `https://${request.domain}/favicon.ico`;
                    const response = await fetch(faviconUrl);
                    if (response.ok) {
                        const blob = await response.blob();
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            sendResponse({ favicon: reader.result });
                        };
                        reader.readAsDataURL(blob);
                        return;
                    }
                    sendResponse({ favicon: null });
                } catch (error) {
                    console.error('Error fetching direct favicon:', error);
                    sendResponse({ favicon: null });
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
    }
});
