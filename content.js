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
                <input type="text" class="quicktap-search" placeholder="Search, translate, or enter URL">
                <div class="quicktap-apps">
                    <div class="app-list"></div>
                    <button class="add-app-btn">+</button>
                </div>
            </div>
        `;

        // Add popup to document
        document.body.appendChild(this.popup);

        // Add keyboard event listener
        document.addEventListener('keydown', (e) => {
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
                <span>✏️ Edit</span>
            </div>
            <div class="context-menu-item delete">
                <span>🗑️ Delete</span>
            </div>
        `;

        // Add context menu to document
        document.body.appendChild(this.contextMenu);

        // Create edit modal
        this.editModal = document.createElement('div');
        this.editModal.className = 'edit-app-modal';
        this.editModal.style.display = 'none';
        this.editModal.innerHTML = `
            <h3>Edit App</h3>
            <div class="edit-app-icon">
                <img src="" alt="App Icon">
            </div>
            <input type="text" class="edit-title" placeholder="Title">
            <input type="text" class="edit-url" placeholder="URL">
            <div class="buttons">
                <button class="cancel-btn">Cancel</button>
                <button class="save-btn">Save</button>
            </div>
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

        // Close context menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.contextMenu.contains(e.target) && !e.target.closest('.app-icon')) {
                this.hideContextMenu();
            }
        });

        // Load saved apps
        this.loadApps();
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
        // 移除开头和结尾的空格
        input = input.trim().toLowerCase();
        
        // 如果已经是完整的URL，直接返回
        if (input.startsWith('http://') || input.startsWith('https://')) {
            return input;
        }

        // 常见网站的特殊处理
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

        // 检查是否是常见网站
        if (commonSites[input]) {
            return 'https://' + commonSites[input];
        }

        // 处理已经包含域名的情况
        if (input.includes('.')) {
            return 'https://' + (input.startsWith('www.') ? input : 'www.' + input);
        }

        // 默认添加.com后缀
        return 'https://www.' + input + '.com';
    }

    async translate(text) {
        // Detect language first
        const sourceLang = await this.detectLanguage(text);
        const targetLang = sourceLang === 'zh' ? 'en' : 'zh';
        
        try {
            const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
            const data = await response.json();
            return data[0][0][0];
        } catch (error) {
            console.error('Translation error:', error);
            return text;
        }
    }

    async detectLanguage(text) {
        // Simple language detection based on characters
        const hasChineseChar = /[\u4E00-\u9FFF]/.test(text);
        return hasChineseChar ? 'zh' : 'en';
    }

    async handleAddApp() {
        const title = document.title;
        const url = window.location.href;
        let favicon = this.getFavicon();
        const app = { title, url, favicon };
        
        const apps = await this.getApps();
        const appIndex = apps.length;
        apps.push(app);
        await chrome.storage.sync.set({ apps });

        // Immediately add the new app to the list
        const appList = this.popup.querySelector('.app-list');
        appList.appendChild(this.createAppIcon(app, appIndex));
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
                        size = 192; // 假设 "any" 是大图标
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
        this.currentAppIndex = null;
    }

    async handleEdit() {
        const apps = await this.getApps();
        const app = apps[this.currentAppIndex];
        
        const iconImg = this.editModal.querySelector('.edit-app-icon img');
        iconImg.addEventListener('error', () => this.handleImageError(iconImg, app.title, this.currentAppIndex));
        iconImg.src = app.favicon;
        
        this.editModal.querySelector('.edit-title').value = app.title;
        this.editModal.querySelector('.edit-url').value = app.url;
        
        this.editModal.style.display = 'block';
        this.hideContextMenu();
    }

    hideEditModal() {
        this.editModal.style.display = 'none';
    }

    async handleDelete() {
        const apps = await this.getApps();
        apps.splice(this.currentAppIndex, 1);
        await chrome.storage.sync.set({ apps });
        this.hideContextMenu();
        this.loadApps();
    }

    async handleSaveEdit() {
        const apps = await this.getApps();
        const title = this.editModal.querySelector('.edit-title').value;
        const url = this.editModal.querySelector('.edit-url').value;
        const favicon = this.editModal.querySelector('.edit-app-icon img').src;
        
        // If the title changed, regenerate the default icon
        if (title !== apps[this.currentAppIndex].title) {
            const img = this.editModal.querySelector('.edit-app-icon img');
            if (img.src.startsWith('data:')) { // If using default icon
                await this.handleImageError(img, title, this.currentAppIndex);
                apps[this.currentAppIndex] = { title, url, favicon: img.src };
            } else {
                apps[this.currentAppIndex] = { title, url, favicon };
            }
        } else {
            apps[this.currentAppIndex] = { title, url, favicon };
        }
        
        await chrome.storage.sync.set({ apps });
        this.hideEditModal();
        this.loadApps();
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
