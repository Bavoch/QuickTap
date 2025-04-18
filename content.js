class QuickTap {
    constructor() {
        // 检查是否已经创建了实例
        if (window.quickTap) {
            console.warn('QuickTap instance already exists, returning existing instance');
            return window.quickTap;
        }

        // 将实例绑定到全局变量
        window.quickTap = this;
        console.log('Creating new QuickTap instance');

        // 基本属性
        this.popup = null;
        this.searchBox = null;
        this.appList = null;
        this.contextMenu = null;
        this.editModal = null;
        this.currentAppIndex = null;
        this.shortcut = { key: 'z', ctrl: false, alt: false, shift: false, command: false };
        this.isDragging = false;
        this.loadingSpinner = null;
        this.dragGuideLine = null;
        this.isInitialized = false; // 添加初始化标志

        // DOM 元素缓存
        this.domElements = {
            // 将在 init 方法中初始化
            appList: null,
            editTitle: null,
            editUrl: null,
            editAppIcon: null,
            editAppIconImg: null,
            iconContextMenu: null,
            iconUpload: null
        };

        // 初始化
        this.init();

        // Listen for changes in chrome.storage
        this.isLoadingApps = false; // 添加标志防止重复加载
        this.loadingTimeout = null; // 用于防止短时间内多次加载

        this.storageChangeHandler = (changes, namespace) => {
            try {
                if (namespace === 'local' && changes && changes.apps) {
                    console.log('Storage changed, scheduling app reload...');

                    // 清除之前的定时器
                    if (this.loadingTimeout) {
                        clearTimeout(this.loadingTimeout);
                    }

                    // 如果已经在加载中，则不重复加载
                    if (this.isLoadingApps) {
                        console.log('Apps already loading, skipping redundant load');
                        return;
                    }

                    // 设置定时器，延迟加载以防止多次触发
                    this.loadingTimeout = setTimeout(() => {
                        console.log('Executing delayed app reload');
                        this.loadApps();
                    }, 100); // 100ms 延迟，合并短时间内的多次变更
                }
            } catch (error) {
                console.error('Error in storage change handler:', error);
            }
        };

        // 检查chrome API是否可用
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            try {
                // 移除可能存在的旧监听器
                chrome.storage.onChanged.removeListener(this.storageChangeHandler);

                // 添加新监听器
                chrome.storage.onChanged.addListener(this.storageChangeHandler);
                console.log('Storage change listener added');
            } catch (error) {
                console.error('Error setting up storage change listener:', error);
            }
        } else {
            console.warn('Chrome storage API not available, storage change listener not added');
        }
    }

    init() {
        // 检查是否已经初始化
        if (this.isInitialized) {
            console.warn('QuickTap already initialized, skipping initialization');
            return;
        }

        console.log('Initializing QuickTap...');

        // 移除可能存在的旧元素
        console.log('Removing existing QuickTap elements...');
        const existingElements = document.querySelectorAll('.quicktap-extension');
        console.log(`Found ${existingElements.length} existing elements to remove`);
        existingElements.forEach(element => {
            try {
                element.remove();
            } catch (error) {
                console.error('Error removing element:', error);
            }
        });

        // 再次检查是否有元素没有被清除
        const remainingElements = document.querySelectorAll('.quicktap-extension');
        if (remainingElements.length > 0) {
            console.warn(`Still have ${remainingElements.length} QuickTap elements after cleanup, forcing removal`);
            remainingElements.forEach(element => {
                try {
                    if (element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                } catch (error) {
                    console.error('Error force removing element:', error);
                }
            });
        }

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'quicktap-overlay quicktap-extension';
        document.body.appendChild(this.overlay);

        // Load shortcut settings
        try {
            // 检查chrome API是否可用
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.get(['shortcut'], (result) => {
                    try {
                        if (chrome.runtime.lastError) {
                            console.warn('Error loading shortcut settings:', chrome.runtime.lastError);
                            return;
                        }

                        if (result && result.shortcut) {
                            console.log('Loaded shortcut settings:', result.shortcut);
                            this.shortcut = result.shortcut;
                        }
                    } catch (error) {
                        console.error('Error processing shortcut settings:', error);
                    }
                });
            } else {
                console.warn('Chrome storage sync API not available, using default shortcut settings');
            }
        } catch (error) {
            console.error('Error loading shortcut settings:', error);
        }

        // Create popup container
        this.popup = document.createElement('div');
        this.popup.className = 'quicktap-popup quicktap-extension';
        this.popup.innerHTML = `
            <div class="quicktap-container">
                <div class="quicktap-apps">
                    <div class="app-list">
                    </div>
                </div>
            </div>
        `;

        // Create drag guide line
        this.dragGuideLine = document.createElement('div');
        this.dragGuideLine.className = 'drag-guide-line quicktap-extension';
        document.body.appendChild(this.dragGuideLine);

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

        // 缓存常用 DOM 元素引用
        this.domElements.appList = this.popup.querySelector('.app-list');
        this.domElements.editTitle = this.editModal.querySelector('.edit-title');
        this.domElements.editUrl = this.editModal.querySelector('.edit-url');
        this.domElements.editAppIcon = this.editModal.querySelector('.edit-app-icon');
        this.domElements.editAppIconImg = this.editModal.querySelector('.edit-app-icon img');
        this.domElements.iconContextMenu = this.editModal.querySelector('.icon-context-menu');
        this.domElements.iconUpload = this.editModal.querySelector('#iconUpload');

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

            // 不再关闭侧边栏，只隐藏右键菜单
            if (!this.popup.contains(e.target) &&
                !this.editModal.contains(e.target)) {
                this.hideContextMenu();
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

        // 快捷键不再切换侧边栏显示状态
        // document.addEventListener('keydown', (e) => {
        //     // Skip if the active element is an input field
        //     if (document.activeElement.tagName === 'INPUT' ||
        //         document.activeElement.tagName === 'TEXTAREA' ||
        //         document.activeElement.isContentEditable) {
        //         return;
        //     }

        //     // Check if the pressed keys match the custom shortcut
        //     if (e.key.toLowerCase() === this.shortcut.key &&
        //         e.ctrlKey === this.shortcut.ctrl &&
        //         e.altKey === this.shortcut.alt &&
        //         e.shiftKey === this.shortcut.shift &&
        //         e.metaKey === this.shortcut.command) {
        //         e.preventDefault();
        //         this.togglePopup();
        //     }
        // });

        // 不在这里添加事件监听器，因为此时还没有添加按钮
        // 添加按钮的事件监听器会在loadApps方法中添加

        // 隐藏按钮已移除

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

        // 默认显示侧边栏
        setTimeout(() => this.show(), 500);

        // 定期更新图标活跃状态
        this.updateActiveStatus();
        setInterval(() => this.updateActiveStatus(), 5000); // 每5秒更新一次

        // 设置初始化标志
        this.isInitialized = true;
        console.log('QuickTap initialization complete');
    }

    createAppIcon(app, index) {
        const container = document.createElement('a');
        container.href = app.url;
        container.className = 'app-icon';
        container.title = app.title;
        container.dataset.index = index;
        container.dataset.url = app.url;
        container.draggable = true;

        const img = document.createElement('img');
        img.alt = app.title;
        img.addEventListener('error', () => this.handleImageError(img, app.title, index));
        img.src = app.favicon;

        // 添加小圆点指示器
        const indicator = document.createElement('div');
        indicator.className = 'active-indicator';

        container.appendChild(img);
        container.appendChild(indicator);

        // 阻止链接的默认点击行为，只在非拖拽时跳转
        container.addEventListener('click', (e) => {
            if (!this.isDragging) {
                // 检查chrome API是否可用
                if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
                    console.warn('Chrome runtime API not available, opening URL directly');
                    // 如果API不可用，直接打开URL
                    try {
                        window.open(app.url, '_blank');
                    } catch (error) {
                        console.error('Error opening URL directly:', error);
                    }
                    e.preventDefault();
                    return;
                }

                try {
                    // 检查是否已有打开的标签页，如果有则切换到该标签页，否则打开新标签页
                    chrome.runtime.sendMessage({
                        action: 'switchOrOpenUrl',
                        url: app.url
                    }, (response) => {
                        // 检查是否有错误
                        if (chrome.runtime.lastError) {
                            console.warn('Error opening URL:', chrome.runtime.lastError);
                            // 如果出错，尝试直接打开URL
                            try {
                                window.open(app.url, '_blank');
                            } catch (openError) {
                                console.error('Error opening URL after sendMessage error:', openError);
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error sending message to open URL:', error);
                    // 如果出错，尝试直接打开URL
                    try {
                        window.open(app.url, '_blank');
                    } catch (openError) {
                        console.error('Error opening URL after catch:', openError);
                    }
                }
                // 不再关闭侧边栏
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

            // Hide guide line initially
            this.dragGuideLine.style.display = 'none';
        });

        container.addEventListener('dragend', (e) => {
            this.isDragging = false;
            container.classList.remove('dragging');
            container.style.opacity = '1';
            e.stopPropagation();
            const icons = this.popup.querySelectorAll('.app-icon');
            icons.forEach(icon => icon.classList.remove('drag-over'));

            // Hide guide line when drag ends
            this.dragGuideLine.style.display = 'none';
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            e.stopPropagation();
            container.classList.add('drag-over');

            // Show and position guide line
            this.showGuideLineAt(container);
        });

        container.addEventListener('dragleave', (e) => {
            e.stopPropagation();
            container.classList.remove('drag-over');

            // Don't hide the guide line here as it would flicker when moving between icons
            // The guide line will be repositioned on the next dragover event
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleDrop(e, container);
        });

        return container;
    }

    // Show guide line at the target container position
    showGuideLineAt(container) {
        if (!container || !this.isDragging) return;

        // Get the currently dragged element
        const draggedElement = this.popup.querySelector('.app-icon.dragging');
        if (!draggedElement) return;

        const draggedIndex = parseInt(draggedElement.dataset.index);
        const targetIndex = parseInt(container.dataset.index);

        // Don't show guide line if dragging onto itself
        if (draggedIndex === targetIndex) {
            this.dragGuideLine.style.display = 'none';
            return;
        }

        const rect = container.getBoundingClientRect();
        const appList = this.popup.querySelector('.app-list');
        const appListRect = appList.getBoundingClientRect();

        // Determine position based on drag direction
        let leftPosition;

        if (draggedIndex < targetIndex) {
            // Dragging forward - show guide line at the right edge
            leftPosition = rect.right + 8;
        } else {
            // Dragging backward - show guide line at the left edge
            leftPosition = rect.left - 8;
        }

        // Position the guide line
        this.dragGuideLine.style.display = 'block';
        this.dragGuideLine.style.height = `${appListRect.height}px`;
        this.dragGuideLine.style.top = `${appListRect.top}px`;
        this.dragGuideLine.style.left = `${leftPosition}px`;
    }

    async loadApps() {
        try {
            // 检查是否已经在加载中
            if (this.isLoadingApps) {
                console.warn('Already loading apps, skipping duplicate call');
                return;
            }

            // 设置加载标志
            this.isLoadingApps = true;
            console.log('Loading apps...');

            // 检查DOM元素是否存在
            if (!this.domElements.appList) {
                console.error('App list element not found, re-initializing DOM references');
                this.domElements.appList = this.popup.querySelector('.app-list');

                if (!this.domElements.appList) {
                    console.error('Failed to find app list element, aborting loadApps');
                    return;
                }
            }

            // 获取应用列表
            const apps = await this.getApps();
            const appList = this.domElements.appList;

            console.log(`App list element: ${appList.tagName}, children: ${appList.children.length}`);

            // 在操作 DOM 前先完全清空应用列表容器
            console.log('Clearing app list container...');

            // 先尝试使用 removeChild 方法清空
            try {
                while (appList.firstChild) {
                    appList.removeChild(appList.firstChild);
                }
            } catch (error) {
                console.error('Error removing children one by one:', error);
            }

            // 再次检查是否清空
            if (appList.children.length > 0) {
                console.warn(`Failed to clear app list with removeChild, still has ${appList.children.length} children`);

                // 尝试使用 innerHTML 强制清空
                try {
                    appList.innerHTML = '';
                    console.log('Cleared app list using innerHTML');
                } catch (error) {
                    console.error('Error clearing with innerHTML:', error);
                }

                // 再次检查
                if (appList.children.length > 0) {
                    console.warn(`Still failed to clear app list, has ${appList.children.length} children`);

                    // 最后尝试重新创建元素
                    try {
                        const newAppList = document.createElement('div');
                        newAppList.className = 'app-list';
                        if (appList.parentNode) {
                            appList.parentNode.replaceChild(newAppList, appList);
                            this.domElements.appList = newAppList;
                            appList = newAppList;
                            console.log('Replaced app list element with a new one');
                        }
                    } catch (error) {
                        console.error('Error replacing app list element:', error);
                    }
                }
            }

            console.log(`App list now has ${appList.children.length} children after clearing`);

            // 获取当前所有打开的标签页
            const openTabs = await this.getOpenTabs();

            console.log(`Found ${apps.length} apps to load`);

            // 添加所有应用图标
            for (let i = 0; i < apps.length; i++) {
                const app = apps[i];
                console.log(`Creating icon for app ${i}: ${app.title}`);

                // 确保应用有有效的图标
                if (!app.favicon || app.favicon === 'null' || app.favicon === 'undefined') {
                    try {
                        app.favicon = await this.getFaviconFromUrl(app.url);

                        // 检查chrome API是否可用
                        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                            try {
                                // 更新存储中的图标
                                const allApps = await this.getApps();
                                if (Array.isArray(allApps) && i < allApps.length) {
                                    allApps[i] = app;

                                    await new Promise((resolve, reject) => {
                                        try {
                                            chrome.storage.local.set({ apps: allApps }, () => {
                                                if (chrome.runtime.lastError) {
                                                    console.warn('Error saving updated favicon:', chrome.runtime.lastError);
                                                    reject(new Error(chrome.runtime.lastError.message));
                                                    return;
                                                }
                                                resolve();
                                            });
                                        } catch (storageError) {
                                            console.error('Error in chrome.storage.local.set during favicon update:', storageError);
                                            reject(storageError);
                                        }
                                    });
                                }
                            } catch (storageError) {
                                console.warn('Error updating favicon in storage:', storageError);
                                // 继续使用已获取的图标，但不保存
                            }
                        } else {
                            console.warn('Chrome storage API not available, favicon will not be saved');
                        }
                    } catch (error) {
                        console.error('Error updating favicon:', error);
                        app.favicon = this.generateDefaultIcon(app.title);
                    }
                }

                // 创建应用图标
                const appIcon = this.createAppIcon(app, i);

                // 检查该应用是否已打开
                if (this.isAppOpen(app.url, openTabs)) {
                    appIcon.classList.add('active');
                }

                // 添加到应用列表
                appList.appendChild(appIcon);
            }

            console.log('Creating add button...');

            // 添加"加用"按钮
            const addButton = document.createElement('div');
            addButton.className = 'add-app-btn';
            addButton.innerHTML = `
                <div class="plus-icon">
                    <div class="icon"></div>
                </div>
            `;

            // 使用箭头函数保持this的正确引用
            addButton.addEventListener('click', () => this.handleAddApp());

            // 添加到应用列表
            appList.appendChild(addButton);

            console.log(`App list now has ${appList.children.length} children`);
            console.log('Apps loaded successfully');
        } catch (error) {
            console.error('Error loading apps:', error);
        } finally {
            // 重置加载标志
            this.isLoadingApps = false;
        }
    }

    async getApps() {
        console.log('Getting apps from storage...');

        // 检查chrome API是否可用
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            console.warn('Chrome storage API not available, returning empty apps array');
            return [];
        }

        return new Promise((resolve) => {
            try {
                chrome.storage.local.get(['apps'], (result) => {
                    // 检查是否有错误
                    if (chrome.runtime.lastError) {
                        console.warn('Error getting apps from storage:', chrome.runtime.lastError);
                        resolve([]);
                        return;
                    }

                    // 检查结果是否有效
                    if (!result || !result.apps) {
                        console.log('No apps found in storage, returning empty array');
                        resolve([]);
                        return;
                    }

                    // 确保返回的是数组
                    if (!Array.isArray(result.apps)) {
                        console.warn('Apps in storage is not an array, returning empty array');
                        resolve([]);
                        return;
                    }

                    console.log(`Found ${result.apps.length} apps in storage`);
                    resolve(result.apps);
                });
            } catch (error) {
                console.error('Error in getApps:', error);
                resolve([]);
            }
        });
    }

    // 统一的图标获取方法，合并了 getFaviconFromUrl 和 getFavicon
    async getFaviconFromUrl(url) {
        try {
            // 检查URL是否有效
            if (!url) {
                console.warn('Invalid URL provided to getFaviconFromUrl');
                return this.generateDefaultIcon('?');
            }

            // 解析域名
            const domain = new URL(url).hostname;

            // 检查chrome API是否可用
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
                console.warn('Chrome runtime API not available, using Google favicon service');
                return await this.getGoogleFavicon(domain);
            }

            try {
                // 尝试使用background.js获取图标
                const response = await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        console.warn('Favicon request timed out');
                        reject(new Error('Timeout'));
                    }, 3000); // 3秒超时

                    try {
                        chrome.runtime.sendMessage({
                            action: 'getFavicon',
                            domain: domain,
                            url: url
                        }, (response) => {
                            clearTimeout(timeoutId);

                            // 检查是否有错误
                            if (chrome.runtime.lastError) {
                                console.warn('Error in sendMessage:', chrome.runtime.lastError);
                                reject(new Error(chrome.runtime.lastError.message));
                                return;
                            }

                            resolve(response);
                        });
                    } catch (error) {
                        clearTimeout(timeoutId);
                        console.error('Error sending message:', error);
                        reject(error);
                    }
                });

                if (response && response.favicon) {
                    return response.favicon;
                }

                // 如果没有有效响应，尝试使用Google服务
                throw new Error('No valid favicon in response');
            } catch (error) {
                console.warn('Background favicon fetch failed, trying Google service:', error);
                return await this.getGoogleFavicon(domain);
            }
        } catch (error) {
            console.error('Error getting favicon:', error);
            return this.generateDefaultIcon(url);
        }
    }

    // 使用Google服务获取图标
    async getGoogleFavicon(domain) {
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
    }

    // getFavicon 方法已删除，使用 getFaviconFromUrl 替代

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

        const iconImg = this.domElements.editAppIconImg;
        iconImg.addEventListener('error', () => this.handleImageError(iconImg, app.title, this.currentAppIndex));
        // 使用保存的图标或获取新图标
        if (app.favicon && app.favicon !== 'null' && app.favicon !== 'undefined') {
            iconImg.src = app.favicon;
        } else {
            const favicon = await this.getFaviconFromUrl(app.url);
            iconImg.src = favicon;
        }

        const titleInput = this.domElements.editTitle;
        const urlInput = this.domElements.editUrl;

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
        const urlInput = this.domElements.editUrl;
        if (urlInput && urlInput._urlChangeHandler) {
            urlInput.removeEventListener('input', urlInput._urlChangeHandler);
            urlInput._urlChangeHandler = null;
        }
        // 清除 currentAppIndex
        this.currentAppIndex = null;
    }

    async handleDelete() {
        try {
            console.log('Deleting app...');

            // 检查chrome API是否可用
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                console.error('Chrome storage API not available');
                return;
            }

            try {
                const apps = await this.getApps();
                console.log(`Current apps count: ${apps.length}, deleting index: ${this.currentAppIndex}`);

                // 确保索引有效
                if (this.currentAppIndex !== null && this.currentAppIndex >= 0 && this.currentAppIndex < apps.length) {
                    // 删除应用
                    apps.splice(this.currentAppIndex, 1);
                    console.log(`App deleted, new count: ${apps.length}`);

                    // 保存更新后的应用列表
                    await new Promise((resolve, reject) => {
                        try {
                            chrome.storage.local.set({ apps }, () => {
                                if (chrome.runtime.lastError) {
                                    console.warn('Error saving apps after delete:', chrome.runtime.lastError);
                                    reject(new Error(chrome.runtime.lastError.message));
                                    return;
                                }
                                resolve();
                            });
                        } catch (error) {
                            console.error('Error in chrome.storage.local.set during delete:', error);
                            reject(error);
                        }
                    });

                    console.log('Apps saved successfully after delete');

                    // 隐藏右键菜单
                    this.hideContextMenu();

                    // 不需要手动重新加载，因为 storage 变更会触发自动重新加载
                    console.log('Storage updated, waiting for automatic reload after delete');
                } else {
                    console.error('Invalid app index:', this.currentAppIndex);
                }
            } catch (storageError) {
                console.error('Error accessing storage during delete:', storageError);
            }
        } catch (error) {
            console.error('Error deleting app:', error);
        }
    }

    async handleSaveEdit() {
        try {
            console.log('Saving edit...');

            // 检查DOM元素
            if (!this.domElements || !this.domElements.editTitle || !this.domElements.editUrl || !this.domElements.editAppIconImg) {
                console.error('Required DOM elements not found');
                return;
            }

            const titleInput = this.domElements.editTitle;
            const urlInput = this.domElements.editUrl;
            const iconImg = this.domElements.editAppIconImg;

            const title = titleInput.value.trim();
            let url = urlInput.value.trim();

            if (!title || !url) {
                console.error('Title and URL are required');
                return;
            }

            // 自动补全 URL
            url = this.autoCompleteUrl(url);
            console.log(`Saving app: ${title} (${url})`);

            // 获取当前显示的图标
            const favicon = iconImg.src;

            // 检查chrome API是否可用
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                console.error('Chrome storage API not available');
                return;
            }

            // 获取当前应用列表
            try {
                const apps = await new Promise((resolve, reject) => {
                    try {
                        chrome.storage.local.get(['apps'], (result) => {
                            if (chrome.runtime.lastError) {
                                console.warn('Error getting apps:', chrome.runtime.lastError);
                                reject(new Error(chrome.runtime.lastError.message));
                                return;
                            }
                            resolve(result && result.apps ? result.apps : []);
                        });
                    } catch (error) {
                        console.error('Error in chrome.storage.local.get:', error);
                        reject(error);
                    }
                });

                console.log(`Current apps count: ${apps.length}`);

                // 准备新的应用对象
                const appData = {
                    title,
                    url,
                    favicon  // 使用当前显示的图标
                };

                // 更新或添加应用
                if (this.currentAppIndex !== null && this.currentAppIndex >= 0 && this.currentAppIndex < apps.length) {
                    // 更新现有应用
                    console.log(`Updating existing app at index ${this.currentAppIndex}`);
                    apps[this.currentAppIndex] = appData;
                } else {
                    // 添加新应用
                    console.log('Adding new app');
                    apps.push(appData);
                }

                // 保存更新后的应用列表
                await new Promise((resolve, reject) => {
                    try {
                        chrome.storage.local.set({ apps }, () => {
                            if (chrome.runtime.lastError) {
                                console.warn('Error saving apps:', chrome.runtime.lastError);
                                reject(new Error(chrome.runtime.lastError.message));
                                return;
                            }
                            resolve();
                        });
                    } catch (error) {
                        console.error('Error in chrome.storage.local.set:', error);
                        reject(error);
                    }
                });

                console.log('Apps saved successfully');

                // 隐藏编辑模态框
                this.hideEditModal();

                // 不需要手动重新加载，因为 storage 变更会触发自动重新加载
                console.log('Edit saved, waiting for automatic reload');
            } catch (storageError) {
                console.error('Error accessing storage:', storageError);
            }
        } catch (error) {
            console.error('Error saving edit:', error);
        }
    }

    // saveApp 方法已删除，逻辑已在 handleSaveEdit 中实现

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
        try {
            console.log(`Handling image error for ${title}`);
            const defaultIcon = this.generateDefaultIcon(title);
            img.src = defaultIcon;

            // Save the default icon to storage if we have an index
            if (index !== undefined) {
                // 检查chrome API是否可用
                if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                    console.warn('Chrome storage API not available, cannot save default icon');
                    return;
                }

                try {
                    const apps = await this.getApps();
                    if (Array.isArray(apps) && index >= 0 && index < apps.length) {
                        apps[index].favicon = defaultIcon;

                        await new Promise((resolve, reject) => {
                            try {
                                chrome.storage.local.set({ apps }, () => {
                                    if (chrome.runtime.lastError) {
                                        console.warn('Error saving default icon:', chrome.runtime.lastError);
                                        reject(new Error(chrome.runtime.lastError.message));
                                        return;
                                    }
                                    console.log('Default icon saved successfully');
                                    resolve();
                                });
                            } catch (storageError) {
                                console.error('Error in chrome.storage.local.set during icon error handling:', storageError);
                                reject(storageError);
                            }
                        });
                    } else {
                        console.warn(`Invalid app index: ${index}, cannot save default icon`);
                    }
                } catch (storageError) {
                    console.error('Error accessing storage during icon error handling:', storageError);
                }
            }
        } catch (error) {
            console.error('Error in handleImageError:', error);
            // 即使出错也不要抛出异常，因为这是错误处理函数
        }
    }

    show() {
        this.popup.classList.add('visible');
        this.visible = true;
    }

    hide() {
        this.popup.classList.remove('visible');
        this.visible = false;
    }

    togglePopup() {
        // 始终显示侧边栏，不再切换显示/隐藏状态
        if (!this.visible) {
            this.show();
        }
    }

    // clearSearchResults 方法已移除，因为我们已经移除了搜索框

    async handleDrop(e, container) {
        try {
            e.preventDefault();
            container.classList.remove('drag-over');

            // Hide the guide line when drop occurs
            if (this.dragGuideLine) {
                this.dragGuideLine.style.display = 'none';
            }

            // 检查数据传输是否有效
            if (!e.dataTransfer) {
                console.warn('No data transfer available in drop event');
                return;
            }

            const fromIndexStr = e.dataTransfer.getData('text/plain');
            if (!fromIndexStr) {
                console.warn('No source index found in data transfer');
                return;
            }

            const fromIndex = parseInt(fromIndexStr);
            const toIndex = parseInt(container.dataset.index);

            if (isNaN(fromIndex) || isNaN(toIndex)) {
                console.warn(`Invalid indices: fromIndex=${fromIndex}, toIndex=${toIndex}`);
                return;
            }

            console.log(`Dropping from index ${fromIndex} to index ${toIndex}`);

            if (fromIndex !== toIndex) {
                // 检查chrome API是否可用
                if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                    console.warn('Chrome storage API not available, cannot save app order');
                    return;
                }

                try {
                    // 获取当前应用列表
                    const apps = await this.getApps();

                    // 检查索引是否有效
                    if (!Array.isArray(apps) || fromIndex < 0 || fromIndex >= apps.length || toIndex < 0 || toIndex > apps.length) {
                        console.warn(`Invalid indices for apps array of length ${apps.length}: fromIndex=${fromIndex}, toIndex=${toIndex}`);
                        return;
                    }

                    // 移动数组元素
                    const [movedApp] = apps.splice(fromIndex, 1);
                    apps.splice(toIndex, 0, movedApp);

                    console.log(`Reordered apps, saving new order...`);

                    // 保存新顺序
                    await new Promise((resolve, reject) => {
                        try {
                            chrome.storage.local.set({ apps }, () => {
                                if (chrome.runtime.lastError) {
                                    console.warn('Error saving app order:', chrome.runtime.lastError);
                                    reject(new Error(chrome.runtime.lastError.message));
                                    return;
                                }
                                console.log('App order saved successfully');
                                resolve();
                            });
                        } catch (storageError) {
                            console.error('Error in chrome.storage.local.set during drop:', storageError);
                            reject(storageError);
                        }
                    });

                    // 不需要手动重新加载，因为 storage 变更会触发自动重新加载
                    console.log('Order saved, waiting for automatic reload');
                } catch (storageError) {
                    console.error('Error accessing storage during drop:', storageError);
                }
            } else {
                console.log('Source and target indices are the same, no reordering needed');
            }
        } catch (error) {
            console.error('Error in handleDrop:', error);
        }
    }

    // 获取当前所有打开的标签页
    async getOpenTabs() {
        return new Promise((resolve) => {
            try {
                // 检查chrome API是否可用
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    try {
                        // 设置超时处理
                        const timeoutId = setTimeout(() => {
                            console.warn('getOpenTabs request timed out');
                            resolve([]);
                        }, 2000); // 2秒超时

                        chrome.runtime.sendMessage({ action: 'getOpenTabs' }, (response) => {
                            clearTimeout(timeoutId); // 清除超时定时器

                            if (chrome.runtime.lastError) {
                                // 将错误级别从 warn 降低到 info，因为这不是严重错误
                                console.info('Note: Error getting open tabs:', chrome.runtime.lastError.message || 'Unknown error');
                                resolve([]);
                                return;
                            }
                            resolve(response && response.tabs ? response.tabs : []);
                        });
                    } catch (sendError) {
                        console.info('Note: Could not send message to get open tabs:', sendError.message || sendError);
                        resolve([]);
                    }
                } else {
                    // 将错误级别从 warn 降低到 info，因为这不是严重错误
                    console.info('Note: Chrome runtime API not available for getting open tabs');
                    resolve([]);
                }
            } catch (error) {
                console.error('Error in getOpenTabs:', error);
                resolve([]);
            }
        });
    }

    // 检查应用是否已打开
    isAppOpen(appUrl, openTabs) {
        if (!appUrl || !openTabs || !openTabs.length) return false;

        try {
            // 规范化URL以进行比较
            const appUrlObj = new URL(appUrl);
            const appDomain = appUrlObj.hostname;
            const appPath = appUrlObj.pathname + appUrlObj.search;

            // 检查是否有匹配的标签页
            return openTabs.some(tab => {
                try {
                    const tabUrlObj = new URL(tab.url);
                    // 先检查域名是否匹配
                    if (tabUrlObj.hostname === appDomain) {
                        // 对于某些网站，可能只需要检查域名匹配
                        // 对于其他网站，可能需要检查完整路径
                        // 这里采用简单的方法，只检查域名匹配
                        return true;
                    }
                    return false;
                } catch (e) {
                    return false;
                }
            });
        } catch (e) {
            return false;
        }
    }

    // 更新所有应用图标的活跃状态
    async updateActiveStatus() {
        try {
            // 检查popup是否存在
            if (!this.popup) {
                console.warn('Popup element not found, cannot update active status');
                return;
            }

            // 获取所有打开的标签页
            const openTabs = await this.getOpenTabs();

            // 获取所有应用图标
            const appIcons = this.popup.querySelectorAll('.app-icon');

            if (!appIcons || appIcons.length === 0) {
                // 没有图标需要更新
                return;
            }

            // 更新每个图标的状态
            appIcons.forEach(icon => {
                try {
                    const appUrl = icon.dataset.url;
                    if (this.isAppOpen(appUrl, openTabs)) {
                        icon.classList.add('active');
                    } else {
                        icon.classList.remove('active');
                    }
                } catch (error) {
                    console.error('Error updating icon status:', error);
                }
            });
        } catch (error) {
            console.error('Error in updateActiveStatus:', error);
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

    // handleSearch 方法已移除，因为我们已经移除了搜索框

    // translate 方法已移除，因为我们已经移除了搜索框和翻译功能

    updateLoadingPosition() {
        // 不再需要动态计算加载动画的位置，因为我们已经在CSS中设置了固定位置
        // 保留这个方法以保持兼容性
        return;
    }

    async handleAddApp() {
        try {
            console.log('Adding new app...');

            // 检查chrome API是否可用
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                console.error('Chrome storage API not available, cannot add app');
                return;
            }

            // 获取当前页面信息
            const title = document.title || 'Untitled';
            const url = window.location.href;

            if (!url) {
                console.error('Cannot get current URL');
                return;
            }

            console.log(`Adding app: ${title} (${url})`);

            try {
                // 检查是否已经添加过该应用
                const existingApps = await this.getApps();
                console.log(`Checking against ${existingApps.length} existing apps`);

                const isDuplicate = existingApps.some(app => {
                    if (!app || !app.url) return false;

                    try {
                        const appUrl = new URL(app.url);
                        const currentUrl = new URL(url);
                        return appUrl.hostname === currentUrl.hostname;
                    } catch (e) {
                        console.warn('Error comparing URLs:', e);
                        return app.url === url;
                    }
                });

                if (isDuplicate) {
                    console.log('该应用已经添加过了');
                    return; // 如果已经添加过，则不重复添加
                }

                // 获取图标
                console.log('Getting favicon...');
                let favicon;
                try {
                    favicon = await this.getFaviconFromUrl(url);
                } catch (faviconError) {
                    console.warn('Error getting favicon, using default icon:', faviconError);
                    favicon = this.generateDefaultIcon(title);
                }

                // 创建新应用对象
                const app = { title, url, favicon };

                // 添加到应用列表
                const apps = await this.getApps();
                apps.push(app);

                console.log(`Saving app to storage (total apps: ${apps.length})`);

                // 保存到存储
                await new Promise((resolve, reject) => {
                    try {
                        chrome.storage.local.set({ apps }, () => {
                            if (chrome.runtime.lastError) {
                                console.warn('Error saving app:', chrome.runtime.lastError);
                                reject(new Error(chrome.runtime.lastError.message));
                                return;
                            }
                            resolve();
                        });
                    } catch (error) {
                        console.error('Error in chrome.storage.local.set during add:', error);
                        reject(error);
                    }
                });

                console.log('App saved, reloading app list...');

                // 不需要手动重新加载，因为 storage 变更会触发自动重新加载
                console.log('App added, waiting for automatic reload');
            } catch (storageError) {
                console.error('Error accessing storage during add:', storageError);
            }
        } catch (error) {
            console.error('Error adding app:', error);
        }
    }

    // 已合并到 getFaviconFromUrl 方法中

    // 这些方法已在类中其他位置定义，此处删除重复定义

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

// 初始化 QuickTap
(function() {
    try {
        // 检查是否已经创建了实例
        if (window.quickTap && window.quickTap instanceof QuickTap) {
            console.log('QuickTap already initialized, reusing existing instance');

            // 如果实例已存在，不需要重新加载应用列表
            // 因为实例已经在初始化时加载了应用列表
            console.log('Using existing QuickTap instance, no need to reload apps');
        } else {
            console.log('Creating new QuickTap instance...');
            // 创建新实例
            const quickTap = new QuickTap();

            // 确保实例正确创建
            if (!window.quickTap) {
                console.warn('QuickTap instance not set in window object, setting it manually');
                window.quickTap = quickTap;
            }
        }
    } catch (error) {
        console.error('Error initializing QuickTap:', error);
    }
})()

// 检查chrome API是否可用
try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        // Handle extension messages
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            try {
                // 检查请求和quickTap实例是否存在
                if (!request || !window.quickTap) {
                    return;
                }

                // 不再切换侧边栏显示状态
                // if (request.action === 'toggle') {
                //     window.quickTap.togglePopup();
                // } else
                if (request.action === 'updateShortcut') {
                    window.quickTap.shortcut = request.shortcut;
                } else if (request.action === 'tabsChanged') {
                    // 标签页变化时更新图标状态
                    window.quickTap.updateActiveStatus();
                }
            } catch (error) {
                console.error('Error handling extension message:', error);
            }
        });
        console.info('Chrome runtime message listener added successfully');
    } else {
        // 将错误级别从 warn 降低到 info，因为这不是严重错误
        console.info('Note: Chrome runtime API not available, message listener not added');
    }
} catch (error) {
    console.info('Note: Error setting up message listener:', error.message || error);
}
