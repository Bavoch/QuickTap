// Listen for extension icon clicks
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
});

// Listen for URL open requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openUrl') {
        chrome.tabs.create({ url: request.url });
    }
});
