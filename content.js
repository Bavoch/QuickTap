class QuickTap {
    constructor() {
        this.popup = null;
        this.searchBox = null;
        this.appList = null;
        this.contextMenu = null;
        this.editModal = null;
        this.currentAppIndex = null;
        this.shortcut = { key: 'z', ctrl: false, alt: false, shift: false };
        this.isDragging = false; // 新增属性
        this.init();

        // Make instance available globally for error handling
        window.quickTap = this;
    }

    init() {
        // Load shortcut settings
        chrome.storage.sync.get(['shortcut'], (result) => {
            if (result.shortcut) {
                this.shortcut = result.shortcut;
            }
        });

        // Create popup container
        this.popup = document.createElement('div');
        this.popup.className = 'quicktap-popup';
        this.popup.innerHTML = `
            <div class="quicktap-container">
                <div class="quicktap-search-container">
                    <input type="text" class="quicktap-search" placeholder="搜索、翻译或输入网址">
                    <div class="loading-spinner"></div>
                </div>
                <div class="quicktap-apps">
                    <div class="app-list-container">
                        <div class="app-list"></div>
                        <button class="add-app-btn">+</button>
                    </div>
                </div>
            </div>
            <style>
                .quicktap-apps {
                    padding: 10px;
                }
                .app-list-container {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    align-items: center;
                }
                .app-list {
                    display: contents;
                }
                .app-icon {
                    flex: 0 0 auto;
                }
                .add-app-btn {
                    flex: 0 0 auto;
                    width: 48px;
                    height: 48px;
                    border-radius: 8px;
                    border: 2px dashed #ccc;
                    background: transparent;
                    color: #666;
                    font-size: 24px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                    margin: 0;
                }
                .add-app-btn:hover {
                    border-color: #999;
                    color: #999;
                }
            </style>
        `;

        // Add popup to document
        document.body.appendChild(this.popup);

        // Store references to elements
        this.searchBox = this.popup.querySelector('.quicktap-search');
        this.loadingSpinner = this.popup.querySelector('.loading-spinner');

        // Add keyboard event listener
        document.addEventListener('keydown', (e) => {
            // Skip if the active element is an input field
            if (document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA' || 
                document.activeElement.isContentEditable) {
                return;
            }
            
            // Check if the pressed keys match the shortcut
            if (e.key.toLowerCase() === this.shortcut.key &&
                e.ctrlKey === this.shortcut.ctrl &&
                e.altKey === this.shortcut.alt &&
                e.shiftKey === this.shortcut.shift) {
                e.preventDefault();
                this.togglePopup();
            }
        });

        // Create context menu
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu';
        this.contextMenu.style.display = 'none';
        this.contextMenu.innerHTML = `
            <div class="context-menu-item edit">
                <span>✏️ 编辑</span>
            </div>
            <div class="context-menu-item delete">
                <span>🗑️ 删除</span>
            </div>
        `;

        // Add context menu to document
        document.body.appendChild(this.contextMenu);

        // Create edit modal
        this.editModal = document.createElement('div');
        this.editModal.className = 'edit-app-modal';
        this.editModal.style.display = 'none';
        this.editModal.innerHTML = `
            <h3>编辑应用</h3>
            <div class="edit-app-icon" id="editAppIcon">
                <img src="" alt="应用图标">
                <div class="icon-context-menu" style="display: none;">
                    <div class="context-menu-item upload">
                        <span>📤 本地上传</span>
                    </div>
                    <div class="context-menu-item paste">
                        <span>📋 粘贴替换</span>
                    </div>
                    <div class="context-menu-item reset">
                        <span>🔄 重置图标</span>
                    </div>
                </div>
            </div>
            <input type="text" class="edit-title" placeholder="标题">
            <input type="text" class="edit-url" placeholder="网址">
            <div class="buttons">
                <button class="cancel-btn">取消</button>
                <button class="save-btn">保存</button>
            </div>
            <input type="file" id="iconUpload" accept="image/*" style="display: none;">
        `;

        // Add edit modal to document
        document.body.appendChild(this.editModal);

        // Add event listeners
        this.searchBox = this.popup.querySelector('.quicktap-search');
        this.searchBox.addEventListener('keydown', this.handleSearch.bind(this));
        
        const addAppBtn = this.popup.querySelector('.add-app-btn');
        addAppBtn.addEventListener('click', this.handleAddApp.bind(this));

        // Context menu event listeners
        this.contextMenu.querySelector('.edit').addEventListener('click', () => this.handleEdit());
        this.contextMenu.querySelector('.delete').addEventListener('click', () => this.handleDelete());

        // Edit modal event listeners
        this.editModal.querySelector('.save-btn').addEventListener('click', () => this.handleSaveEdit());
        this.editModal.querySelector('.cancel-btn').addEventListener('click', () => this.hideEditModal());

        // Add icon context menu event listeners
        const editAppIcon = this.editModal.querySelector('#editAppIcon');
        const iconContextMenu = this.editModal.querySelector('.icon-context-menu');
        const iconUpload = this.editModal.querySelector('#iconUpload');

        editAppIcon.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const rect = editAppIcon.getBoundingClientRect();
            iconContextMenu.style.display = 'block';
            iconContextMenu.style.left = `${e.clientX - rect.left}px`;
            iconContextMenu.style.top = `${e.clientY - rect.top}px`;
        });

        // Hide icon context menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!iconContextMenu.contains(e.target)) {
                iconContextMenu.style.display = 'none';
            }
        });

        // Handle local upload
        this.editModal.querySelector('.upload').addEventListener('click', () => {
            iconUpload.click();
            iconContextMenu.style.display = 'none';
        });

        iconUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = this.editModal.querySelector('.edit-app-icon img');
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        });

        // Handle paste replace
        this.editModal.querySelector('.paste').addEventListener('click', async () => {
            try {
                const clipboardItems = await navigator.clipboard.read();
                for (const clipboardItem of clipboardItems) {
                    for (const type of clipboardItem.types) {
                        if (type.startsWith('image/')) {
                            const blob = await clipboardItem.getType(type);
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                const img = this.editModal.querySelector('.edit-app-icon img');
                                img.src = e.target.result;
                            };
                            reader.readAsDataURL(blob);
                            break;
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to read clipboard contents: ', err);
            }
            iconContextMenu.style.display = 'none';
        });

        // Handle reset icon
        this.editModal.querySelector('.reset').addEventListener('click', async () => {
            const apps = await this.getApps();
            const app = apps[this.currentAppIndex];
            const img = this.editModal.querySelector('.edit-app-icon img');
            
            // Try to get the favicon from the URL
            const urlInput = this.editModal.querySelector('.edit-url');
            const url = this.autoCompleteUrl(urlInput.value.trim());
            if (url) {
                try {
                    const domain = new URL(url).hostname;
                    const faviconUrl = `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
                    img.src = faviconUrl;
                } catch (error) {
                    // If URL is invalid, generate default icon
                    const titleInput = this.editModal.querySelector('.edit-title');
                    img.src = this.generateDefaultIcon(titleInput.value);
                }
            }
            iconContextMenu.style.display = 'none';
        });

        // Close context menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.contextMenu.contains(e.target) && !e.target.closest('.app-icon')) {
                this.hideContextMenu();
            }
        });

        // Load saved apps
        this.loadApps();

        // Add input event listener to update loading position
        this.searchBox.addEventListener('input', () => {
            if (this.loadingSpinner.classList.contains('visible')) {
                this.updateLoadingPosition();
            }
        });
    }

    createAppIcon(app, index) {
        const container = document.createElement('a');
        container.href = app.url;
        container.className = 'app-icon';
        container.title = app.title;
        container.dataset.index = index;
        container.draggable = true; // 启用拖拽

        const img = document.createElement('img');
        img.alt = app.title;
        img.addEventListener('error', () => this.handleImageError(img, app.title, index));
        img.src = app.favicon;

        container.appendChild(img);

        // 阻止链接的默认点击行为，只在非拖拽时跳转
        container.addEventListener('click', (e) => {
            if (!this.isDragging) {
                chrome.runtime.sendMessage({ action: 'openUrl', url: app.url });
                this.togglePopup();
            }
            e.preventDefault();
        });

        // 右键菜单
        container.addEventListener('contextmenu', (e) => {
            this.showContextMenu(e, index);
        });

        // 拖拽事件
        container.addEventListener('dragstart', (e) => {
            this.isDragging = true;
            container.classList.add('dragging');
            e.dataTransfer.setData('text/plain', index);
            // 设置拖动时的半透明效果
            setTimeout(() => {
                container.style.opacity = '0.5';
            }, 0);
        });

        container.addEventListener('dragend', (e) => {
            this.isDragging = false;
            container.classList.remove('dragging');
            container.style.opacity = '1';
            // 移除所有图标的dragover效果
            const icons = this.popup.querySelectorAll('.app-icon');
            icons.forEach(icon => icon.classList.remove('drag-over'));
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            container.classList.add('drag-over');
        });

        container.addEventListener('dragleave', (e) => {
            container.classList.remove('drag-over');
        });

        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            container.classList.remove('drag-over');
            
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = parseInt(container.dataset.index);
            
            if (fromIndex !== toIndex) {
                // 获取当前应用列表
                const apps = await this.getApps();
                
                // 移动数组元素
                const [movedApp] = apps.splice(fromIndex, 1);
                apps.splice(toIndex, 0, movedApp);
                
                // 保存新顺序
                await chrome.storage.sync.set({ apps });
                
                // 重新加载应用列表
                this.loadApps();
            }
        });

        return container;
    }

    async loadApps() {
        const apps = await this.getApps();
        const appList = this.popup.querySelector('.app-list');
        appList.innerHTML = '';
        
        // 添加拖拽事件到应用列表容器
        appList.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingElement = this.popup.querySelector('.dragging');
            if (draggingElement) {
                const afterElement = this.getDragAfterElement(appList, e.clientX);
                if (afterElement) {
                    appList.insertBefore(draggingElement, afterElement);
                } else {
                    appList.appendChild(draggingElement);
                }
            }
        });
        
        apps.forEach((app, index) => {
            appList.appendChild(this.createAppIcon(app, index));
        });
    }

    // 辅助函数：确定拖拽元素应该放在哪个元素之后
    getDragAfterElement(container, x) {
        const draggableElements = [...container.querySelectorAll('.app-icon:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    async handleSearch(event) {
        if (event.key === 'Enter') {
            const query = this.searchBox.value.trim();
            if (event.ctrlKey) {
                // 自动补全URL并访问
                const url = this.autoCompleteUrl(query);
                chrome.runtime.sendMessage({ action: 'openUrl', url: url });
                this.searchBox.value = ''; 
                this.togglePopup();
            } else if (event.shiftKey) {
                // Translate
                const translatedText = await this.translate(query);
                this.searchBox.value = translatedText;
                this.searchBox.select();
            } else {
                // Google search
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                chrome.runtime.sendMessage({ action: 'openUrl', url: searchUrl });
                this.searchBox.value = ''; 
                this.togglePopup();
            }
        }
    }

    autoCompleteUrl(input) {
        // Remove leading/trailing whitespace and convert to lowercase
        input = input.trim().toLowerCase();
        
        // If it's already a complete URL, return it
        if (input.startsWith('http://') || input.startsWith('https://')) {
            return input;
        }

        // Common websites mapping
        const commonSites = {
            'google': 'www.google.com',
            'gmail': 'mail.google.com',
            'youtube': 'www.youtube.com',
            'facebook': 'www.facebook.com',
            'twitter': 'twitter.com',
            'x': 'twitter.com',
            'instagram': 'www.instagram.com',
            'linkedin': 'www.linkedin.com',
            'github': 'github.com',
            'reddit': 'www.reddit.com',
            'amazon': 'www.amazon.com',
            'netflix': 'www.netflix.com',
            'spotify': 'www.spotify.com',
            'microsoft': 'www.microsoft.com',
            'apple': 'www.apple.com',
            'yahoo': 'www.yahoo.com',
            'bing': 'www.bing.com',
            'wikipedia': 'www.wikipedia.org',
            'baidu': 'www.baidu.com',
            'bilibili': 'www.bilibili.com',
            'zhihu': 'www.zhihu.com',
            'taobao': 'www.taobao.com',
            'tmall': 'www.tmall.com',
            'jd': 'www.jd.com',
            'weibo': 'www.weibo.com'
        };

        // Check if it's a common website
        if (commonSites[input]) {
            return 'https://' + commonSites[input];
        }

        // Handle domain names with or without www
        if (input.includes('.')) {
            // If it already has www. prefix
            if (input.startsWith('www.')) {
                return 'https://' + input;
            }
            // Add www. prefix for common TLDs
            const commonTlds = ['com', 'org', 'net', 'edu', 'gov', 'io', 'co'];
            const parts = input.split('.');
            const tld = parts[parts.length - 1];
            if (commonTlds.includes(tld)) {
                return 'https://www.' + input;
            }
            // For other TLDs, don't add www.
            return 'https://' + input;
        }

        // If it's just a single word, assume it's a .com domain
        return 'https://www.' + input + '.com';
    }

    async translate(text) {
        // Show loading spinner and position it after the text
        this.loadingSpinner.classList.add('visible');
        this.updateLoadingPosition();
        
        try {
            // Detect language first
            const sourceLang = await this.detectLanguage(text);
            const targetLang = sourceLang === 'zh' ? 'en' : 'zh';
            
            const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
            const data = await response.json();
            return data[0][0][0];
        } catch (error) {
            console.error('Translation error:', error);
            return text;
        } finally {
            // Hide loading spinner
            this.loadingSpinner.classList.remove('visible');
        }
    }

    updateLoadingPosition() {
        // Create a temporary span to measure text width
        const span = document.createElement('span');
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.style.font = window.getComputedStyle(this.searchBox).font;
        span.textContent = this.searchBox.value;
        document.body.appendChild(span);

        // Calculate position
        const textWidth = span.offsetWidth;
        const inputPadding = parseInt(window.getComputedStyle(this.searchBox).paddingLeft);
        this.loadingSpinner.style.left = `${inputPadding + textWidth}px`;

        // Clean up
        document.body.removeChild(span);
    }

    async detectLanguage(text) {
        // Simple language detection based on characters
        const hasChineseChar = /[\u4E00-\u9FFF]/.test(text);
        return hasChineseChar ? 'zh' : 'en';
    }

    async handleAddApp() {
        const title = document.title;
        const url = this.autoCompleteUrl(window.location.href);
        let favicon = await this.getFavicon();
        
        // If favicon fetching failed, generate a default icon
        if (!favicon) {
            favicon = this.generateDefaultIcon(title);
        }
        
        const app = { title, url, favicon };
        
        const apps = await this.getApps();
        apps.push(app);
        await chrome.storage.sync.set({ apps });

        // 重新加载整个应用列表而不是直接添加
        await this.loadApps();
        
        // 关闭弹窗
        this.togglePopup();
    }

    getFavicon() {
        // 收集所有可能的图标
        const icons = [];
        
        // 检查所有图标相关的链接
        const iconSelectors = [
            'link[rel="icon"][sizes]',
            'link[rel="shortcut icon"][sizes]',
            'link[rel="apple-touch-icon"][sizes]',
            'link[rel="apple-touch-icon-precomposed"][sizes]',
            'meta[name="msapplication-TileImage"]',
            'link[rel="fluid-icon"]',
            'link[rel="mask-icon"]',
            // 没有指定尺寸的图标
            'link[rel="icon"]:not([sizes])',
            'link[rel="shortcut icon"]:not([sizes])',
            'link[rel="apple-touch-icon"]:not([sizes])',
            'link[rel="apple-touch-icon-precomposed"]:not([sizes])'
        ];

        // 获取所有图标元素
        iconSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                let iconUrl;
                let size = 0;

                // 获取图标URL
                if (element.tagName.toLowerCase() === 'link') {
                    iconUrl = element.href;
                } else if (element.tagName.toLowerCase() === 'meta') {
                    iconUrl = element.content;
                }

                // 获取图标尺寸
                const sizes = element.getAttribute('sizes');
                if (sizes) {
                    // 处理类似 "32x32" 或 "any" 的尺寸
                    const match = sizes.match(/(\d+)x(\d+)/);
                    if (match) {
                        size = parseInt(match[1]);
                    } else if (sizes === 'any') {
                        size = 192; // 假设 "any" 是大图
                    }
                } else {
                    // 对于没有指定尺寸的图标，根据类型赋予默认尺寸
                    if (element.rel) {
                        if (element.rel.includes('apple-touch-icon')) {
                            size = 180; // apple-touch-icon 通常是180x180
                        } else {
                            size = 32; // 普通 favicon 通常是32x32
                        }
                    }
                }

                if (iconUrl) {
                    icons.push({ url: iconUrl, size: size });
                }
            });
        });

        // 如果找到了图标，返回尺寸最大的那个
        if (icons.length > 0) {
            // 按尺寸降序排序
            icons.sort((a, b) => b.size - a.size);
            return icons[0].url;
        }

        // 如果没有找到任何图标，使用 Google 的 favicon 服务作为后备
        // 请求最大尺寸的图标 (128px)
        return 'https://www.google.com/s2/favicons?sz=128&domain=' + window.location.hostname;
    }

    showContextMenu(e, index) {
        e.preventDefault();
        const rect = e.target.getBoundingClientRect();
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = `${e.clientX}px`;
        this.contextMenu.style.top = `${e.clientY}px`;
        this.currentAppIndex = index;
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
    }

    async handleEdit() {
        const apps = await this.getApps();
        const app = apps[this.currentAppIndex];
        
        const iconImg = this.editModal.querySelector('.edit-app-icon img');
        iconImg.addEventListener('error', () => this.handleImageError(iconImg, app.title, this.currentAppIndex));
        iconImg.src = app.favicon;
        
        const titleInput = this.editModal.querySelector('.edit-title');
        const urlInput = this.editModal.querySelector('.edit-url');
        
        titleInput.value = app.title;
        urlInput.value = app.url;
        
        // Add input event listener for URL changes
        urlInput.addEventListener('input', async () => {
            const url = this.autoCompleteUrl(urlInput.value.trim());
            if (url) {
                try {
                    const domain = new URL(url).hostname;
                    const faviconUrl = `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
                    iconImg.src = faviconUrl;
                } catch (error) {
                    console.error('Invalid URL:', error);
                }
            }
        });
        
        this.editModal.style.display = 'block';
        this.contextMenu.style.display = 'none';  // 只隐藏右键菜单，不清除 currentAppIndex
    }

    hideEditModal() {
        this.editModal.style.display = 'none';
        // 移除 URL 输入事件监听器
        const urlInput = this.editModal.querySelector('.edit-url');
        const oldListener = urlInput.onInput;
        if (oldListener) {
            urlInput.removeEventListener('input', oldListener);
        }
        // 清除 currentAppIndex
        this.currentAppIndex = null;
    }

    async handleDelete() {
        const apps = await this.getApps();
        apps.splice(this.currentAppIndex, 1);
        await chrome.storage.sync.set({ apps });
        this.hideContextMenu();
        this.loadApps();
    }

    async handleSaveEdit() {
        const titleInput = this.editModal.querySelector('.edit-title');
        const urlInput = this.editModal.querySelector('.edit-url');
        const img = this.editModal.querySelector('.edit-app-icon img');
    
        const title = titleInput.value.trim();
        const url = this.autoCompleteUrl(urlInput.value.trim());
        const favicon = img.src;
    
        if (title && url) {
            try {
                let apps = await this.getApps();
                if (!Array.isArray(apps)) {
                    apps = [];
                }
    
                if (this.currentAppIndex !== null && this.currentAppIndex < apps.length) {
                    // 更新现有应用
                    apps[this.currentAppIndex] = { title, url, favicon };
                } else {
                    // 添加新应用
                    apps.push({ title, url, favicon });
                }
            
                await chrome.storage.sync.set({ apps });
                await this.loadApps();
                this.hideEditModal();
            } catch (error) {
                console.error('Error saving app:', error);
            }
        }
    }

    async saveApp(app) {
        const apps = await this.getApps();
        apps.push(app);
        chrome.storage.sync.set({ apps });
    }

    async getApps() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['apps'], (result) => {
                resolve(result.apps || []);
            });
        });
    }

    generateDefaultIcon(title) {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        
        // Draw dark gray background
        ctx.fillStyle = '#4A4A4A';
        ctx.fillRect(0, 0, 48, 48);
        
        // Draw white letter
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const letter = (title || '?').charAt(0).toUpperCase();
        ctx.fillText(letter, 24, 24);
        
        return canvas.toDataURL();
    }

    async handleImageError(img, title, index) {
        const defaultIcon = this.generateDefaultIcon(title);
        img.src = defaultIcon;
        
        // Save the default icon to storage if we have an index
        if (index !== undefined) {
            const apps = await this.getApps();
            if (apps[index]) {
                apps[index].favicon = defaultIcon;
                chrome.storage.sync.set({ apps });
            }
        }
    }

    togglePopup() {
        this.popup.classList.toggle('visible');
        if (this.popup.classList.contains('visible')) {
            this.searchBox.focus();
        }
    }
}

// Initialize QuickTap when the page loads
if (!window.quickTap) {
    window.quickTap = new QuickTap();
}

// Handle extension messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle') {
        if (window.quickTap) {
            window.quickTap.togglePopup();
        }
    }
});