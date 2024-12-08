// Listen for extension icon clicks
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
});

// Listen for URL open requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openUrl') {
        chrome.tabs.create({ url: request.url });
    } else if (request.action === 'getFavicon') {
        const faviconUrl = `https://www.google.com/s2/favicons?sz=128&domain=${request.domain}`;
        fetch(faviconUrl)
            .then(response => response.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    sendResponse({ favicon: reader.result });
                };
                reader.readAsDataURL(blob);
            })
            .catch(error => {
                console.error('Error fetching favicon:', error);
                sendResponse({ favicon: null });
            });
        return true; // Keep the message channel open for the async response
    }
});
