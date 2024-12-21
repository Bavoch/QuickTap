class QuickTap {
    constructor() {
        this.popup = null;
        this.searchBox = null;
        this.appList = null;
        this.contextMenu = null;
        this.editModal = null;
        this.currentAppIndex = null;
        this.shortcut = { key: 'z', ctrl: false, alt: false, shift: false, command: false };
        this.isDragging = false;
        this.loadingSpinner = null;
        this.init();

        // Make instance available globally for error handling
        window.quickTap = this;

        // Listen for changes in chrome.storage
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.apps) {
                // Reload apps when the storage changes
                this.loadApps();
            }
        });
    }

    init() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'quicktap-overlay quicktap-extension';
        document.body.appendChild(this.overlay);

        // Load shortcut settings
        chrome.storage.sync.get(['shortcut'], (result) => {
            if (result.shortcut) {
                this.shortcut = result.shortcut;
            }
        });

        // Create popup container
        this.popup = document.createElement('div');
        this.popup.className = 'quicktap-popup quicktap-extension';
        this.popup.innerHTML = `
            <div class="quicktap-container">
                <div class="quicktap-search-container">
                    <input type="text" class="quicktap-search" placeholder="Enter 搜索，Shift Enter 翻译">
                    <div class="loading-spinner"></div>
                </div>
                <div class="quicktap-apps">
                    <div class="app-list">
                        <div class="add-app-btn">
                            <div class="plus-icon">
                                <div class="icon"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Create context menu
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu quicktap-extension';
        this.contextMenu.style.display = 'none';
        this.contextMenu.innerHTML = `
            <div class="context-menu-item edit">
                <span>编辑</span>
            </div>
            <div class="context-menu-item delete">
                <span>删除</span>
            </div>
        `;

        // Create edit modal
        this.editModal = document.createElement('div');
        this.editModal.className = 'edit-app-modal quicktap-extension';
        this.editModal.style.display = 'none';
        this.editModal.innerHTML = `
            <div class="header">
                <h3>编辑应用</h3>
                <div class="buttons">
                    <button class="save-btn">保存</button>
                    <button class="cancel-btn">取消</button>
                </div>
            </div>
            <div class="form">
                <div class="name-input-container">
                    <input type="text" class="edit-title" placeholder="请输入名称">
                    <div class="edit-app-icon">
                        <img src="" alt="应用图标">
                        <div class="icon-context-menu" style="display: none;">
                            <div class="context-menu-item upload">
                                <span>本地上传</span>
                            </div>
                            <div class="context-menu-item paste">
                                <span>粘贴替换</span>
                            </div>
                            <div class="context-menu-item reset">
                                <span>重置图标</span>
                            </div>
                        </div>
                    </div>
                </div>
                <input type="text" class="edit-url" placeholder="请输入地址">
            </div>
            <input type="file" id="iconUpload" accept="image/*" style="display: none;">
        `;

        // Add elements to document
        document.body.appendChild(this.popup);
        document.body.appendChild(this.contextMenu);
        document.body.appendChild(this.editModal);

        // Store references to elements
        this.searchBox = this.popup.querySelector('.quicktap-search');
        this.loadingSpinner = this.popup.querySelector('.loading-spinner');

        // Add click event listener to close popup when clicking outside
        document.addEventListener('click', (e) => {
            // 检查是否有右键菜单显示
            const contextMenu = this.contextMenu;
            const iconContextMenu = this.editModal.querySelector('.icon-context-menu');
            const isContextMenuVisible = contextMenu.style.display === 'block';
            const isIconContextMenuVisible = iconContextMenu && iconContextMenu.style.display === 'block';
            const isEditModalVisible = this.editModal.style.display === 'block';

            // 如果点击的是右键菜单区域，不做任何处理
            if (contextMenu.contains(e.target) || 
                (iconContextMenu && iconContextMenu.contains(e.target)) ||
                e.target.closest('.app-icon') ||
                e.target.closest('.edit-app-icon')) {
                return;
            }

            // 如果有右键菜单显示，则只关闭右键菜单
            if (isContextMenuVisible || isIconContextMenuVisible) {
                this.hideContextMenu();
                if (iconContextMenu) {
                    iconContextMenu.style.display = 'none';
                }
                e.stopPropagation();
                return;
            }

            // 如果编辑弹窗显示，且点击在弹窗外部，则关闭弹窗
            if (isEditModalVisible && !this.editModal.contains(e.target)) {
                this.hideEditModal();
                return;
            }

            // 如果点击的是弹窗外区域，且没有右键菜单显示，则关闭整个插件
            if (this.popup.classList.contains('visible') && 
                !this.popup.contains(e.target) && 
                !this.editModal.contains(e.target)) {
                this.hideContextMenu();
                this.togglePopup();
            }
        });

        // Prevent closing when clicking inside elements
        this.popup.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        this.editModal.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        this.contextMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Add keyboard event listener
        document.addEventListener('keydown', (e) => {
            // Skip if the active element is an input field
            if (document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA' || 
                document.activeElement.isContentEditable) {
                return;
            }
            
            // Check if the pressed keys match the custom shortcut
            if (e.key.toLowerCase() === this.shortcut.key &&
                e.ctrlKey === this.shortcut.ctrl &&
                e.altKey === this.shortcut.alt &&
                e.shiftKey === this.shortcut.shift &&
                e.metaKey === this.shortcut.command) {
                e.preventDefault();
                this.togglePopup();
            }
        });

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
        const editAppIcon = this.editModal.querySelector('.edit-app-icon');
        const iconContextMenu = this.editModal.querySelector('.icon-context-menu');
        const iconUpload = this.editModal.querySelector('#iconUpload');

        // 右键菜单
        editAppIcon.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const iconContextMenu = this.editModal.querySelector('.icon-context-menu');
            iconContextMenu.style.visibility = 'visible';
            iconContextMenu.style.display = 'block';

            // 添加一次性点击事件监听器到 document
            const closeMenu = (event) => {
                // 如果点击的不是菜单本身
                if (!iconContextMenu.contains(event.target)) {
                    iconContextMenu.style.visibility = 'hidden';
                    iconContextMenu.style.display = 'none';
                    // 移除事件监听器
                    document.removeEventListener('click', closeMenu);
                    document.removeEventListener('contextmenu', closeMenu);
                }
            };

            // 延迟添加事件监听器，避免立即触发
            setTimeout(() => {
                document.addEventListener('click', closeMenu);
                document.addEventListener('contextmenu', closeMenu);
            }, 0);
        });

        // 左键点击处理
        editAppIcon.addEventListener('click', () => {
            const iconUpload = this.editModal.querySelector('#iconUpload');
            iconUpload.click();
        });

        // 添加本地上传按钮的点击事件处理
        this.editModal.querySelector('.upload').addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            const iconUpload = this.editModal.querySelector('#iconUpload');
            iconUpload.click();
            iconContextMenu.style.display = 'none';
        });

        // 处理图片上传
        iconUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    await this.handleImageUpload(file);
                } catch (error) {
                    console.error('Error uploading image:', error);
                    // 如果上传失败，使用默认图标
                    const titleInput = this.editModal.querySelector('.edit-title');
                    const img = this.editModal.querySelector('.edit-app-icon img');
                    img.src = this.generateDefaultIcon(titleInput.value);
                }
            }
            // 清空文件输入，这样同一个文件可以再次选择
            e.target.value = '';
        });

        // Handle paste replace
        this.editModal.querySelector('.paste').addEventListener('click', async (e) => {
            e.stopPropagation(); // 阻止事件冒泡
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
        this.editModal.querySelector('.reset').addEventListener('click', async (e) => {
            e.stopPropagation();
            const urlInput = this.editModal.querySelector('.edit-url');
            const titleInput = this.editModal.querySelector('.edit-title');
            const img = this.editModal.querySelector('.edit-app-icon img');
            
            // Try to get the favicon from the URL
            const url = this.autoCompleteUrl(urlInput.value.trim());
            if (url) {
                try {
                    const favicon = await this.getFaviconFromUrl(url);
                    img.src = favicon;
                } catch (error) {
                    // If URL is invalid, generate default icon
                    console.error('Failed to reset icon:', error);
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
        container.draggable = true;

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
            
            // Use both methods to ensure data transfer
            e.dataTransfer.setData('text/plain', index);
            e.dataTransfer.effectAllowed = 'move';
            
            // Minimal prevention to allow our custom drag
            e.stopPropagation(); 
            
            setTimeout(() => {
                container.style.opacity = '0.5';
            }, 0);
        });

        container.addEventListener('dragend', (e) => {
            this.isDragging = false;
            container.classList.remove('dragging');
            container.style.opacity = '1';
            e.stopPropagation();
            const icons = this.popup.querySelectorAll('.app-icon');
            icons.forEach(icon => icon.classList.remove('drag-over'));
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            e.stopPropagation();
            container.classList.add('drag-over');
        });

        container.addEventListener('dragleave', (e) => {
            e.stopPropagation();
            container.classList.remove('drag-over');
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleDrop(e, container);
        });

        return container;
    }

    async loadApps() {
        const apps = await this.getApps();
        const appList = this.popup.querySelector('.app-list');
        appList.innerHTML = '';
        
        // 先添加所有应用图标
        for (let i = 0; i < apps.length; i++) {
            const app = apps[i];
            // 确保应用有有效的图标
            if (!app.favicon || app.favicon === 'null' || app.favicon === 'undefined') {
                try {
                    app.favicon = await this.getFaviconFromUrl(app.url);
                    // 更新存储中的图标
                    const allApps = await this.getApps();
                    allApps[i] = app;
                    await chrome.storage.local.set({ apps: allApps });
                } catch (error) {
                    console.error('Error updating favicon:', error);
                    app.favicon = this.generateDefaultIcon(app.title);
                }
            }
            appList.appendChild(this.createAppIcon(app, i));
        }

        // 添加"加用"按钮
        const addButton = document.createElement('div');
        addButton.className = 'add-app-btn';
        addButton.innerHTML = `
            <div class="plus-icon">
                <div class="icon"></div>
            </div>
        `;
        addButton.addEventListener('click', this.handleAddApp.bind(this));
        appList.appendChild(addButton);
    }

    async getApps() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['apps'], (result) => {
                resolve(result.apps || []);
            });
        });
    }

    async getFaviconFromUrl(url) {
        try {
            const domain = new URL(url).hostname;
            const response = await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => reject(new Error('Timeout')), 3000); // 3秒超时
                chrome.runtime.sendMessage({ 
                    action: 'getFavicon', 
                    domain: domain,
                    url: url
                }, (response) => {
                    clearTimeout(timeoutId);
                    resolve(response);
                });
            });
            
            if (response && response.favicon) {
                return response.favicon;
            }

            // 如果获取失败，尝试使用 Google 的 favicon 服务
            try {
                const googleFaviconUrl = `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
                const response = await fetch(googleFaviconUrl);
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (error) {
                console.error('Error getting Google favicon:', error);
                return this.generateDefaultIcon(domain);
            }
        } catch (error) {
            console.error('Error getting favicon:', error);
            return this.generateDefaultIcon(url);
        }
    }

    showContextMenu(e, index) {
        e.preventDefault();
        const rect = e.target.getBoundingClientRect();
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = `${rect.right + 8}px`;
        this.contextMenu.style.top = `${rect.top}px`;
        this.currentAppIndex = index;
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
    }

    async handleEdit() {
        const apps = await this.getApps();
        const app = apps[this.currentAppIndex];
        
        // 获取当前图标的位置
        const currentIcon = this.popup.querySelector(`.app-icon[data-index="${this.currentAppIndex}"]`);
        const iconRect = currentIcon.getBoundingClientRect();
        
        const iconImg = this.editModal.querySelector('.edit-app-icon img');
        iconImg.addEventListener('error', () => this.handleImageError(iconImg, app.title, this.currentAppIndex));
        // 使用保存的图标或获取新图标
        if (app.favicon && app.favicon !== 'null' && app.favicon !== 'undefined') {
            iconImg.src = app.favicon;
        } else {
            const favicon = await this.getFaviconFromUrl(app.url);
            iconImg.src = favicon;
        }
        
        const titleInput = this.editModal.querySelector('.edit-title');
        const urlInput = this.editModal.querySelector('.edit-url');
        
        titleInput.value = app.title;
        urlInput.value = app.url;

        // 移除旧的事件监听器
        if (urlInput._urlChangeHandler) {
            urlInput.removeEventListener('input', urlInput._urlChangeHandler);
        }

        // 添加新的 URL 输入事件监听器
        let timeoutId = null;
        let lastDomain = '';  // 用于跟踪域名变化

        urlInput._urlChangeHandler = async () => {
            // 清除之前的定时器
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            const url = this.autoCompleteUrl(urlInput.value.trim());
            if (!url) {
                iconImg.src = this.generateDefaultIcon(titleInput.value);
                return;
            }

            try {
                // 获取新的域名
                const newDomain = new URL(url).hostname;
                
                // 如果域名没有变化，且已经有图标，则不需要更新
                if (newDomain === lastDomain && iconImg.src && !iconImg.src.startsWith('data:image/png;base64,iVBOR')) {
                    return;
                }

                // 设置 1 秒的延迟
                timeoutId = setTimeout(async () => {
                    try {
                        // 显示加载状态
                        iconImg.style.opacity = '0.5';
                        
                        // 更新最后的域名
                        lastDomain = newDomain;

                        // 获取新图标
                        const favicon = await this.getFaviconFromUrl(url);
                        iconImg.src = favicon;
                    } catch (error) {
                        console.error('Error fetching favicon:', error);
                        iconImg.src = this.generateDefaultIcon(titleInput.value);
                    } finally {
                        iconImg.style.opacity = '1';
                    }
                }, 1000); // 1秒延迟
            } catch (error) {
                console.error('Invalid URL:', error);
                iconImg.src = this.generateDefaultIcon(titleInput.value);
            }
        };

        // 同时监听 input 和 change 事件
        urlInput.addEventListener('input', urlInput._urlChangeHandler);
        urlInput.addEventListener('change', urlInput._urlChangeHandler);
        
        // 设置弹窗位置在图标右侧8px处，并且顶部对齐
        this.editModal.style.position = 'fixed';
        this.editModal.style.top = `${iconRect.top}px`;
        this.editModal.style.left = `${iconRect.right + 8}px`;
        this.editModal.style.transform = 'none';
        
        this.editModal.style.display = 'block';
        this.contextMenu.style.display = 'none';
    }

    hideEditModal() {
        this.editModal.style.display = 'none';
        // 清理 URL 输入事件监听器
        const urlInput = this.editModal.querySelector('.edit-url');
        if (urlInput && urlInput._urlChangeHandler) {
            urlInput.removeEventListener('input', urlInput._urlChangeHandler);
            urlInput._urlChangeHandler = null;
        }
        // 清除 currentAppIndex
        this.currentAppIndex = null;
    }

    async handleDelete() {
        const apps = await this.getApps();
        apps.splice(this.currentAppIndex, 1);
        await chrome.storage.local.set({ apps });
        this.hideContextMenu();
        this.loadApps();
    }

    async handleSaveEdit() {
        const titleInput = this.editModal.querySelector('.edit-title');
        const urlInput = this.editModal.querySelector('.edit-url');
        const iconImg = this.editModal.querySelector('.edit-app-icon img');
        
        const title = titleInput.value.trim();
        let url = urlInput.value.trim();
        
        if (!title || !url) {
            console.error('Title and URL are required');
            return;
        }
        
        // 自动补全 URL
        url = this.autoCompleteUrl(url);
        
        // 获取当前显示的图标
        const favicon = iconImg.src;
        
        // 获取当前应用列表
        chrome.storage.local.get(['apps'], async (result) => {
            const apps = result.apps || [];
            
            if (this.currentAppIndex !== null && this.currentAppIndex >= 0) {
                // 更新现有应用
                apps[this.currentAppIndex] = { 
                    title, 
                    url, 
                    favicon  // 使用当前显示的图标
                };
            } else {
                // 添加新应用
                apps.push({ 
                    title, 
                    url, 
                    favicon  // 使用当前显示的图标
                });
            }
            
            // 保存更新后的应用列表
            chrome.storage.local.set({ apps }, () => {
                this.hideEditModal();
                this.loadApps(); // 重新加载应用列表
            });
        });
    }

    async saveApp(app) {
        try {
            // 压缩 favicon 数据
            if (app.favicon && app.favicon.startsWith('data:image')) {
                app.favicon = await this.compressImage(app.favicon, 64, 64); // 减小图标尺寸
            }

            const apps = await this.getApps();
            
            // 如果是编辑现有应用
            if (this.currentAppIndex !== null) {
                apps[this.currentAppIndex] = app;
            } else {
                // 限制应用数量，防止超出配额
                if (apps.length >= 50) {
                    apps.shift(); // 删除最旧的应用
                }
                apps.push(app);
            }

            // 尝试保存数据
            try {
                await chrome.storage.local.set({ apps });
            } catch (error) {
                console.error('Error saving app order:', error);
            }
            
            // 重新加载应用列表
            await this.loadApps();
        } catch (error) {
            console.error('Error saving app:', error);
            // 在界面上显示错误提示
            const errorMsg = document.createElement('div');
            errorMsg.className = 'error-message';
            errorMsg.textContent = '保存失败，请稍后重试';
            this.popup.appendChild(errorMsg);
            setTimeout(() => errorMsg.remove(), 3000);
        }
    }

    generateDefaultIcon(title) {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        
        // 绘制深色背景
        ctx.fillStyle = '#4A4A4A';
        ctx.fillRect(0, 0, 48, 48);
        
        // 绘制白色字母
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 获取第一个非标点符号的字符
        let letter = (title || '?').split('').find(char => /[A-Za-z0-9\u4e00-\u9fa5]/.test(char)) || '?';
        if (/[a-z]/.test(letter)) {
            letter = letter.toUpperCase();
        }
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
                chrome.storage.local.set({ apps });
            }
        }
    }

    show() {
        this.popup.classList.add('visible');
        this.searchBox.focus();
        this.visible = true;
    }

    hide() {
        this.popup.classList.remove('visible');
        this.searchBox.value = '';
        this.visible = false;
        this.clearSearchResults();
    }

    togglePopup() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    clearSearchResults() {
        const searchResults = this.popup.querySelector('.search-results');
        if (searchResults) {
            searchResults.innerHTML = '';
            searchResults.style.display = 'none';
        }
    }

    async handleDrop(e, container) {
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
            
            // 保存新
            try {
                await chrome.storage.local.set({ apps });
            } catch (error) {
                console.error('Error saving app order:', error);
            }
            
            // 重新加载应用列表
            await this.loadApps();
        }
    }

    async compressImage(dataUrl, maxWidth = 128, maxHeight = 128) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';  // 添加跨域支持
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // 计算缩放比例
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width *= ratio;
                    height *= ratio;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                try {
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                } catch (error) {
                    // 果出现跨域错误，尝试直接使用原始数据
                    console.warn('Failed to compress image:', error);
                    resolve(dataUrl);
                }
            };

            img.onerror = () => {
                // 如果加载失败，返回原始数据
                console.warn('Failed to load image');
                resolve(dataUrl);
            };

            // 对于已经是 base64 的数据，直接使用
            if (dataUrl.startsWith('data:')) {
                img.src = dataUrl;
            } else {
                // 对于外部URL，添加时间戳避免缓存
                const timestamp = new Date().getTime();
                img.src = `${dataUrl}${dataUrl.includes('?') ? '&' : '?'}t=${timestamp}`;
            }
        });
    }

    // 处理图片上传
    handleImageUpload(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const compressedImage = await this.compressImage(e.target.result);
                    const img = this.editModal.querySelector('.edit-app-icon img');
                    img.src = compressedImage;
                    resolve(compressedImage);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async handleSearch(event) {
        // 如果是中文输入法正在输入中，不触发搜索
        if (event.key === 'Enter' && !event.isComposing) {
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

    async translate(text) {
        if (this.loadingSpinner) {
            this.loadingSpinner.classList.add('visible');
            this.updateLoadingPosition();
        }
        
        try {
            const response = await new Promise(resolve => {
                chrome.runtime.sendMessage({ 
                    action: 'translate',
                    text: text
                }, resolve);
            });

            if (response && response.success) {
                return response.translation;
            } else {
                console.error('Translation failed:', response.error);
                return text;
            }
        } catch (error) {
            console.error('Translation error:', error);
            return text;
        } finally {
            if (this.loadingSpinner) {
                this.loadingSpinner.classList.remove('visible');
            }
        }
    }

    updateLoadingPosition() {
        if (!this.loadingSpinner || !this.searchBox) return;

        // 创建临时 span 来测量文本宽度
        const span = document.createElement('span');
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.style.font = window.getComputedStyle(this.searchBox).font;
        span.textContent = this.searchBox.value;
        document.body.appendChild(span);

        // 计算文本宽度和输入框的内边距
        const textWidth = span.offsetWidth;
        const inputPadding = parseInt(window.getComputedStyle(this.searchBox).paddingLeft);

        // 设置加载动画的位置，添加 16px 的间距
        this.loadingSpinner.style.left = `${inputPadding + textWidth + 16}px`;

        // 清理临时元素
        document.body.removeChild(span);
    }

    async handleAddApp() {
        const title = document.title;
        const url = window.location.href;
        const favicon = await this.getFavicon(url);
        
        const app = { title, url, favicon };
        
        const apps = await this.getApps();
        apps.push(app);
        await chrome.storage.local.set({ apps });

        // 重新加载整个应用列表
        await this.loadApps();
    }

    async getFavicon(url) {
        try {
            const domain = new URL(url).hostname;
            const response = await new Promise(resolve => {
                chrome.runtime.sendMessage({ 
                    action: 'getFavicon', 
                    domain: domain,
                    url: url  // 添加完整URL以便后台获取当前标签页图标
                }, resolve);
            });
            
            if (response && response.favicon) {
                return response.favicon;
            }
            
            // 如果获取失败，返回默认图标
            return this.generateDefaultIcon(domain);
        } catch (error) {
            console.error('Error getting favicon:', error);
            return this.generateDefaultIcon(url);
        }
    }

    async getApps() {
        const result = await chrome.storage.local.get('apps');
        return result.apps || [];
    }

    togglePopup() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    // 添加 URL 自动补全函数
    autoCompleteUrl(url) {
        if (!url) return '';
        
        // 如果已经是完整的 URL，直接返回
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        
        // 如果包含点号但不是完整 URL，添加 https://
        if (url.includes('.')) {
            return `https://${url}`;
        }
        
        // 如果是简单域名，添加 .com 和 https://
        return `https://${url}.com`;
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
    } else if (request.action === 'updateShortcut') {
        if (window.quickTap) {
            window.quickTap.shortcut = request.shortcut;
        }
    }
});
