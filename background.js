// Listen for extension icon clicks
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
});

// Listen for URL open requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openUrl') {
        chrome.tabs.create({ url: request.url });
    } else if (request.action === 'getFavicon') {
        // 首先尝试获取当前标签页的图标
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            try {
                if (tabs[0] && tabs[0].favIconUrl) {
                    // 如果标签页有图标，直接使用
                    const response = await fetch(tabs[0].favIconUrl);
                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        sendResponse({ favicon: reader.result });
                    };
                    reader.readAsDataURL(blob);
                } else {
                    // 如果标签页没有图标，使用 Google 的 favicon 服务
                    const faviconUrl = `https://www.google.com/s2/favicons?sz=128&domain=${request.domain}`;
                    const response = await fetch(faviconUrl);
                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        sendResponse({ favicon: reader.result });
                    };
                    reader.readAsDataURL(blob);
                }
            } catch (error) {
                console.error('Error fetching favicon:', error);
                // 如果获取失败，使用 Google 的 favicon 服务作为备选
                try {
                    const faviconUrl = `https://www.google.com/s2/favicons?sz=128&domain=${request.domain}`;
                    const response = await fetch(faviconUrl);
                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        sendResponse({ favicon: reader.result });
                    };
                    reader.readAsDataURL(blob);
                } catch (backupError) {
                    console.error('Error fetching backup favicon:', backupError);
                    sendResponse({ favicon: null });
                }
            }
        });
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
