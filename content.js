class SideDock {
    constructor() {
        // 检查是否已经创建了实例
        if (window.sideDock) {
            console.warn('SideDock instance already exists, returning existing instance');
            return window.sideDock;
        }

        // 将实例绑定到全局变量
        window.sideDock = this;
        console.log('Creating new SideDock instance');

        // 基本属性
        this.popup = null;
        this.searchBox = null;
        this.appList = null;
        this.contextMenu = null;
        this.editModal = null;
        this.currentAppIndex = null;
        this.shortcut = { key: 'z', ctrl: false, alt: false, shift: false, command: false };
        this.loadingSpinner = null;
        this.isInitialized = false; // 添加初始化标志
        this.hideTimer = null; // 用于定时隐藏侧边栏
        this.triggerZone = null; // 屏幕边缘触发区域

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

        // 指示线闲置定时器
        this.triggerIdleTimer = null;
        this.IDLE_DELAY = 2000; // 闲置判定时长（毫秒）

        // 防抖动相关变量
        this.showSidebarTimer = null;
        this.showSidebarDelay = 300; // 显示侧边栏的延迟时间（毫秒）
        this.lastShowTime = 0; // 上次显示侧边栏的时间戳

        // Listen for changes in chrome.storage
       this.isLoadingApps = false; // 添加标志防止重复加载
       this.loadingTimeout = null; // 用于防止短时间内多次加载
       this.isDragging = false; // 添加标志防止拖拽时重新加载

        this.storageChangeHandler = (changes, namespace) => {
            try {
                if (namespace === 'local' && changes && changes.apps) {
                   if (this.isDragging) {
                       console.log('Storage changed during drag, skipping app reload');
                       return;
                   }
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

        console.log('Initializing SideDock...');

        // 移除可能存在的旧元素
        console.log('Removing existing SideDock elements...');
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
            console.warn(`Still have ${remainingElements.length} SideDock elements after cleanup, forcing removal`);
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

        // 创建屏幕边缘触发区域（半透明白色指示条）
        this.triggerZone = document.createElement('div');
        this.triggerZone.className = 'quicktap-trigger-zone quicktap-extension';
        // 初始时显示触发区域，因为侧边栏默认不显示
        this.triggerZone.style.display = 'block';
        // 初始时将触发区域设置为闲置状态
        this.triggerZone.classList.add('idle');
        document.body.appendChild(this.triggerZone);
        this.visible = false; // 初始为不可见

        // 确保触发区域初始状态正确
        // 保持idle类，使指示条处于闲置状态

        // 添加防抖动变量
        this.showSidebarTimer = null;
        this.showSidebarDelay = 300; // 300ms延迟，防止抖动
        this.lastShowTime = 0; // 记录上次显示时间

        // 添加触发区域的鼠标进入事件（立即触发，无延迟）
        this.triggerZone.addEventListener('mouseenter', () => {
            console.log('[QuickTap Debug] Mouse entered triggerZone'); // Add log
            // 清除可能存在的闲置定时器
            if (this.triggerIdleTimer) {
                clearTimeout(this.triggerIdleTimer);
                this.triggerIdleTimer = null;
                console.log('[QuickTap Debug] Cleared triggerIdleTimer on triggerZone mouseenter');
            }
            // 移除idle状态，确保指示条完全可见
            if (this.triggerZone) {
                // 强制移除idle类，确保指示线完全可见
                this.triggerZone.classList.remove('idle');
                console.log('[QuickTap Debug] Removed idle class from triggerZone on mouseenter. Classes:', this.triggerZone.classList.toString());
            }

            // 防抖动：检查距离上次显示的时间
            const now = Date.now();
            if (now - this.lastShowTime < 1000) { // 如果1秒内刚显示过，则不再触发
                console.log('[QuickTap Debug] Ignoring rapid re-entry, last show was', now - this.lastShowTime, 'ms ago');
                return;
            }

            // 清除可能存在的显示定时器
            if (this.showSidebarTimer) {
                clearTimeout(this.showSidebarTimer);
                this.showSidebarTimer = null;
            }

            // 立即显示侧边栏，不使用延迟
            if (!this.visible) {
                console.log('[QuickTap Debug] Sidebar not visible, calling show() from triggerZone mouseenter (immediate)');
                this.show();
                this.lastShowTime = Date.now(); // 记录显示时间
            } else {
                console.log('[QuickTap Debug] Sidebar already visible, not calling show() from triggerZone mouseenter');
            }
        });
        this.triggerZone.addEventListener('mouseleave', () => {
            console.log('[QuickTap Debug] Mouse left triggerZone'); // Add log

            // 清除可能存在的显示定时器，防止离开后仍然触发显示
            if (this.showSidebarTimer) {
                clearTimeout(this.showSidebarTimer);
                this.showSidebarTimer = null;
                console.log('[QuickTap Debug] Cleared showSidebarTimer on triggerZone mouseleave');
            }

            // 鼠标离开触发区，如果侧边栏未显示，则启动闲置计时器
            if (!this.visible && this.triggerZone && this.triggerZone.style.display !== 'none') {
                console.log('[QuickTap Debug] Sidebar hidden and triggerZone visible, starting idle timer...');
                if (this.triggerIdleTimer) {
                    clearTimeout(this.triggerIdleTimer);
                }
                this.triggerIdleTimer = setTimeout(() => {
                    console.log('[QuickTap Debug] Idle timer fired');
                    // 检查条件再次满足时才添加idle类
                    if (!this.visible && this.triggerZone && this.triggerZone.style.display !== 'none') {
                        this.triggerZone.classList.add('idle');
                        console.log('[QuickTap Debug] Added idle class to triggerZone. Classes:', this.triggerZone.classList.toString());
                    } else {
                        console.log('[QuickTap Debug] Condition not met for adding idle class');
                    }
                    this.triggerIdleTimer = null; // 清除计时器引用
                }, this.IDLE_DELAY); // 使用常量 IDLE_DELAY
            } else {
                console.log(`[QuickTap Debug] Not starting idle timer (sidebar visible: ${this.visible})`);
            }
        });

        // Load shortcut settings
        try {
            // 检查chrome API是否可用
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                // 使用Promise包装异步调用，确保在初始化完成前加载快捷键设置
                const loadShortcut = async () => {
                    return new Promise((resolve) => {
                        chrome.storage.sync.get(['shortcut'], (result) => {
                            try {
                                if (chrome.runtime.lastError) {
                                    console.warn('Error loading shortcut settings:', chrome.runtime.lastError);
                                    resolve(false);
                                    return;
                                }

                                if (result && result.shortcut) {
                                    console.log('[QuickTap Debug] Loaded shortcut settings:', JSON.stringify(result.shortcut));
                                    this.shortcut = result.shortcut;
                                    resolve(true);
                                } else {
                                    console.log('[QuickTap Debug] No shortcut settings found, using default');
                                    resolve(false);
                                }
                            } catch (error) {
                                console.error('Error processing shortcut settings:', error);
                                resolve(false);
                            }
                        });
                    });
                };

                // 立即执行加载
                loadShortcut().then(success => {
                    console.log('[QuickTap Debug] Shortcut loading completed, success:', success);
                    console.log('[QuickTap Debug] Current shortcut setting:',
                                'Key:', this.shortcut.key,
                                'Ctrl:', this.shortcut.ctrl,
                                'Alt:', this.shortcut.alt,
                                'Shift:', this.shortcut.shift,
                                'Command:', this.shortcut.command);
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

        // 拖拽排序功能已移除

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

        // 拖拽排序功能已移除

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

        // 添加侧边栏的鼠标进入和离开事件
        this.popup.addEventListener('mouseenter', () => {
            // 当鼠标进入侧边栏时，清除隐藏定时器
            if (this.hideTimer) {
                clearTimeout(this.hideTimer);
                this.hideTimer = null;
            }
        });

        this.popup.addEventListener('mouseleave', (e) => {
            console.log('[QuickTap Debug] Mouse left popup'); // Add log

            // 检查鼠标是否移动到了侧边栏和屏幕边缘之间的区域
            // 如果鼠标位置在侧边栏左侧（即屏幕边缘和侧边栏之间），则不隐藏侧边栏
            if (e.clientX < this.popup.getBoundingClientRect().left && e.clientX >= 0) {
                console.log('[QuickTap Debug] Mouse moved to the area between sidebar and screen edge, not hiding');
                return;
            }

            // 鼠标离开侧边栏时，立即隐藏
            const isEditVisible = this.editModal && this.editModal.style.display !== 'none';
            const isContextMenuVisible = this.contextMenu && this.contextMenu.style.display === 'block';

            if (this.visible && !isEditVisible && !isContextMenuVisible) {
               // 延迟隐藏，给拖拽操作完成留出时间
               setTimeout(() => {
                   console.log('[QuickTap Debug] Conditions met, calling hide() from popup mouseleave');
                   this.hide();
               }, 200); // 200ms 延迟
               // Redundant timer clear, hide() handles this now
                // if (this.hideTimer) {
                //     clearTimeout(this.hideTimer);
                //     this.hideTimer = null;
                //     console.log('[QuickTap Debug] Cleared hideTimer in popup mouseleave (should not happen)');
                // }
            } else {
                console.log(`[QuickTap Debug] Conditions not met for hiding from popup mouseleave (visible: ${this.visible}, editVisible: ${isEditVisible}, contextMenuVisible: ${isContextMenuVisible})`);
            }
        });

        // 添加快捷键切换侧边栏显示状态
        document.addEventListener('keydown', (e) => {
            // 输出当前按下的键和快捷键设置，用于调试
            console.log('[QuickTap Debug] Key pressed:', e.key.toLowerCase(),
                        'Ctrl:', e.ctrlKey,
                        'Alt:', e.altKey,
                        'Shift:', e.shiftKey,
                        'Meta:', e.metaKey);
            console.log('[QuickTap Debug] Current shortcut setting:',
                        'Key:', this.shortcut.key,
                        'Ctrl:', this.shortcut.ctrl,
                        'Alt:', this.shortcut.alt,
                        'Shift:', this.shortcut.shift,
                        'Command:', this.shortcut.command);

            // Skip if the active element is an input field
            if (document.activeElement.tagName === 'INPUT' ||
                document.activeElement.tagName === 'TEXTAREA' ||
                document.activeElement.isContentEditable) {
                console.log('[QuickTap Debug] Ignoring shortcut in input field:', document.activeElement.tagName);
                return;
            }

            // Check if the pressed keys match the custom shortcut
            const keyMatches = e.key.toLowerCase() === this.shortcut.key;
            const ctrlMatches = e.ctrlKey === !!this.shortcut.ctrl;
            const altMatches = e.altKey === !!this.shortcut.alt;
            const shiftMatches = e.shiftKey === !!this.shortcut.shift;
            // 处理command属性，如果不存在则默认为false
            const commandMatches = e.metaKey === !!this.shortcut.command;

            console.log('[QuickTap Debug] Shortcut match check:',
                        'Key:', keyMatches,
                        'Ctrl:', ctrlMatches,
                        'Alt:', altMatches,
                        'Shift:', shiftMatches,
                        'Command:', commandMatches);

            if (keyMatches && ctrlMatches && altMatches && shiftMatches && commandMatches) {
                e.preventDefault();
                console.log('[QuickTap Debug] Shortcut detected, toggling sidebar');
                this.togglePopup();
            }
        });

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

        // 侧边栏默认已隐藏，指示条已设置为闲置状态
        console.log('[QuickTap Debug] Sidebar initialized in hidden state with idle indicator');

        // 定期更新图标活跃状态
        this.updateActiveStatus();
        setInterval(() => this.updateActiveStatus(), 5000); // 每5秒更新一次

        // 设置初始化标志
        this.isInitialized = true;
        console.log('SideDock initialization complete');
    }

    createAppIcon(app, index) {
        // 渲染时data-index严格按顺序
        const container = document.createElement('a');
        container.href = app.url;
        container.className = 'app-icon';
        container.title = app.title;
        container.dataset.index = index;
        container.dataset.url = app.url;
        container.draggable = true; // 启用拖拽

        const img = document.createElement('img');
        img.alt = app.title;
        img.addEventListener('error', () => this.handleImageError(img, app.title, index));
        img.src = app.favicon;

        const indicator = document.createElement('div');
        indicator.className = 'active-indicator';
        container.style.position = 'relative';
        container.appendChild(img);
        container.appendChild(indicator);

        // 右键菜单
        container.addEventListener('contextmenu', (e) => {
            this.showContextMenu(e, index);
        });
        // 点击跳转
        container.addEventListener('click', (e) => {
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
                window.open(app.url, '_blank');
                e.preventDefault();
                return;
            }
            try {
                chrome.runtime.sendMessage({ action: 'switchOrOpenUrl', url: app.url }, (response) => {
                    if (chrome.runtime.lastError) {
                        window.open(app.url, '_blank');
                        return;
                    }
                });
            } catch { window.open(app.url, '_blank'); }
            e.preventDefault();
        });
        return container;
    }

    // 获取拖拽目标位置的辅助方法
    getDragAfterElement(container, y) {
        const draggableElements = [...this.popup.querySelectorAll('.app-icon:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
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
                // 强制刷新data-index，防止拖拽后索引错乱
                appIcon.dataset.index = i;

                // 检查该应用是否已打开
                if (this.isAppOpen(app.url, openTabs)) {
                    appIcon.classList.add('active');
                }

                // 添加拖拽事件监听器
                appIcon.addEventListener('dragstart', (e) => {
                    this.isDragging = true;
                    // e.stopPropagation(); // Might prevent some default browser drag behaviors if needed
                    // Use element's index at drag start
                    e.dataTransfer.setData('text/plain', appIcon.dataset.index);
                    e.dataTransfer.effectAllowed = 'move';
                    // Add delay to allow setting drag image properly
                    setTimeout(() => {
                        appIcon.classList.add('dragging');
                    }, 0);
                    // 设置拖拽图像
                    const dragImage = document.createElement('img');
                    dragImage.src = appIcon.querySelector('img').src;
                    dragImage.style.width = '32px';
                    dragImage.style.height = '32px';
                    dragImage.style.opacity = '0.7';
                    dragImage.style.position = 'absolute'; // Avoid affecting layout
                    dragImage.style.left = '-9999px'; // Hide it initially
                    document.body.appendChild(dragImage);
                    e.dataTransfer.setDragImage(dragImage, 16, 16); // Center image on cursor
                    // Clean up drag image after setting it
                    setTimeout(() => document.body.removeChild(dragImage), 0);
                });

                // {{edit 2: Modify dragend listener}}
                appIcon.addEventListener('dragend', (e) => {
                    // Use querySelector to ensure we remove class from the correct element if it exists
                    const draggingElem = this.popup?.querySelector('.app-icon.dragging');
                    if (draggingElem) {
                        draggingElem.classList.remove('dragging');
                    }
                    // Reset isDragging flag when drag operation concludes
                    this.isDragging = false;
                    // console.log('Drag ended, isDragging set to false');
                    // Clear dataTransfer data (optional, good practice)
                    // e.dataTransfer.clearData(); // This might cause issues on some browsers, test carefully
                });

                appIcon.addEventListener('dragover', (e) => {
                    e.preventDefault(); // Necessary to allow drop
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move'; // Indicate moving is allowed

                    const draggingElement = this.popup?.querySelector('.dragging');
                    // Ensure we have a dragging element and it's not the element we are hovering over
                    if (!draggingElement || draggingElement === appIcon) return;

                    const appListContainer = this.domElements.appList;
                    if(!appListContainer) return;

                    const afterElement = this.getDragAfterElement(appListContainer, e.clientY);

                    // Perform insert/append only if the position changes
                    if (afterElement) {
                        // Insert before afterElement only if draggingElement isn't already before it
                        if(draggingElement.nextSibling !== afterElement){
                            appListContainer.insertBefore(draggingElement, afterElement);
                        }
                    } else {
                        // Append to end only if draggingElement isn't already the last child
                        if(appListContainer.lastElementChild !== draggingElement){
                             appListContainer.appendChild(draggingElement);
                        }
                    }
                });

                // {{edit 1: Replace drop listener logic}}
                appIcon.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const draggedElement = this.popup?.querySelector('.dragging');
                    // Ensure drop happens on a valid target and we were dragging something
                    if (!draggedElement || !appIcon.classList.contains('app-icon')) {
                        console.warn('Drop happened on invalid target or no element was being dragged.');
                        // Ensure drag state is reset anyway (handled by dragend)
                        return;
                    }

                    console.log('[DEBUG] Drop event triggered');

                    // Monkey patch chrome.runtime.sendMessage to prevent updateApps messages
                    const originalSendMessage = chrome.runtime.sendMessage;
                    chrome.runtime.sendMessage = function(message, callback) {
                        if (message && message.action === 'updateApps') {
                            console.warn('[DEBUG] Intercepted updateApps message, preventing it from being sent');
                            if (callback) {
                                setTimeout(() => {
                                    callback({ success: true, intercepted: true });
                                }, 0);
                            }
                            return;
                        }
                        return originalSendMessage.apply(chrome.runtime, arguments);
                    };

                    try {
                        // 1. Get the new order based on the current DOM structure
                        const finalAppIcons = Array.from(this.domElements.appList.querySelectorAll('.app-icon'));
                        const originalApps = await this.getApps(); // Get original data array

                         // Check if elements exist before proceeding
                         if (!finalAppIcons.length || !originalApps.length) {
                            console.error('Could not get final icons or original apps data during drop.');
                            return;
                         }

                        // Create a map of URL -> app data for efficient lookup
                        const appDataMap = new Map();
                        originalApps.forEach(app => {
                            if (app && app.url) {
                                appDataMap.set(app.url, app);
                            } else {
                                console.warn('Found app with missing URL in originalApps during drop mapping');
                            }
                        });

                        const newAppsOrder = [];
                        let dataConsistent = true;

                        // 2. Rebuild the apps array and update data-index attributes immediately
                        finalAppIcons.forEach((icon, index) => {
                            const url = icon.dataset.url;
                            if (appDataMap.has(url)) {
                                newAppsOrder.push(appDataMap.get(url));
                                // Update data-index immediately to match new DOM order
                                icon.dataset.index = index.toString();
                            } else {
                                console.error(`Data inconsistency: Could not find app data for URL: ${url} at DOM index ${index} during reorder.`);
                                dataConsistent = false;
                                // Potentially push a placeholder or skip? Skipping loses data.
                                // For now, log error and mark as inconsistent.
                            }
                        });

                        // 3. Check for consistency before saving
                        if (!dataConsistent || newAppsOrder.length !== originalApps.length) {
                            console.error("App order inconsistency detected! Aborting save. Triggering recovery reload.",
                                          "Original Count:", originalApps.length, "New Count:", newAppsOrder.length);
                            // Optional: Trigger a full reload to try and recover state
                            // Be cautious with this to avoid loops if the error persists.
                            // await this.loadApps(); // Consider if safe
                            return; // Prevent saving inconsistent data
                        }

                        // 4. Save the new order to storage via background script
                        console.log('[DEBUG] Using direct storage method for saving app order');
                        console.trace('Call stack for saving app order');
                        try {
                            // 直接使用本地存储而不是通过background.js
                            await new Promise((resolve, reject) => {
                                chrome.storage.local.set({ apps: newAppsOrder }, () => {
                                    if (chrome.runtime.lastError) {
                                        console.error('Error saving apps after drop:', chrome.runtime.lastError);
                                        reject(new Error(chrome.runtime.lastError.message || 'Error saving apps'));
                                    } else {
                                        console.log('App order saved successfully after drop');
                                        resolve();
                                    }
                                });
                            });

                            // 测试代码，看看是否还有其他地方在发送updateApps消息
                            console.log('[DEBUG] Successfully saved app order directly, checking if there are other updateApps calls');

                            // 添加一个小延迟，等待可能的其他调用
                            setTimeout(() => {
                                console.log('[DEBUG] Delayed check complete');
                            }, 500);

                        } catch (storageError) {
                            console.error('Error saving app order to storage:', storageError);
                            // Data index was updated optimistically. If save fails,
                            // the next storage change or manual refresh should correct it.
                        }
                        // Drag state (isDragging, .dragging class) is reset in the 'dragend' listener

                    } catch (error) {
                        console.error('Error processing drop event:', error);
                        // Attempt to restore consistency? Or rely on dragend cleanup.
                    } finally {
                        // 恢复原始的chrome.runtime.sendMessage函数
                        setTimeout(() => {
                            chrome.runtime.sendMessage = originalSendMessage;
                            console.log('[DEBUG] Restored original chrome.runtime.sendMessage');
                        }, 1000); // 给其他可能的调用一些时间
                    }
                    // 'isDragging' and '.dragging' class are reset in 'dragend' which always fires after 'drop'
                });

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

    // 侧边栏显示方法
    show() {
        console.log('[QuickTap Debug] show() called'); // Add log

        // 防抖动：检查是否正在显示中
        if (this.visible && this.popup && this.popup.classList.contains('visible')) {
            console.log('[QuickTap Debug] Sidebar already visible, ignoring redundant show() call');
            return;
        }

        // 强制显示侧边栏
        if (this.popup) {
            this.popup.classList.add('visible');
            this.visible = true;
            console.log('[QuickTap Debug] Popup shown, visible set to true. Popup Classes:', this.popup.classList.toString());

            // 移除临时样式（如果之前添加过）
            // 不再需要设置opacity，因为我们始终保持不透明度为1
            // this.popup.style.opacity = '';
            this.popup.style.visibility = '';
            this.popup.style.left = '';
        } else {
            console.log('[QuickTap Debug] Popup not found in show()');
        }

        // 当侧边栏显示时，完全隐藏触发区域（指示条）
        if (this.triggerZone) {
            console.log('[QuickTap Debug] Updating triggerZone in show()');
            this.triggerZone.style.display = 'none'; // 完全隐藏触发区域
            this.triggerZone.classList.remove('visible');
            this.triggerZone.classList.remove('active');
            this.triggerZone.classList.remove('idle');
            console.log('[QuickTap Debug] triggerZone hidden. Classes:', this.triggerZone.classList.toString());
            if (this.triggerIdleTimer) {
                clearTimeout(this.triggerIdleTimer);
                this.triggerIdleTimer = null;
                console.log('[QuickTap Debug] Cleared triggerIdleTimer in show()');
            }
        } else {
            console.log('[QuickTap Debug] triggerZone not found in show()');
        }
    }

    togglePopup() {
        // 切换侧边栏的显示/隐藏状态
        console.log('[QuickTap Debug] togglePopup called, current visible state:', this.visible);
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    // clearSearchResults 方法已移除，因为我们已经移除了搜索框

    // 拖拽排序相关方法已移除

    // 获取当前所有打开的标签页
    async getOpenTabs() {
        return new Promise((resolve) => {
            try {
                // 检查chrome API是否可用
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    try {
                        // 设置超时处理
                        const timeoutId = setTimeout(() => {
                            console.info('Note: getOpenTabs request timed out, using empty tabs list');
                            resolve([]);
                        }, 3000); // 增加到3秒超时

                        chrome.runtime.sendMessage({ action: 'getOpenTabs' }, (response) => {
                            clearTimeout(timeoutId);

                            // 检查运行时错误
                            if (chrome.runtime.lastError) {
                                console.info('Note: Chrome runtime returned error for getOpenTabs:',
                                    chrome.runtime.lastError.message || 'Unknown error');
                                resolve([]);
                                return;
                            }

                            // 验证响应数据
                            if (!response || !Array.isArray(response.tabs)) {
                                console.info('Note: Invalid response format from getOpenTabs');
                                resolve([]);
                                return;
                            }

                            resolve(response.tabs);
                        });
                    } catch (sendError) {
                        console.info('Note: Failed to send getOpenTabs message:',
                            sendError.message || sendError);
                        resolve([]);
                    }
                } else {
                    console.info('Note: Chrome runtime API not available for getOpenTabs');
                    resolve([]);
                }
            } catch (error) {
                console.error('Unexpected error in getOpenTabs:', error);
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

                let duplicateIndex = -1;
                const isDuplicate = existingApps.some((app, index) => {
                    if (!app || !app.url) return false;

                    try {
                        // 使用完整URL进行比较，包括协议、域名、路径和查询参数
                        const appUrl = new URL(app.url);
                        const currentUrl = new URL(url);

                        // 完整URL比较，包括协议、域名、路径和查询参数
                        const appFullUrl = `${appUrl.origin}${appUrl.pathname}`;
                        const currentFullUrl = `${currentUrl.origin}${currentUrl.pathname}`;

                        console.log(`比较URL: ${appFullUrl} 与 ${currentFullUrl}`);

                        const isMatch = appFullUrl === currentFullUrl;
                        if (isMatch) {
                            console.log('找到重复应用，完整URL匹配');
                            duplicateIndex = index;
                        }
                        return isMatch;
                    } catch (e) {
                        console.warn('Error comparing URLs:', e);
                        // 如果无法解析URL，则直接比较字符串
                        const isMatch = app.url === url;
                        if (isMatch) {
                            console.log('找到重复应用，字符串匹配');
                            duplicateIndex = index;
                        }
                        return isMatch;
                    }
                });

                if (isDuplicate) {
                    console.log('该应用已经添加过了');

                    // 高亮显示已添加的应用图标
                    this.highlightDuplicateApp(duplicateIndex);

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

    // 高亮显示已添加的应用图标
    highlightDuplicateApp(index) {
        try {
            if (index < 0 || !this.popup) {
                return;
            }

            // 获取所有应用图标
            const appIcons = this.popup.querySelectorAll('.app-icon');

            // 确保索引有效
            if (index >= appIcons.length) {
                return;
            }

            // 获取目标图标
            const targetIcon = appIcons[index];

            // 添加高亮类
            targetIcon.classList.add('duplicate-highlight');

            // 滚动到该图标位置（如果需要）
            targetIcon.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // 一段时间后移除高亮类
            setTimeout(() => {
                targetIcon.classList.remove('duplicate-highlight');
            }, 2500); // 与动画时间匹配（0.8s * 3 = 2.4s）
        } catch (error) {
            console.error('Error highlighting duplicate app:', error);
        }
    }

    // 侧边栏自动隐藏实现 - 已移至上方的show()方法

    hide() {
        console.log('[QuickTap Debug] hide() called'); // Add log

        // 防抖动：检查是否已经隐藏
        if (!this.visible && this.popup && !this.popup.classList.contains('visible')) {
            console.log('[QuickTap Debug] Sidebar already hidden, ignoring redundant hide() call');
            return;
        }

        if (this.popup) {
            this.popup.classList.remove('visible');
            this.visible = false;
            console.log('[QuickTap Debug] Popup hidden, visible set to false. Popup Classes:', this.popup.classList.toString());
        } else {
            console.log('[QuickTap Debug] Popup not found in hide()');
        }
        if (this.triggerZone) {
            console.log('[QuickTap Debug] Updating triggerZone in hide()');
            // 清除可能存在的闲置定时器
            if (this.triggerIdleTimer) {
                clearTimeout(this.triggerIdleTimer);
                this.triggerIdleTimer = null;
                console.log('[QuickTap Debug] Cleared triggerIdleTimer in hide()');
            }

            // 隐藏触发区域，稍后再显示
            this.triggerZone.style.display = 'none';

            // 延迟0.5秒后显示触发区域
            setTimeout(() => {
                if (!this.visible && this.triggerZone) {
                    // 重置动画，确保每次都能重新触发
                    this.triggerZone.classList.remove('idle'); // 先移除idle类，确保动画效果正常

                    // 重置伪元素的动画，这里使用一个技巧来强制重新触发动画
                    this.triggerZone.classList.remove('animate-indicator');
                    void this.triggerZone.offsetWidth; // 触发重排，重置动画
                    this.triggerZone.classList.add('animate-indicator');

                    // 显示触发区域（半透明白色指示条）
                    this.triggerZone.style.display = 'block';
                    console.log('[QuickTap Debug] triggerZone shown after delay with animation. Classes:', this.triggerZone.classList.toString());

                    // 启动闲置定时器，在一段时间后使指示线变得更微弱
                    this.triggerIdleTimer = setTimeout(() => {
                        console.log('[QuickTap Debug] Idle timer fired in hide()');
                        if (!this.visible && this.triggerZone && this.triggerZone.style.display !== 'none') {
                            this.triggerZone.classList.add('idle');
                            console.log('[QuickTap Debug] Added idle class to triggerZone in hide(). Classes:', this.triggerZone.classList.toString());
                        }
                        this.triggerIdleTimer = null;
                    }, this.IDLE_DELAY);
                }
            }, 500); // 0.5秒延迟
        } else {
            console.log('[QuickTap Debug] triggerZone not found in hide()');
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

// 初始化 QuickTap
(function() {
    try {
        // 检查是否已经创建了实例
        if (window.sideDock && window.sideDock instanceof SideDock) {
            console.log('SideDock already initialized, reusing existing instance');

            // 如果实例已存在，不需要重新加载应用列表
            // 因为实例已经在初始化时加载了应用列表
            console.log('Using existing SideDock instance, no need to reload apps');
        } else {
            console.log('Creating new SideDock instance...');
            // 创建新实例
            const sideDock = new SideDock();

            // 确保实例正确创建
            if (!window.sideDock) {
                console.warn('SideDock instance not set in window object, setting it manually');
                window.sideDock = sideDock;
            }
        }
    } catch (error) {
        console.error('Error initializing SideDock:', error);
    }
})()

// 检查chrome API是否可用
try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        // Handle extension messages
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            try {
                // 检查请求和sideDock实例是否存在
                if (!request || !window.sideDock) {
                    return;
                }

                // 处理切换侧边栏显示状态的请求
                if (request.action === 'toggle') {
                    console.log('[QuickTap Debug] Received toggle message from extension');
                    window.sideDock.togglePopup();
                } else
                if (request.action === 'updateShortcut' && request.shortcut) {
                    // 处理快捷键更新消息
                    console.log('[QuickTap Debug] Received shortcut update:', JSON.stringify(request.shortcut));
                    window.sideDock.shortcut = request.shortcut;
                    console.log('[QuickTap Debug] Shortcut updated to:',
                                'Key:', window.sideDock.shortcut.key,
                                'Ctrl:', window.sideDock.shortcut.ctrl,
                                'Alt:', window.sideDock.shortcut.alt,
                                'Shift:', window.sideDock.shortcut.shift,
                                'Command:', window.sideDock.shortcut.command);
                } else if (request.action === 'tabsChanged') {
                    // 标签页变化时更新图标状态
                    window.sideDock.updateActiveStatus();
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
