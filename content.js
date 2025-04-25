class SideDock {
    constructor() {
        // 检查是否已经创建了实例
        if (window.sideDock) {
            // SideDock instance already exists, returning existing instance
            return window.sideDock;
        }

        // 将实例绑定到全局变量
        window.sideDock = this;
        // Creating new SideDock instance

        // 基本属性
        this.popup = null;
        this.searchBox = null;
        this.appList = null;
        this.contextMenu = null;
        this.editModal = null;
        this.groupPopup = null; // 分组弹窗
        this.childContextMenu = null; // 子应用上下文菜单
        this.currentAppIndex = null;
        this.currentGroupIndex = null; // 当前分组索引
        this.currentChildIndex = null; // 当前子应用索引
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

        // 状态标志
        this.isLoadingApps = false;
        this.loadingTimeout = null;
        this.isDragging = false;

        this.storageChangeHandler = (changes, namespace) => {
            try {
                if (namespace === 'local' && changes && changes.apps) {
                   if (this.isDragging) {
                       return;
                   }
                   // Storage changed, scheduling app reload

                   // 清除之前的定时器
                    if (this.loadingTimeout) {
                        clearTimeout(this.loadingTimeout);
                    }

                    // 如果已经在加载中，则不重复加载
                    if (this.isLoadingApps) {
                        // Apps already loading, skipping redundant load
                        return;
                    }

                    // 设置定时器，延迟加载以防止多次触发
                    this.loadingTimeout = setTimeout(() => {
                        // Executing delayed app reload
                        this.loadApps();
                    }, 100); // 100ms 延迟，合并短时间内的多次变更
                }
            } catch (error) {
                // Error in storage change handler
            }
        };

        // 检查chrome API是否可用
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            try {
                // 移除可能存在的旧监听器
                chrome.storage.onChanged.removeListener(this.storageChangeHandler);

                // 添加新监听器
                chrome.storage.onChanged.addListener(this.storageChangeHandler);
                // Storage change listener added
            } catch (error) {
                // Error setting up storage change listener
            }
        } else {
            // Chrome storage API not available, storage change listener not added
        }
    }

    init() {
        // 检查是否已经初始化
        if (window.sideDockInstance) {
            return window.sideDockInstance;
        }

        // 移除可能存在的旧元素
        const existingElements = document.querySelectorAll('.sidedock-extension');
        existingElements.forEach(element => {
            try {
                element.remove();
            } catch (error) {
                // 忽略错误
            }
        });

        // 再次检查是否有元素没有被清除
        const remainingElements = document.querySelectorAll('.sidedock-extension');
        if (remainingElements.length > 0) {
            remainingElements.forEach(element => {
                try {
                    if (element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                } catch (error) {
                    // 忽略错误
                }
            });
        }

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'sidedock-overlay sidedock-extension';
        document.body.appendChild(this.overlay);

        // 创建屏幕边缘触发区域
        this.triggerZone = document.createElement('div');
        this.triggerZone.className = 'sidedock-trigger-zone sidedock-extension';
        this.triggerZone.style.display = 'block';
        this.triggerZone.classList.add('idle');
        document.body.appendChild(this.triggerZone);
        this.visible = false; // 初始为不可见

        // 添加触发区域的鼠标进入事件（立即触发，无延迟）
        this.triggerZone.addEventListener('mouseenter', () => {
            // Mouse entered triggerZone
            // 清除可能存在的闲置定时器
            if (this.triggerIdleTimer) {
                clearTimeout(this.triggerIdleTimer);
                this.triggerIdleTimer = null;
            }
            // 移除idle状态，确保指示条完全可见
            if (this.triggerZone) {
                // 强制移除idle类，确保指示线完全可见
                this.triggerZone.classList.remove('idle');
            }

            // 防抖动：检查距离上次显示的时间
            const now = Date.now();
            if (now - this.lastShowTime < 1000) { // 如果1秒内刚显示过，则不再触发
                return;
            }

            // 清除可能存在的显示定时器
            if (this.showSidebarTimer) {
                clearTimeout(this.showSidebarTimer);
                this.showSidebarTimer = null;
            }

            // 立即显示侧边栏，不使用延迟
            if (!this.visible) {
                this.show();
                this.lastShowTime = Date.now(); // 记录显示时间
            }
        });
        this.triggerZone.addEventListener('mouseleave', () => {
            // Mouse left triggerZone

            // 清除可能存在的显示定时器，防止离开后仍然触发显示
            if (this.showSidebarTimer) {
                clearTimeout(this.showSidebarTimer);
                this.showSidebarTimer = null;
            }

            // 鼠标离开触发区，如果侧边栏未显示，则启动闲置计时器
            if (!this.visible && this.triggerZone && this.triggerZone.style.display !== 'none') {
                if (this.triggerIdleTimer) {
                    clearTimeout(this.triggerIdleTimer);
                }
                this.triggerIdleTimer = setTimeout(() => {
                    // 检查条件再次满足时才添加idle类
                    if (!this.visible && this.triggerZone && this.triggerZone.style.display !== 'none') {
                        this.triggerZone.classList.add('idle');
                    }
                    this.triggerIdleTimer = null; // 清除计时器引用
                }, this.IDLE_DELAY); // 使用常量 IDLE_DELAY
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
                                    // Error loading shortcut settings
                                    resolve(false);
                                    return;
                                }

                                if (result && result.shortcut) {
                                    this.shortcut = result.shortcut;
                                    resolve(true);
                                } else {
                                    resolve(false);
                                }
                            } catch (error) {
                                // Error processing shortcut settings
                                resolve(false);
                            }
                        });
                    });
                };

                // 立即执行加载
                loadShortcut();
            } else {
                // Chrome storage sync API not available, using default shortcut settings
            }
        } catch (error) {
            // Error loading shortcut settings
        }

        // Create popup container
        this.popup = document.createElement('div');
        this.popup.className = 'sidedock-popup sidedock-extension';
        this.popup.innerHTML = `
            <div class="sidedock-container">
                <div class="sidedock-apps">
                    <div class="app-list">
                    </div>
                </div>
            </div>
        `;

        // 创建拖拽指示线
        const dropIndicator = document.createElement('div');
        dropIndicator.id = 'sidedock-drop-indicator';
        dropIndicator.className = 'sidedock-drop-indicator sidedock-extension';
        dropIndicator.style.display = 'none';
        document.body.appendChild(dropIndicator);

        // 创建自定义悬停提示
        const tooltip = document.createElement('div');
        tooltip.id = 'sidedock-tooltip';
        tooltip.className = 'sidedock-tooltip sidedock-extension';
        tooltip.style.display = 'none';
        document.body.appendChild(tooltip);

        // Create context menu
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu sidedock-extension';
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
        this.editModal.className = 'edit-app-modal sidedock-extension';
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

        // 为输入框添加键盘事件处理，阻止 Control+A 等快捷键冒泡到文档
        this.handleInputKeydown = (e) => {
            // 如果是 Control+A，阻止事件冒泡，让浏览器默认行为只在输入框内生效
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                e.stopPropagation();
            }
        };

        // 设置输入框键盘事件处理器
        this.setupInputKeydownHandlers();

        // Add click event listener to close popup when clicking outside
        document.addEventListener('click', (e) => {
            // 检查是否有右键菜单显示
            const contextMenu = this.contextMenu;
            const iconContextMenu = this.editModal.querySelector('.icon-context-menu');
            const isContextMenuVisible = contextMenu.style.display === 'block';
            const isIconContextMenuVisible = iconContextMenu && iconContextMenu.style.display === 'block';
            const isEditModalVisible = this.editModal.style.display === 'block';
            const isGroupPopupVisible = this.groupPopup !== null;
            const isChildContextMenuVisible = this.childContextMenu && this.childContextMenu.style.display === 'block';

            // 如果点击的是右键菜单区域，不做任何处理
            if (contextMenu.contains(e.target) ||
                (iconContextMenu && iconContextMenu.contains(e.target)) ||
                (this.groupPopup && this.groupPopup.contains(e.target)) ||
                (this.childContextMenu && this.childContextMenu.contains(e.target)) ||
                e.target.closest('.app-icon') ||
                e.target.closest('.edit-app-icon') ||
                e.target.closest('.popup-app-icon')) {
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

            // 如果子应用上下文菜单显示，则关闭它
            if (isChildContextMenuVisible) {
                this.hideChildContextMenu();
                e.stopPropagation();
                return;
            }

            // 如果分组弹窗显示，则关闭它
            if (isGroupPopupVisible) {
                this.hideGroupPopup();
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
            // Mouse left popup

            // 检查鼠标是否移动到了侧边栏和屏幕边缘之间的区域
            // 如果鼠标位置在侧边栏左侧（即屏幕边缘和侧边栏之间），则不隐藏侧边栏
            if (e.clientX < this.popup.getBoundingClientRect().left && e.clientX >= 0) {
                // Mouse moved to the area between sidebar and screen edge, not hiding
                return;
            }

            // 鼠标离开侧边栏时，立即隐藏
            const isEditVisible = this.editModal && this.editModal.style.display !== 'none';
            const isContextMenuVisible = this.contextMenu && this.contextMenu.style.display === 'block';
            const isGroupPopupVisible = this.groupPopup !== null; // 检查分组弹窗是否显示

            if (this.visible && !isEditVisible && !isContextMenuVisible && !isGroupPopupVisible) {
               // 延迟隐藏，给拖拽操作完成留出时间
               setTimeout(() => {
                   this.hide();
               }, 200); // 200ms 延迟
               // Redundant timer clear, hide() handles this now
                // if (this.hideTimer) {
                //     clearTimeout(this.hideTimer);
                //     this.hideTimer = null;
                //     // Cleared hideTimer in popup mouseleave (should not happen)
                // }
            } else {
                // Conditions not met for hiding from popup mouseleave
            }
        });

        // 添加快捷键切换侧边栏显示状态
        document.addEventListener('keydown', (e) => {
            // 输出当前按下的键和快捷键设置，用于调试

            // Skip if the active element is an input field
            if (document.activeElement.tagName === 'INPUT' ||
                document.activeElement.tagName === 'TEXTAREA' ||
                document.activeElement.isContentEditable) {
                // Ignoring shortcut in input field
                return;
            }

            // Check if the pressed keys match the custom shortcut
            const keyMatches = e.key.toLowerCase() === this.shortcut.key;
            const ctrlMatches = e.ctrlKey === !!this.shortcut.ctrl;
            const altMatches = e.altKey === !!this.shortcut.alt;
            const shiftMatches = e.shiftKey === !!this.shortcut.shift;
            // 处理command属性，如果不存在则默认为false
            const commandMatches = e.metaKey === !!this.shortcut.command;

            // Shortcut match check

            if (keyMatches && ctrlMatches && altMatches && shiftMatches && commandMatches) {
                e.preventDefault();
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
                    // Error uploading image
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
                // Failed to read clipboard contents
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
                    // Failed to reset icon
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

            // 关闭子应用上下文菜单
            if (this.childContextMenu && !this.childContextMenu.contains(e.target)) {
                this.hideChildContextMenu();
            }
        });

        // Load saved apps
        this.loadApps();

        // 侧边栏默认已隐藏，指示条已设置为闲置状态
        // Sidebar initialized in hidden state with idle indicator

        // 定期更新图标活跃状态
        this.updateActiveStatus();
        setInterval(() => this.updateActiveStatus(), 5000); // 每5秒更新一次

        // 设置初始化标志
        this.isInitialized = true;
        // SideDock initialization complete
    }

    createAppIcon(app, index) {
        // 渲染时data-index严格按顺序
        const container = document.createElement('a');
        container.href = app.url;
        container.className = 'app-icon';
        // 禁用浏览器自带的悬停提示
        container.removeAttribute('title');
        container.dataset.title = app.title; // 使用自定义属性存储标题
        container.dataset.index = index;
        container.dataset.url = app.url;
        container.draggable = true; // 启用拖拽

        // 如果是分组，添加分组标识
        if (app.isGroup) {
            container.dataset.isGroup = 'true';
            container.classList.add('app-group');
            // 如果分组是折叠状态
            if (app.collapsed !== false) {
                container.classList.add('collapsed');
            }

            // 创建分组网格布局
            const groupGrid = document.createElement('div');
            groupGrid.className = 'group-grid';

            // 添加子应用图标到网格中
            if (app.children && app.children.length > 0) {
                // 最多显示4个应用
                const maxItems = 4;
                for (let i = 0; i < maxItems; i++) {
                    const gridItem = document.createElement('div');
                    gridItem.className = 'group-grid-item';

                    if (i < app.children.length) {
                        // 有子应用，显示子应用图标
                        const childImg = document.createElement('img');
                        childImg.src = app.children[i].favicon;
                        childImg.alt = app.children[i].title;
                        childImg.addEventListener('error', () => {
                            // 如果图标加载失败，使用默认图标
                            childImg.src = this.generateDefaultIcon(app.children[i].title);
                        });
                        gridItem.appendChild(childImg);
                    } else {
                        // 没有子应用，显示空位置
                        gridItem.classList.add('empty');
                    }

                    groupGrid.appendChild(gridItem);
                }
            } else {
                // 没有子应用，显示4个空位置
                for (let i = 0; i < 4; i++) {
                    const gridItem = document.createElement('div');
                    gridItem.className = 'group-grid-item empty';
                    groupGrid.appendChild(gridItem);
                }
            }

            container.appendChild(groupGrid);
        } else {
            // 普通应用图标
            const img = document.createElement('img');
            img.alt = app.title;
            img.addEventListener('error', () => this.handleImageError(img, app.title, index));
            img.src = app.favicon;
            container.appendChild(img);
        }

        const indicator = document.createElement('div');
        indicator.className = 'active-indicator';
        container.style.position = 'relative';
        container.appendChild(indicator);



        // 右键菜单
        container.addEventListener('contextmenu', (e) => {
            this.showContextMenu(e, index);
        });

        // 添加点击事件
        container.addEventListener('click', (e) => {
            // 如果是分组，则展开/折叠
            if (app.isGroup) {
                e.preventDefault(); // 阻止默认的链接跳转行为
                e.stopPropagation(); // 阻止事件冒泡

                // 如果分组弹窗已经显示，则关闭它
                if (this.groupPopup) {
                    this.hideGroupPopup();
                } else {
                    // 否则显示分组弹窗
                    this.toggleGroup(index);
                }
            } else {
                // 如果是普通应用，则打开链接
                e.preventDefault();
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ action: 'switchOrOpenUrl', url: app.url }, () => {
                        if (chrome.runtime.lastError) {
                            window.open(app.url, '_blank');
                        }
                    });
                } else {
                    window.open(app.url, '_blank');
                }
            }
        });

        return container;
    }

    // 获取拖拽目标位置的辅助方法 - 增强版
    getDragAfterElement(container, y) {
        // 检查是否是分组弹窗
        const isGroupPopup = container.classList.contains('group-popup');

        // 获取所有非拖拽中的元素
        const selector = isGroupPopup ? '.popup-app-icon:not(.dragging)' : '.app-icon:not(.dragging)';
        const draggableElements = [...container.querySelectorAll(selector)];

        console.log('getDragAfterElement', {
            container,
            isGroupPopup,
            y,
            draggableElements,
            selector
        });

        if (draggableElements.length === 0) {
            console.log('没有找到可拖拽元素');
            return null;
        }

        // 找到鼠标位置下方最近的元素
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            console.log('检查元素', {
                child,
                box,
                offset,
                closestOffset: closest.offset
            });

            // 如果鼠标在元素中点上方，且比之前找到的元素更近
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // 处理从分组弹窗拖拽到侧边栏的操作
    async handleGroupChildDrop(groupIndex, childIndex, targetIndex) {
        try {
            // 获取原始应用数据
            const originalApps = await this.getApps();
            let newApps = [...originalApps];

            // 确保分组和子应用索引有效
            if (groupIndex >= 0 && groupIndex < newApps.length &&
                newApps[groupIndex].children &&
                childIndex >= 0 && childIndex < newApps[groupIndex].children.length) {

                // 获取要移除的子应用
                const child = {...newApps[groupIndex].children[childIndex]};

                // 从分组中移除
                newApps[groupIndex].children.splice(childIndex, 1);

                // 如果分组只剩一个应用，自动解散分组
                if (newApps[groupIndex].children.length === 1) {
                    // 获取最后一个子应用
                    const lastChild = {...newApps[groupIndex].children[0]};
                    // 替换分组为该应用
                    newApps[groupIndex] = lastChild;
                }
                // 如果分组为空，移除分组标记
                else if (newApps[groupIndex].children.length === 0) {
                    delete newApps[groupIndex].children;
                    delete newApps[groupIndex].isGroup;
                    delete newApps[groupIndex].collapsed;
                }

                // 将移除的应用添加到目标位置
                newApps.splice(targetIndex + 1, 0, child);

                // 保存更新后的应用列表
                await this.saveApps(newApps);

                // 重置拖拽状态
                this.isDraggingFromGroupPopup = false;
                this.draggingGroupIndex = null;
                this.draggingChildIndex = null;

                // 隐藏拖拽指示线
                const dropIndicator = document.getElementById('sidedock-drop-indicator');
                if (dropIndicator) {
                    dropIndicator.style.display = 'none';
                }

                // 重新加载应用列表
                this.loadApps();

                // 隐藏分组弹窗
                this.hideGroupPopup();
            }
        } catch (error) {
            // 处理错误
        }
    }

    // 处理添加应用到分组的操作
    async handleAddToGroup(draggedIndex, targetIndex, apps) {
        try {
            // 获取拖拽的应用和目标分组
            const draggedApp = {...apps[draggedIndex]};
            const targetGroup = apps[targetIndex];

            // 确保目标分组有children数组
            if (!targetGroup.children) {
                targetGroup.children = [];
            }

            // 将拖拽的应用添加到分组中
            targetGroup.children.push(draggedApp);

            // 从原位置删除拖拽的应用
            apps.splice(draggedIndex, 1);

            // 更新索引
            if (draggedIndex < targetIndex) {
                // 如果拖拽的应用在分组前面，需要调整分组的索引
                apps[targetIndex - 1] = targetGroup;
            } else {
                apps[targetIndex] = targetGroup;
            }

            // 保存更新后的应用列表
            await this.saveApps(apps);

            // 重新加载应用列表
            this.loadApps();
        } catch (error) {
            // 处理错误
        }
    }

    // 处理创建新分组的操作
    async handleCreateGroup(draggedIndex, targetIndex, apps) {
        try {
            // 获取拖拽的应用和目标应用
            const draggedApp = {...apps[draggedIndex]};
            const targetApp = {...apps[targetIndex]};

            // 创建新分组
            const newGroup = {
                title: "未命名",
                url: targetApp.url,
                favicon: targetApp.favicon,
                isGroup: true,
                collapsed: false,
                children: [targetApp, draggedApp]
            };

            // 确定需要删除的索引
            const indicesToRemove = [draggedIndex, targetIndex].sort((a, b) => b - a);

            // 从原位置删除应用（从大索引开始删除，避免索引变化）
            indicesToRemove.forEach(index => {
                apps.splice(index, 1);
            });

            // 在目标位置插入新分组
            const insertIndex = Math.min(draggedIndex, targetIndex);
            apps.splice(insertIndex, 0, newGroup);

            // 保存更新后的应用列表
            await this.saveApps(apps);

            // 重新加载应用列表
            this.loadApps();
        } catch (error) {
            // 处理错误
        }
    }

    // 处理普通的拖拽排序操作
    async handleReorder(container, originalApps) {
        try {
            // 获取当前DOM中的应用顺序
            const finalAppIcons = Array.from(container.querySelectorAll('.app-icon'));

            // 检查元素是否存在
            if (!finalAppIcons.length || !originalApps.length) return;

            // 创建URL -> 应用数据的映射，便于查找
            const appDataMap = new Map();
            originalApps.forEach(app => {
                if (app && app.url) {
                    appDataMap.set(app.url, app);
                }
            });

            // 根据DOM顺序重建应用数组
            let newApps = [];
            let dataConsistent = true;

            finalAppIcons.forEach((icon, index) => {
                const url = icon.dataset.url;
                if (appDataMap.has(url)) {
                    newApps.push(appDataMap.get(url));
                    // 更新索引以匹配新的DOM顺序
                    icon.dataset.index = index.toString();
                } else {
                    dataConsistent = false;
                }
            });

            // 检查数据一致性
            if (!dataConsistent || newApps.length !== originalApps.length) return;

            // 保存更新后的应用列表
            await this.saveApps(newApps);
        } catch (error) {
            // 处理错误
        }
    }

    // 保存应用列表的辅助方法
    async saveApps(apps) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ apps }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || 'Error saving apps'));
                } else {
                    resolve();
                }
            });
        });
    }

    async loadApps() {
        try {
            // 检查是否已经在加载中
            if (this.isLoadingApps) {
                // Already loading apps, skipping duplicate call
                return;
            }

            // 设置加载标志
            this.isLoadingApps = true;
            // Loading apps...

            // 检查DOM元素是否存在
            if (!this.domElements.appList) {
                // App list element not found, re-initializing DOM references
                this.domElements.appList = this.popup.querySelector('.app-list');

                if (!this.domElements.appList) {
                    // Failed to find app list element, aborting loadApps
                    return;
                }
            }

            // 获取应用列表
            const apps = await this.getApps();
            const appList = this.domElements.appList;

            // App list element

            // 在操作 DOM 前先完全清空应用列表容器
            // Clearing app list container...

            // 先尝试使用 removeChild 方法清空
            try {
                while (appList.firstChild) {
                    appList.removeChild(appList.firstChild);
                }
            } catch (error) {
                // Error removing children one by one
            }

            // 再次检查是否清空
            if (appList.children.length > 0) {
                // Failed to clear app list with removeChild

                // 尝试使用 innerHTML 强制清空
                try {
                    appList.innerHTML = '';
                    // Cleared app list using innerHTML
                } catch (error) {
                    // Error clearing with innerHTML
                }

                // 再次检查
                if (appList.children.length > 0) {
                    // Still failed to clear app list

                    // 最后尝试重新创建元素
                    try {
                        const newAppList = document.createElement('div');
                        newAppList.className = 'app-list';
                        if (appList.parentNode) {
                            appList.parentNode.replaceChild(newAppList, appList);
                            this.domElements.appList = newAppList;
                            appList = newAppList;
                            // Replaced app list element with a new one
                        }
                    } catch (error) {
                        // Error replacing app list element
                    }
                }
            }

            // App list now has children after clearing

            // 获取当前所有打开的标签页
            const openTabs = await this.getOpenTabs();

            // Found apps to load

            // 添加所有应用图标
            for (let i = 0; i < apps.length; i++) {
                const app = apps[i];
                // Creating icon for app

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
                                                    // Error saving updated favicon
                                                    reject(new Error(chrome.runtime.lastError.message));
                                                    return;
                                                }
                                                resolve();
                                            });
                                        } catch (storageError) {
                                            // Error in chrome.storage.local.set during favicon update
                                            reject(storageError);
                                        }
                                    });
                                }
                            } catch (storageError) {
                                // Error updating favicon in storage
                                // 继续使用已获取的图标，但不保存
                            }
                        } else {
                            // Chrome storage API not available, favicon will not be saved
                        }
                    } catch (error) {
                        // Error updating favicon
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

                // 添加拖拽事件监听器 - 简化版
                appIcon.addEventListener('dragstart', (e) => {
                    this.isDragging = true;
                    e.dataTransfer.setData('text/plain', appIcon.dataset.index);
                    e.dataTransfer.effectAllowed = 'move';

                    // 设置拖拽图像
                    const dragImage = document.createElement('img');
                    dragImage.src = appIcon.querySelector('img').src;
                    dragImage.style.width = '32px';
                    dragImage.style.height = '32px';
                    dragImage.style.opacity = '0.7';
                    document.body.appendChild(dragImage);
                    e.dataTransfer.setDragImage(dragImage, 16, 16);

                    // 延迟添加拖拽样式和清理拖拽图像
                    setTimeout(() => {
                        appIcon.classList.add('dragging');
                        document.body.removeChild(dragImage);
                    }, 0);

                    // 隐藏悬停提示
                    this.hideTooltip();
                });

                // 拖拽结束事件
                appIcon.addEventListener('dragend', () => {
                    // 清除拖拽状态
                    this.isDragging = false;
                    appIcon.classList.remove('dragging');

                    // 清除所有高亮样式
                    const allIcons = this.popup.querySelectorAll('.app-icon');
                    allIcons.forEach(icon => icon.classList.remove('drag-over'));

                    // 隐藏拖拽指示线
                    const dropIndicator = document.getElementById('sidedock-drop-indicator');
                    if (dropIndicator) {
                        dropIndicator.style.display = 'none';
                    }
                });

                // 拖拽经过事件
                appIcon.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';

                    // 获取拖拽元素和容器
                    const draggingElement = this.popup?.querySelector('.dragging');
                    const isGroupChildDrag = this.isDraggingFromGroupPopup;

                    // 如果没有拖拽元素或拖拽到自己，则退出
                    if ((!draggingElement && !isGroupChildDrag) || (draggingElement === appIcon)) return;

                    const appListContainer = this.domElements.appList;
                    if (!appListContainer) return;

                    // 获取或创建拖拽指示线
                    let dropIndicator = document.getElementById('sidedock-drop-indicator');
                    if (!dropIndicator) {
                        dropIndicator = document.createElement('div');
                        dropIndicator.id = 'sidedock-drop-indicator';
                        dropIndicator.className = 'sidedock-drop-indicator';
                        document.body.appendChild(dropIndicator);
                    }

                    // 清除所有高亮样式
                    const allIcons = this.popup.querySelectorAll('.app-icon');
                    allIcons.forEach(icon => {
                        if (icon !== draggingElement) {
                            icon.classList.remove('drag-over');
                        }
                    });

                    // 获取目标位置和元素信息
                    const afterElement = this.getDragAfterElement(appListContainer, e.clientY);
                    const rect = appIcon.getBoundingClientRect();
                    const isTargetGroup = appIcon.dataset.isGroup === 'true';
                    const isDraggedGroup = draggingElement ? draggingElement.dataset.isGroup === 'true' : false;

                    // 判断是拖拽到图标上还是图标之间
                    const mouseY = e.clientY;
                    const iconMiddle = rect.top + rect.height / 2;
                    const isOnIcon = Math.abs(mouseY - iconMiddle) < rect.height * 0.3;

                    // 处理拖拽到图标上的情况（创建分组或添加到分组）
                    if (isOnIcon && ((isTargetGroup && (isGroupChildDrag || !isDraggedGroup)) ||
                                    (!isTargetGroup && !isDraggedGroup && draggingElement !== appIcon))) {
                        appIcon.classList.add('drag-over');
                        dropIndicator.style.display = 'none';
                    }
                    // 处理拖拽到图标之间的情况（排序）
                    else {
                        if (afterElement) {
                            // 计算指示线位置
                            const afterRect = afterElement.getBoundingClientRect();
                            dropIndicator.style.width = `${rect.width}px`;
                            dropIndicator.style.left = `${rect.left}px`;
                            dropIndicator.style.top = `${afterRect.top - 1}px`;
                            dropIndicator.style.display = 'block';

                            // 移动元素
                            if (draggingElement && draggingElement.nextSibling !== afterElement) {
                                appListContainer.insertBefore(draggingElement, afterElement);
                            }
                        } else {
                            // 拖拽到最后位置
                            const lastElement = appListContainer.lastElementChild;
                            if (lastElement && lastElement !== draggingElement) {
                                const lastRect = lastElement.getBoundingClientRect();
                                dropIndicator.style.width = `${rect.width}px`;
                                dropIndicator.style.left = `${rect.left}px`;
                                dropIndicator.style.top = `${lastRect.bottom + 1}px`;
                                dropIndicator.style.display = 'block';

                                // 移动元素
                                if (draggingElement && appListContainer.lastElementChild !== draggingElement) {
                                    appListContainer.appendChild(draggingElement);
                                }
                            }
                        }
                    }
                });

                // 简化版的drop事件处理函数
                appIcon.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // 处理从分组弹窗拖拽过来的应用
                    if (this.isDraggingFromGroupPopup) {
                        await this.handleGroupChildDrop(this.draggingGroupIndex, this.draggingChildIndex, parseInt(appIcon.dataset.index));
                        return;
                    }

                    // 处理侧边栏内部拖拽
                    const draggedElement = this.popup?.querySelector('.dragging');
                    if (!draggedElement || !appIcon.classList.contains('app-icon')) return;

                    // 获取拖拽元素和目标元素的索引
                    const draggedIndex = parseInt(draggedElement.dataset.index);
                    const targetIndex = parseInt(appIcon.dataset.index);

                    // 如果拖拽到自己身上，不做任何处理
                    if (draggedIndex === targetIndex) return;

                    // 获取原始应用数据
                    const originalApps = await this.getApps();
                    let newApps = [...originalApps];

                    // 检查是否拖拽到分组上或者是否需要创建新分组
                    const isTargetGroup = appIcon.dataset.isGroup === 'true';
                    const isDraggedGroup = draggedElement.dataset.isGroup === 'true';

                    // 如果拖拽到分组上，将应用添加到分组中
                    if (isTargetGroup && !isDraggedGroup) {
                        await this.handleAddToGroup(draggedIndex, targetIndex, newApps);
                    }
                    // 如果拖拽到普通应用上，创建新分组
                    else if (!isTargetGroup && !isDraggedGroup) {
                        await this.handleCreateGroup(draggedIndex, targetIndex, newApps);
                    }
                    // 如果是普通的拖拽排序
                    else {
                        await this.handleReorder(this.domElements.appList, originalApps);
                    }
                });

                // 添加悬停事件处理
                appIcon.addEventListener('mouseenter', (e) => {
                    this.showTooltip(e.currentTarget);
                });

                appIcon.addEventListener('mouseleave', () => {
                    this.hideTooltip();
                });

                // 添加到应用列表
                appList.appendChild(appIcon);
            }

            // Creating add button...

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

            // App list now has children
            // Apps loaded successfully
        } catch (error) {
            // Error loading apps
        } finally {
            // 重置加载标志
            this.isLoadingApps = false;
        }
    }

    async getApps() {
        // Getting apps from storage...

        // 检查chrome API是否可用
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            // Chrome storage API not available, returning empty apps array
            return [];
        }

        return new Promise((resolve) => {
            try {
                chrome.storage.local.get(['apps'], (result) => {
                    // 检查是否有错误
                    if (chrome.runtime.lastError) {
                        // Error getting apps from storage
                        resolve([]);
                        return;
                    }

                    // 检查结果是否有效
                    if (!result || !result.apps) {
                        // No apps found in storage, returning empty array
                        resolve([]);
                        return;
                    }

                    // 确保返回的是数组
                    if (!Array.isArray(result.apps)) {
                        // Apps in storage is not an array, returning empty array
                        resolve([]);
                        return;
                    }

                    // Found apps in storage
                    resolve(result.apps);
                });
            } catch (error) {
                // Error in getApps
                resolve([]);
            }
        });
    }

    // 统一的图标获取方法，合并了 getFaviconFromUrl 和 getFavicon
    async getFaviconFromUrl(url) {
        try {
            // 检查URL是否有效
            if (!url) {
                // Invalid URL provided to getFaviconFromUrl
                return this.generateDefaultIcon('?');
            }

            // 解析域名
            const domain = new URL(url).hostname;

            // 检查chrome API是否可用
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
                // Chrome runtime API not available, using Google favicon service
                return await this.getGoogleFavicon(domain);
            }

            try {
                // 尝试使用background.js获取图标
                const response = await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        // Favicon request timed out
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
                                // Error in sendMessage
                                reject(new Error(chrome.runtime.lastError.message));
                                return;
                            }

                            resolve(response);
                        });
                    } catch (error) {
                        clearTimeout(timeoutId);
                        // Error sending message
                        reject(error);
                    }
                });

                if (response && response.favicon) {
                    return response.favicon;
                }

                // 如果没有有效响应，尝试使用Google服务
                throw new Error('No valid favicon in response');
            } catch (error) {
                // Background favicon fetch failed, trying Google service
                return await this.getGoogleFavicon(domain);
            }
        } catch (error) {
            // Error getting favicon
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
            // Error getting Google favicon
            return this.generateDefaultIcon(domain);
        }
    }

    showContextMenu(e, index) {
        e.preventDefault();
        const rect = e.target.getBoundingClientRect();

        // 检查是否是分组
        const isGroup = e.target.closest('.app-icon')?.dataset.isGroup === 'true';

        // 如果是分组，显示分组特有的菜单项
        if (isGroup) {
            // 确保"打开全部"菜单项存在
            if (!this.contextMenu.querySelector('.open-all')) {
                const openAllItem = document.createElement('div');
                openAllItem.className = 'context-menu-item open-all';
                openAllItem.innerHTML = '<span>打开全部</span>';
                openAllItem.addEventListener('click', () => this.handleOpenAllApps());
                this.contextMenu.appendChild(openAllItem);
            }

            // 确保"解除分组"菜单项存在
            if (!this.contextMenu.querySelector('.ungroup')) {
                const ungroupItem = document.createElement('div');
                ungroupItem.className = 'context-menu-item ungroup';
                ungroupItem.innerHTML = '<span>解除分组</span>';
                ungroupItem.addEventListener('click', () => this.handleUngroup());
                this.contextMenu.appendChild(ungroupItem);
            }

            // 显示分组特有的选项
            const openAllItem = this.contextMenu.querySelector('.open-all');
            if (openAllItem) openAllItem.style.display = 'flex';

            const ungroupItem = this.contextMenu.querySelector('.ungroup');
            if (ungroupItem) ungroupItem.style.display = 'flex';
        } else {
            // 隐藏分组特有的选项
            const openAllItem = this.contextMenu.querySelector('.open-all');
            if (openAllItem) openAllItem.style.display = 'none';

            const ungroupItem = this.contextMenu.querySelector('.ungroup');
            if (ungroupItem) ungroupItem.style.display = 'none';
        }

        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = `${rect.right + 8}px`;
        this.contextMenu.style.top = `${rect.top}px`;
        this.currentAppIndex = index;
    }

    // 切换分组的展开/折叠状态
    async toggleGroup(index) {
        try {
            // 立即隐藏任何可能显示的提示
            this.hideTooltip();

            const apps = await this.getApps();
            const app = apps[index];

            // 确保是分组
            if (!app || !app.isGroup) {
                // Attempted to toggle a non-group app
                return;
            }

            // 获取分组图标
            const groupIcon = this.popup.querySelector(`.app-icon[data-index="${index}"]`);
            if (!groupIcon) return;

            // 如果已经有分组弹窗显示，则关闭它
            if (this.groupPopup) {
                this.hideGroupPopup();
                return;
            }

            // 显示分组弹窗
            if (app.children && app.children.length > 0) {
                this.showGroupPopup(groupIcon, app.children);
            }

        } catch (error) {
            // Error toggling group
        }
    }

    // 处理打开分组中所有应用
    async handleOpenAllApps() {
        try {
            // 隐藏右键菜单
            this.contextMenu.style.display = 'none';

            // 获取当前应用列表
            const apps = await this.getApps();

            // 确保索引有效
            if (this.currentAppIndex === null || this.currentAppIndex < 0 || this.currentAppIndex >= apps.length) {
                return;
            }

            // 获取当前分组
            const group = apps[this.currentAppIndex];

            // 确保是分组
            if (!group || !group.isGroup || !group.children || !group.children.length) {
                return;
            }

            // 打开分组中的所有应用
            const openPromises = group.children.map(child => {
                return new Promise(resolve => {
                    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                        chrome.runtime.sendMessage({ action: 'switchOrOpenUrl', url: child.url }, () => {
                            if (chrome.runtime.lastError) {
                                window.open(child.url, '_blank');
                            }
                            resolve();
                        });
                    } else {
                        window.open(child.url, '_blank');
                        resolve();
                    }
                });
            });

            // 等待所有应用打开完成
            await Promise.all(openPromises);

            // 隐藏分组弹窗（如果存在）
            this.hideGroupPopup();

        } catch (error) {
            // Error handling open all apps
        }
    }

    // 处理解除分组
    async handleUngroup() {
        try {
            // 隐藏右键菜单
            this.contextMenu.style.display = 'none';

            // 获取当前应用列表
            const apps = await this.getApps();

            // 确保索引有效
            if (this.currentAppIndex === null || this.currentAppIndex < 0 || this.currentAppIndex >= apps.length) {
                return;
            }

            // 获取当前分组
            const group = apps[this.currentAppIndex];

            // 确保是分组
            if (!group || !group.isGroup || !group.children || !group.children.length) {
                return;
            }

            // 从应用列表中移除分组
            apps.splice(this.currentAppIndex, 1);

            // 将分组中的应用添加到应用列表中
            apps.splice(this.currentAppIndex, 0, ...group.children);

            // 保存更新后的应用列表
            await this.saveApps(apps);

            // 隐藏分组弹窗（如果存在）
            this.hideGroupPopup();

        } catch (error) {
            // Error handling ungroup
        }
    }

    // 显示分组弹窗 - 简化版
    showGroupPopup(groupIcon, children) {
        // 隐藏已存在的弹窗
        this.hideGroupPopup();

        // 隐藏任何可能显示的提示
        this.hideTooltip();

        // 获取分组图标的位置
        const rect = groupIcon.getBoundingClientRect();

        // 创建弹窗
        const popup = document.createElement('div');
        popup.className = 'group-popup sidedock-extension';

        // 保存分组索引
        const groupIndex = parseInt(groupIcon.dataset.index);

        // 添加子应用图标
        children.forEach((child, i) => {
            const appIcon = document.createElement('div');
            appIcon.className = 'popup-app-icon';
            appIcon.removeAttribute('title');
            appIcon.dataset.title = child.title;
            appIcon.dataset.url = child.url;
            appIcon.dataset.groupIndex = groupIndex;
            appIcon.dataset.childIndex = i;
            appIcon.draggable = true;

            // 添加活跃指示器
            const activeIndicator = document.createElement('div');
            activeIndicator.className = 'active-indicator';
            appIcon.appendChild(activeIndicator);

            // 添加图标
            const img = document.createElement('img');
            img.alt = child.title;
            img.src = child.favicon;
            img.addEventListener('error', () => {
                img.src = this.generateDefaultIcon(child.title);
            });
            appIcon.appendChild(img);

            // 添加点击事件 - 打开应用
            appIcon.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ action: 'switchOrOpenUrl', url: child.url }, () => {
                        if (chrome.runtime.lastError) {
                            window.open(child.url, '_blank');
                        }
                    });
                } else {
                    window.open(child.url, '_blank');
                }
                this.hideGroupPopup();
            });

            // 添加拖拽开始事件
            appIcon.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                this.isDragging = true;

                // 设置全局标志，表示正在从分组弹窗拖拽
                this.isDraggingFromGroupPopup = true;
                this.draggingGroupIndex = groupIndex;
                this.draggingChildIndex = i;

                // 设置拖拽数据
                e.dataTransfer.setData('text/plain', 'group-child-drag');
                e.dataTransfer.effectAllowed = 'move';

                // 设置拖拽图像
                const dragImage = document.createElement('img');
                dragImage.src = img.src;
                dragImage.style.width = '32px';
                dragImage.style.height = '32px';
                dragImage.style.opacity = '0.7';
                document.body.appendChild(dragImage);
                e.dataTransfer.setDragImage(dragImage, 16, 16);

                // 延迟添加拖拽样式和清理拖拽图像
                setTimeout(() => {
                    appIcon.classList.add('dragging');
                    document.body.removeChild(dragImage);

                    // 确保拖拽指示线存在
                    let dropIndicator = document.getElementById('sidedock-drop-indicator');
                    if (!dropIndicator) {
                        dropIndicator = document.createElement('div');
                        dropIndicator.id = 'sidedock-drop-indicator';
                        dropIndicator.className = 'sidedock-drop-indicator';
                        document.body.appendChild(dropIndicator);
                    }

                    // 初始化拖拽指示线样式
                    dropIndicator.style.display = 'none'; // 先隐藏，等拖拽到有效位置再显示
                    dropIndicator.style.width = '48px'; // 设置初始宽度
                    dropIndicator.style.zIndex = '2147483649'; // 确保z-index足够高
                }, 0);

                // 隐藏悬停提示
                this.hideTooltip();
            });

            // 添加拖拽经过事件
            appIcon.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 确保dataTransfer存在
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'move';
                }

                // 获取正在拖拽的元素
                const draggingElement = popup.querySelector('.dragging');
                if (!draggingElement || draggingElement === appIcon) return;

                console.log('分组弹窗拖拽经过事件', {
                    draggingElement,
                    clientY: e.clientY,
                    popup
                });

                // 获取或创建拖拽指示线
                let dropIndicator = document.getElementById('sidedock-drop-indicator');
                if (!dropIndicator) {
                    dropIndicator = document.createElement('div');
                    dropIndicator.id = 'sidedock-drop-indicator';
                    dropIndicator.className = 'sidedock-drop-indicator';
                    document.body.appendChild(dropIndicator);
                }

                // 获取目标位置和显示指示线
                const afterElement = this.getDragAfterElement(popup, e.clientY);

                if (afterElement) {
                    // 显示指示线在目标元素上方
                    const afterRect = afterElement.getBoundingClientRect();
                    // 设置指示线宽度为弹窗内容宽度
                    dropIndicator.style.width = `48px`; // 增加宽度使其更明显
                    // 居中显示指示线
                    const popupRect = popup.getBoundingClientRect();
                    dropIndicator.style.left = `${popupRect.left + (popupRect.width - 48) / 2}px`; // 居中显示
                    dropIndicator.style.top = `${afterRect.top}px`; // 调整位置
                    dropIndicator.style.display = 'block';

                    // 添加调试信息
                    console.log('显示指示线在元素上方', {
                        afterRect,
                        popupRect,
                        left: `${popupRect.left + (popupRect.width - 48) / 2}px`,
                        top: `${afterRect.top}px`
                    });

                    // 移动元素
                    if (draggingElement.nextSibling !== afterElement) {
                        popup.insertBefore(draggingElement, afterElement);
                    }
                } else {
                    // 显示指示线在最后一个元素下方
                    const lastRect = popup.lastElementChild.getBoundingClientRect();
                    // 设置指示线宽度为弹窗内容宽度
                    dropIndicator.style.width = `48px`; // 增加宽度使其更明显
                    // 居中显示指示线
                    const popupRect = popup.getBoundingClientRect();
                    dropIndicator.style.left = `${popupRect.left + (popupRect.width - 48) / 2}px`; // 居中显示
                    dropIndicator.style.top = `${lastRect.bottom}px`; // 调整位置
                    dropIndicator.style.display = 'block';

                    // 添加调试信息
                    console.log('显示指示线在最后元素下方', {
                        lastRect,
                        popupRect,
                        left: `${popupRect.left + (popupRect.width - 48) / 2}px`,
                        top: `${lastRect.bottom}px`
                    });

                    // 移动元素
                    if (popup.lastElementChild !== draggingElement) {
                        popup.appendChild(draggingElement);
                    }
                }
            });

            // 添加拖拽结束事件
            appIcon.addEventListener('dragend', () => {
                this.isDragging = false;
                this.isDraggingFromGroupPopup = false;
                this.draggingGroupIndex = null;
                this.draggingChildIndex = null;
                appIcon.classList.remove('dragging');

                // 隐藏拖拽指示线
                const dropIndicator = document.getElementById('sidedock-drop-indicator');
                if (dropIndicator) {
                    dropIndicator.style.display = 'none';
                }
            });

            // 添加拖拽放置事件
            appIcon.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                // 获取正在拖拽的元素
                const draggingElement = popup.querySelector('.dragging');
                if (!draggingElement || !appIcon.classList.contains('popup-app-icon')) return;

                // 获取原始应用数据
                const apps = await this.getApps();
                const group = apps[groupIndex];

                // 确保是分组且有子应用
                if (!group || !group.isGroup || !group.children) return;

                // 获取所有子应用的新顺序
                const newChildren = Array.from(popup.querySelectorAll('.popup-app-icon')).map(icon => {
                    const childIndex = parseInt(icon.dataset.childIndex);
                    return group.children[childIndex];
                });

                // 更新分组的子应用顺序
                group.children = newChildren;

                // 保存更新后的应用列表
                await this.saveApps(apps);

                // 更新子应用索引
                Array.from(popup.querySelectorAll('.popup-app-icon')).forEach((icon, index) => {
                    icon.dataset.childIndex = index;
                });
            });

            // 添加右键菜单事件
            appIcon.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showPopupAppContextMenu(e, groupIndex, i);
            });

            // 添加悬停事件
            appIcon.addEventListener('mouseenter', (e) => {
                this.showTooltip(e.currentTarget);
            });

            appIcon.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });

            popup.appendChild(appIcon);
        });

        // 计算弹窗位置，与分组图标垂直居中对齐，间距8px
        const popupLeft = rect.right + 8;
        // 计算弹窗高度，每个图标40px + 间距16px，最后一个图标没有间距
        const popupHeight = Math.min(children.length * 40 + (children.length - 1) * 16 + 24, 300); // 24px为上下padding
        const popupTop = rect.top + (rect.height / 2) - (popupHeight / 2);

        // 设置弹窗位置
        popup.style.left = `${popupLeft}px`;
        popup.style.top = `${popupTop}px`;
        popup.style.zIndex = '2147483646';

        // 添加到文档
        document.body.appendChild(popup);

        // 保存弹窗引用
        this.groupPopup = popup;

        // 添加点击外部关闭弹窗的事件
        setTimeout(() => {
            document.addEventListener('click', this.handleDocumentClick);
        }, 0);
    }

    // 隐藏分组弹窗
    hideGroupPopup() {
        if (this.groupPopup) {
            this.groupPopup.remove();
            this.groupPopup = null;

            // 移除文档点击事件
            document.removeEventListener('click', this.handleDocumentClick);
        }
    }

    // 处理文档点击事件
    handleDocumentClick = (e) => {
        // 如果没有分组弹窗，不需要处理
        if (!this.groupPopup) return;

        // 检查点击是否在弹窗内
        const isPopupOrChild = this.groupPopup.contains(e.target);

        // 如果点击不在弹窗内，关闭弹窗
        if (!isPopupOrChild) {
            // 阻止事件冒泡，防止触发其他点击事件
            e.stopPropagation();
            this.hideGroupPopup();
        }
    }

    // 更新分组图标的网格显示
    updateGroupGrid(index, app) {
        const groupIcon = this.popup.querySelector(`.app-icon[data-index="${index}"]`);
        if (!groupIcon) return;

        // 移除旧的网格
        const oldGrid = groupIcon.querySelector('.group-grid');
        if (oldGrid) {
            oldGrid.remove();
        }

        // 创建新的网格
        const groupGrid = document.createElement('div');
        groupGrid.className = 'group-grid';

        // 添加子应用图标到网格中
        if (app.children && app.children.length > 0) {
            // 最多显示4个应用
            const maxItems = 4;
            for (let i = 0; i < maxItems; i++) {
                const gridItem = document.createElement('div');
                gridItem.className = 'group-grid-item';

                if (i < app.children.length) {
                    // 有子应用，显示子应用图标
                    const childImg = document.createElement('img');
                    childImg.src = app.children[i].favicon;
                    childImg.alt = app.children[i].title;
                    childImg.addEventListener('error', () => {
                        // 如果图标加载失败，使用默认图标
                        childImg.src = this.generateDefaultIcon(app.children[i].title);
                    });
                    gridItem.appendChild(childImg);
                } else {
                    // 没有子应用，显示空位置
                    gridItem.classList.add('empty');
                }

                groupGrid.appendChild(gridItem);
            }
        } else {
            // 没有子应用，显示4个空位置
            for (let i = 0; i < 4; i++) {
                const gridItem = document.createElement('div');
                gridItem.className = 'group-grid-item empty';
                groupGrid.appendChild(gridItem);
            }
        }

        // 添加到分组图标
        groupIcon.appendChild(groupGrid);
    }

    // 渲染分组的子应用
    renderGroupChildren(groupIndex, children) {
        // 先移除可能已存在的子应用
        this.hideGroupChildren(groupIndex);

        // 获取分组图标
        const groupIcon = this.popup.querySelector(`.app-icon[data-index="${groupIndex}"]`);
        if (!groupIcon) return;

        // 创建子应用容器
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'group-children';
        childrenContainer.dataset.parentIndex = groupIndex;

        // 添加子应用
        children.forEach((child, i) => {
            const childIcon = document.createElement('a');
            childIcon.href = child.url;
            childIcon.className = 'app-icon child-icon';
            childIcon.title = child.title;
            childIcon.dataset.url = child.url;
            childIcon.dataset.childIndex = i;

            const img = document.createElement('img');
            img.alt = child.title;
            img.src = child.favicon;
            img.addEventListener('error', () => this.handleImageError(img, child.title));

            childIcon.appendChild(img);

            // 添加点击事件
            childIcon.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ action: 'switchOrOpenUrl', url: child.url }, (_) => {
                        if (chrome.runtime.lastError) {
                            window.open(child.url, '_blank');
                        }
                    });
                } else {
                    window.open(child.url, '_blank');
                }
            });

            // 添加右键菜单
            childIcon.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showChildContextMenu(e, groupIndex, i);
            });

            childrenContainer.appendChild(childIcon);
        });

        // 插入到分组图标后面
        groupIcon.parentNode.insertBefore(childrenContainer, groupIcon.nextSibling);
    }

    // 隐藏分组的子应用
    hideGroupChildren(groupIndex) {
        const childrenContainer = this.popup.querySelector(`.group-children[data-parent-index="${groupIndex}"]`);
        if (childrenContainer) {
            childrenContainer.remove();
        }
    }

    // 显示子应用的上下文菜单
    showChildContextMenu(e, groupIndex, childIndex) {
        e.preventDefault();
        const rect = e.target.getBoundingClientRect();

        // 确保子应用上下文菜单存在
        if (!this.childContextMenu) {
            this.childContextMenu = document.createElement('div');
            this.childContextMenu.className = 'context-menu child-context-menu sidedock-extension';
            this.childContextMenu.innerHTML = `
                <div class="context-menu-item remove-from-group">
                    <span>从分组中移除</span>
                </div>
            `;
            document.body.appendChild(this.childContextMenu);

            // 添加移除事件
            this.childContextMenu.querySelector('.remove-from-group').addEventListener('click', () => {
                this.removeFromGroup(this.currentGroupIndex, this.currentChildIndex);
                this.hideChildContextMenu();
            });
        }

        this.currentGroupIndex = groupIndex;
        this.currentChildIndex = childIndex;

        this.childContextMenu.style.display = 'block';
        this.childContextMenu.style.left = `${rect.right + 8}px`;
        this.childContextMenu.style.top = `${rect.top}px`;
    }

    // 隐藏子应用上下文菜单
    hideChildContextMenu() {
        if (this.childContextMenu) {
            this.childContextMenu.style.display = 'none';
        }
    }

    // 显示分组弹窗中应用图标的上下文菜单
    showPopupAppContextMenu(e, groupIndex, childIndex) {
        e.preventDefault();
        const rect = e.target.getBoundingClientRect();

        // 确保上下文菜单存在
        if (!this.popupAppContextMenu) {
            this.popupAppContextMenu = document.createElement('div');
            this.popupAppContextMenu.className = 'context-menu popup-app-context-menu sidedock-extension';
            this.popupAppContextMenu.innerHTML = `
                <div class="context-menu-item edit">
                    <span>编辑</span>
                </div>
                <div class="context-menu-item delete">
                    <span>删除</span>
                </div>
                <div class="context-menu-item remove-from-group">
                    <span>从分组中移除</span>
                </div>
            `;
            document.body.appendChild(this.popupAppContextMenu);

            // 添加编辑事件
            this.popupAppContextMenu.querySelector('.edit').addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hidePopupAppContextMenu();
                // 延迟执行编辑操作，确保右键菜单已经隐藏
                setTimeout(() => {
                    this.handlePopupAppEdit();
                }, 10);
            });

            // 添加删除事件
            this.popupAppContextMenu.querySelector('.delete').addEventListener('click', () => {
                this.handlePopupAppDelete();
                this.hidePopupAppContextMenu();
            });

            // 添加从分组中移除事件
            this.popupAppContextMenu.querySelector('.remove-from-group').addEventListener('click', () => {
                this.removeFromGroup(this.currentGroupIndex, this.currentChildIndex);
                this.hidePopupAppContextMenu();
                this.hideGroupPopup();
            });
        }

        // 保存当前分组索引和子应用索引
        this.currentGroupIndex = groupIndex;
        this.currentChildIndex = childIndex;

        // 显示上下文菜单
        this.popupAppContextMenu.style.display = 'block';
        this.popupAppContextMenu.style.zIndex = '2147483648'; // 确保右键菜单始终在最顶层

        // 确保菜单显示在可见区域内

        // 计算右键菜单的位置
        // 如果右侧空间不足，则显示在左侧
        const rightSpace = window.innerWidth - rect.right;
        const menuWidth = this.popupAppContextMenu.offsetWidth || 120; // 估计宽度

        if (rightSpace < menuWidth + 20) {
            // 右侧空间不足，显示在左侧
            this.popupAppContextMenu.style.left = `${rect.left - menuWidth - 8}px`;
        } else {
            // 右侧空间足够，显示在右侧
            this.popupAppContextMenu.style.left = `${rect.right + 8}px`;
        }

        // 计算垂直位置，确保菜单不会超出屏幕底部
        const menuHeight = this.popupAppContextMenu.offsetHeight || 100; // 估计高度
        let topPosition = rect.top;

        if (topPosition + menuHeight > window.innerHeight) {
            // 如果菜单会超出屏幕底部，则向上调整位置
            topPosition = window.innerHeight - menuHeight - 10;
        }

        this.popupAppContextMenu.style.top = `${topPosition}px`;

        // 添加点击外部关闭菜单的事件
        setTimeout(() => {
            document.addEventListener('click', this.handlePopupAppContextMenuDocumentClick);
        }, 0);
    }

    // 隐藏分组弹窗中应用图标的上下文菜单
    hidePopupAppContextMenu() {
        if (this.popupAppContextMenu) {
            this.popupAppContextMenu.style.display = 'none';
            document.removeEventListener('click', this.handlePopupAppContextMenuDocumentClick);
        }
    }

    // 处理文档点击事件（用于关闭分组弹窗中应用图标的上下文菜单）
    handlePopupAppContextMenuDocumentClick = (e) => {
        const isContextMenu = e.target.closest('.popup-app-context-menu');
        if (this.popupAppContextMenu && !isContextMenu) {
            this.hidePopupAppContextMenu();
        }
    }

    // 处理分组弹窗中应用图标的编辑
    async handlePopupAppEdit() {
        try {
            const apps = await this.getApps();
            const group = apps[this.currentGroupIndex];

            // 确保是分组且有子应用
            if (!group || !group.isGroup || !group.children || this.currentChildIndex >= group.children.length) {
                return;
            }

            // 获取子应用
            const child = group.children[this.currentChildIndex];

            // 设置当前应用索引为临时值，表示正在编辑分组中的子应用
            this.currentAppIndex = -1;
            this.currentEditingGroupApp = {
                groupIndex: this.currentGroupIndex,
                childIndex: this.currentChildIndex,
                app: child
            };

            // 获取当前图标的位置
            const currentIcon = this.groupPopup ? this.groupPopup.querySelector(`.popup-app-icon[data-child-index="${this.currentChildIndex}"]`) : null;
            if (!currentIcon) {
                // 如果找不到图标，使用默认位置
                console.log('找不到分组弹窗中的图标，使用默认位置');
                const iconRect = { top: window.innerHeight / 2 - 100, right: window.innerWidth / 2 - 100 };
                this.editModal.style.position = 'fixed';
                this.editModal.style.top = `${iconRect.top}px`;
                this.editModal.style.left = `${iconRect.right + 8}px`;
                this.editModal.style.transform = 'none';
                this.editModal.style.zIndex = '2147483648'; // 确保编辑弹窗在最顶层
                this.editModal.style.display = 'block';
                return;
            }
            const iconRect = currentIcon.getBoundingClientRect();

            const iconImg = this.domElements.editAppIconImg;
            const titleInput = this.domElements.editTitle;
            const urlInput = this.domElements.editUrl;

            // 设置编辑表单的值
            titleInput.value = child.title;
            urlInput.value = child.url;

            // 设置图标
            if (child.favicon && child.favicon !== 'null' && child.favicon !== 'undefined') {
                iconImg.src = child.favicon;
            } else {
                const favicon = await this.getFaviconFromUrl(child.url);
                iconImg.src = favicon;
            }

            // 显示URL输入框和图标编辑区域
            urlInput.style.display = 'block';
            const iconContainer = this.editModal.querySelector('.edit-app-icon');
            if (iconContainer) {
                iconContainer.style.display = 'flex';
            }

            // 设置标题
            this.editModal.querySelector('.header h3').textContent = '编辑应用';

            // 设置弹窗位置
            this.editModal.style.position = 'fixed';
            this.editModal.style.top = `${iconRect.top}px`;
            this.editModal.style.left = `${iconRect.right + 8}px`;
            this.editModal.style.transform = 'none';
            this.editModal.style.zIndex = '2147483648'; // 确保编辑弹窗在最顶层

            // 显示编辑弹窗
            this.editModal.style.display = 'block';

            // 隐藏右键菜单
            if (this.popupAppContextMenu) {
                this.popupAppContextMenu.style.display = 'none';
            }

            // 确保输入框有键盘事件监听器
            this.setupInputKeydownHandlers();
        } catch (error) {
            // Error handling popup app edit
        }
    }

    // 处理分组弹窗中应用图标的删除
    async handlePopupAppDelete() {
        try {
            const apps = await this.getApps();
            const group = apps[this.currentGroupIndex];

            // 确保是分组且有子应用
            if (!group || !group.isGroup || !group.children || this.currentChildIndex >= group.children.length) {
                return;
            }

            // 从分组中移除子应用
            group.children.splice(this.currentChildIndex, 1);

            // 如果分组为空，移除分组标记
            if (group.children.length === 0) {
                delete group.children;
                delete group.isGroup;
                delete group.collapsed;
            }

            // 保存更改
            await this.saveApps(apps);

            // 隐藏分组弹窗
            this.hideGroupPopup();

            // 重新加载应用列表
            this.loadApps();
        } catch (error) {
            // Error handling popup app delete
        }
    }

    // 显示自定义悬停提示
    showTooltip(element) {
        // 如果元素不存在、正在拖拽或分组弹窗已打开，不显示提示
        if (!element || this.isDragging || this.groupPopup) return;

        // 保存当前悬停的元素引用
        this.currentHoverElement = element;

        const tooltip = document.getElementById('sidedock-tooltip');
        if (!tooltip) return;

        // 获取图标标题
        const title = element.dataset.title;
        if (!title) return;

        // 设置提示内容
        tooltip.textContent = title;
        tooltip.style.display = 'block';
        tooltip.style.zIndex = '2147483648'; // 确保tooltip始终在最顶层

        // 计算位置
        const rect = element.getBoundingClientRect();

        // 检查是否是分组弹窗中的图标
        const isInGroupPopup = element.closest('.group-popup') !== null;

        if (isInGroupPopup) {
            // 如果是分组弹窗中的图标，将提示显示在图标下方
            tooltip.style.left = `${rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2)}px`;
            tooltip.style.top = `${rect.bottom + 8}px`;
            // 添加特殊类，用于CSS样式调整
            tooltip.classList.add('group-popup-tooltip');
        } else {
            // 如果是侧边栏中的图标，将提示显示在图标右侧
            tooltip.style.left = `${rect.right + 12}px`;
            tooltip.style.top = `${rect.top + rect.height/2}px`;
            // 移除特殊类
            tooltip.classList.remove('group-popup-tooltip');
        }

        // 立即添加可见类，触发过渡动画
        tooltip.classList.add('visible');
    }

    // 隐藏自定义悬停提示
    hideTooltip() {
        // 清除当前悬停元素引用
        this.currentHoverElement = null;

        const tooltip = document.getElementById('sidedock-tooltip');
        if (!tooltip) return;

        tooltip.classList.remove('visible');

        // 立即隐藏元素
        tooltip.style.display = 'none';
    }

    // 从分组中移除应用
    async removeFromGroup(groupIndex, childIndex) {
        try {
            const apps = await this.getApps();
            const group = apps[groupIndex];

            // 确保是分组且有子应用
            if (!group || !group.isGroup || !group.children || childIndex >= group.children.length) {
                // Invalid group or child index
                return;
            }

            // 获取要移除的子应用
            const child = {...group.children[childIndex]};

            // 从分组中移除
            group.children.splice(childIndex, 1);

            // 如果分组为空，移除分组标记
            if (group.children.length === 0) {
                delete group.children;
                delete group.isGroup;
                delete group.collapsed;
            } else {
                // 如果分组不为空，更新分组图标
                this.updateGroupGrid(groupIndex, group);
            }

            // 将移除的应用添加到主列表
            apps.splice(groupIndex + 1, 0, child);

            // 保存更改
            await this.saveApps(apps);

            // 重新加载应用列表
            this.loadApps();

        } catch (error) {
            // Error removing from group
        }
    }

    // 解散分组
    async handleUngroup() {
        try {
            const apps = await this.getApps();
            const group = apps[this.currentAppIndex];

            // 确保是分组且有子应用
            if (!group || !group.isGroup || !group.children || group.children.length === 0) {
                // Invalid group or no children
                this.hideContextMenu();
                return;
            }

            // 获取子应用
            const children = [...group.children];

            // 从列表中移除分组
            apps.splice(this.currentAppIndex, 1);

            // 将子应用添加到原分组位置
            apps.splice(this.currentAppIndex, 0, ...children);

            // 保存更改
            await this.saveApps(apps);

            // 隐藏上下文菜单
            this.hideContextMenu();

            // 重新加载应用列表
            this.loadApps();

        } catch (error) {
            // Error ungrouping
            this.hideContextMenu();
        }
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
        const titleInput = this.domElements.editTitle;
        const urlInput = this.domElements.editUrl;

        titleInput.value = app.title;
        urlInput.value = app.url;

        // 检查是否是分组
        const isGroup = app.isGroup === true;

        // 如果是分组，隐藏URL输入框和图标编辑区域，只允许编辑分组名称
        if (isGroup) {
            urlInput.style.display = 'none';
            this.editModal.querySelector('.header h3').textContent = '编辑分组';
            // 确保名称输入框可见
            titleInput.style.display = 'block';
            titleInput.style.width = '100%';

            // 隐藏图标编辑区域
            const iconContainer = this.editModal.querySelector('.edit-app-icon');
            if (iconContainer) {
                iconContainer.style.display = 'none';
            }

            // 使用保存的图标
            if (app.favicon && app.favicon !== 'null' && app.favicon !== 'undefined') {
                iconImg.src = app.favicon;
            }
        } else {
            urlInput.style.display = 'block';
            this.editModal.querySelector('.header h3').textContent = '编辑应用';

            // 显示图标编辑区域
            const iconContainer = this.editModal.querySelector('.edit-app-icon');
            if (iconContainer) {
                iconContainer.style.display = 'flex';
            }

            // 使用保存的图标或获取新图标
            if (app.favicon && app.favicon !== 'null' && app.favicon !== 'undefined') {
                iconImg.src = app.favicon;
            } else {
                const favicon = await this.getFaviconFromUrl(app.url);
                iconImg.src = favicon;
            }

            iconImg.addEventListener('error', () => this.handleImageError(iconImg, app.title, this.currentAppIndex));

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
                            // Error fetching favicon
                            iconImg.src = this.generateDefaultIcon(titleInput.value);
                        } finally {
                            iconImg.style.opacity = '1';
                        }
                    }, 1000); // 1秒延迟
                } catch (error) {
                    // Invalid URL
                    iconImg.src = this.generateDefaultIcon(titleInput.value);
                }
            };

            // 同时监听 input 和 change 事件
            urlInput.addEventListener('input', urlInput._urlChangeHandler);
            urlInput.addEventListener('change', urlInput._urlChangeHandler);
        }

        // 设置弹窗位置在图标右侧8px处，并且顶部对齐
        this.editModal.style.position = 'fixed';
        this.editModal.style.top = `${iconRect.top}px`;
        this.editModal.style.left = `${iconRect.right + 8}px`;
        this.editModal.style.transform = 'none';

        this.editModal.style.display = 'block';
        this.contextMenu.style.display = 'none';

        // 确保输入框有键盘事件监听器
        this.setupInputKeydownHandlers();
    }

    hideEditModal() {
        this.editModal.style.display = 'none';
        // 清理 URL 输入事件监听器
        const urlInput = this.domElements.editUrl;
        if (urlInput && urlInput._urlChangeHandler) {
            urlInput.removeEventListener('input', urlInput._urlChangeHandler);
            urlInput._urlChangeHandler = null;
        }

        // 重置输入框的显示状态
        if (urlInput) {
            urlInput.style.display = 'block';
            // 移除键盘事件监听器
            urlInput.removeEventListener('keydown', this.handleInputKeydown);
        }

        // 重置标题输入框的样式
        const titleInput = this.domElements.editTitle;
        if (titleInput) {
            titleInput.style.width = '';
            // 移除键盘事件监听器
            titleInput.removeEventListener('keydown', this.handleInputKeydown);
        }

        // 重置图标编辑区域的显示状态
        const iconContainer = this.editModal.querySelector('.edit-app-icon');
        if (iconContainer) {
            iconContainer.style.display = 'flex';
        }

        // 重置标题
        const headerTitle = this.editModal.querySelector('.header h3');
        if (headerTitle) {
            headerTitle.textContent = '编辑应用';
        }

        // 清除 currentAppIndex
        this.currentAppIndex = null;

        // 清除当前编辑的分组应用
        this.currentEditingGroupApp = null;
    }

    async handleDelete() {
        try {
            // Deleting app...

            // 检查chrome API是否可用
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                // Chrome storage API not available
                return;
            }

            try {
                const apps = await this.getApps();
                // Current apps count, deleting index

                // 确保索引有效
                if (this.currentAppIndex !== null && this.currentAppIndex >= 0 && this.currentAppIndex < apps.length) {
                    // 删除应用
                    apps.splice(this.currentAppIndex, 1);
                    // App deleted

                    // 保存更新后的应用列表
                    await this.saveApps(apps);

                    // Apps saved successfully after delete

                    // 隐藏右键菜单
                    this.hideContextMenu();

                    // 不需要手动重新加载，因为 storage 变更会触发自动重新加载
                    // Storage updated, waiting for automatic reload after delete
                } else {
                    // Invalid app index
                }
            } catch (storageError) {
                // Error accessing storage during delete
            }
        } catch (error) {
            // Error deleting app
        }
    }

    async handleSaveEdit() {
        try {
            // Saving edit...

            // 检查DOM元素
            if (!this.domElements || !this.domElements.editTitle || !this.domElements.editUrl || !this.domElements.editAppIconImg) {
                // Required DOM elements not found
                return;
            }

            const titleInput = this.domElements.editTitle;
            const urlInput = this.domElements.editUrl;
            const iconImg = this.domElements.editAppIconImg;

            const title = titleInput.value.trim();

            // 检查chrome API是否可用
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                // Chrome storage API not available
                return;
            }

            // 获取当前应用列表
            try {
                const apps = await new Promise((resolve, reject) => {
                    try {
                        chrome.storage.local.get(['apps'], (result) => {
                            if (chrome.runtime.lastError) {
                                // Error getting apps
                                reject(new Error(chrome.runtime.lastError.message));
                                return;
                            }
                            resolve(result && result.apps ? result.apps : []);
                        });
                    } catch (error) {
                        // Error in chrome.storage.local.get
                        reject(error);
                    }
                });

                // 检查是否正在编辑分组弹窗中的应用
                if (this.currentEditingGroupApp) {
                    const { groupIndex, childIndex } = this.currentEditingGroupApp;

                    // 确保分组索引有效
                    if (groupIndex < 0 || groupIndex >= apps.length) {
                        return;
                    }

                    // 获取分组
                    const group = apps[groupIndex];

                    // 确保是分组且子应用索引有效
                    if (!group || !group.isGroup || !group.children || childIndex < 0 || childIndex >= group.children.length) {
                        return;
                    }

                    // 获取子应用
                    const child = group.children[childIndex];

                    // 更新子应用数据
                    let url = urlInput.value.trim();
                    if (!title || !url) {
                        // Title and URL are required
                        return;
                    }

                    // 自动补全 URL
                    url = this.autoCompleteUrl(url);

                    // 获取当前显示的图标
                    const favicon = iconImg.src;

                    // 更新子应用数据
                    child.title = title;
                    child.url = url;
                    if (favicon) {
                        child.favicon = favicon;
                    }

                    // 清除当前编辑的分组应用
                    this.currentEditingGroupApp = null;
                } else {
                    // 正常编辑侧边栏中的应用

                    // 确保索引有效
                    if (this.currentAppIndex === null || this.currentAppIndex < 0 || this.currentAppIndex >= apps.length) {
                        // Invalid app index
                        return;
                    }

                    // 获取当前应用
                    const currentApp = apps[this.currentAppIndex];

                    // 检查是否是分组
                    const isGroup = currentApp.isGroup === true;

                    if (isGroup) {
                        // 如果是分组，只更新标题
                        if (!title) {
                            // 分组名称不能为空
                            return;
                        }

                        // 更新分组名称
                        currentApp.title = title;

                        // 分组不需要更新图标
                    } else {
                        // 如果是普通应用，需要URL
                        let url = urlInput.value.trim();
                        if (!title || !url) {
                            // Title and URL are required
                            return;
                        }

                        // 自动补全 URL
                        url = this.autoCompleteUrl(url);

                        // 获取当前显示的图标
                        const favicon = iconImg.src;

                        // 更新应用数据
                        currentApp.title = title;
                        currentApp.url = url;
                        if (favicon) {
                            currentApp.favicon = favicon;
                        }
                    }
                }

                // 保存更新后的应用列表
                await this.saveApps(apps);

                // Apps saved successfully

                // 隐藏编辑模态框
                this.hideEditModal();

                // 如果分组弹窗存在，重新显示
                if (this.groupPopup) {
                    // 重新加载分组弹窗
                    const groupIcon = this.popup.querySelector(`.app-icon[data-index="${this.currentGroupIndex}"]`);
                    if (groupIcon) {
                        const group = apps[this.currentGroupIndex];
                        if (group && group.isGroup && group.children) {
                            this.hideGroupPopup();
                            this.showGroupPopup(groupIcon, group.children);
                        }
                    }
                }

                // 不需要手动重新加载，因为 storage 变更会触发自动重新加载
                // Edit saved, waiting for automatic reload
            } catch (storageError) {
                // Error accessing storage
            }
        } catch (error) {
            // Error saving edit
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
            // Handling image error
            const defaultIcon = this.generateDefaultIcon(title);
            img.src = defaultIcon;

            // Save the default icon to storage if we have an index
            if (index !== undefined) {
                // 检查chrome API是否可用
                if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                    // Chrome storage API not available, cannot save default icon
                    return;
                }

                try {
                    const apps = await this.getApps();
                    if (Array.isArray(apps) && index >= 0 && index < apps.length) {
                        apps[index].favicon = defaultIcon;

                        await this.saveApps(apps);
                    } else {
                        // Invalid app index, cannot save default icon
                    }
                } catch (storageError) {
                    // Error accessing storage during icon error handling
                }
            }
        } catch (error) {
            // Error in handleImageError
            // 即使出错也不要抛出异常，因为这是错误处理函数
        }
    }

    // 侧边栏显示方法
    show() {
        // show() called

        // 防抖动：检查是否正在显示中
        if (this.visible && this.popup && this.popup.classList.contains('visible')) {
            // Sidebar already visible, ignoring redundant show() call
            return;
        }

        // 强制显示侧边栏
        if (this.popup) {
            this.popup.classList.add('visible');
            this.visible = true;
            // Popup shown, visible set to true

            // 移除临时样式（如果之前添加过）
            // 不再需要设置opacity，因为我们始终保持不透明度为1
            // this.popup.style.opacity = '';
            this.popup.style.visibility = '';
            this.popup.style.left = '';
        } else {
            // Popup not found in show()
        }

        // 当侧边栏显示时，完全隐藏触发区域（指示条）
        if (this.triggerZone) {
            // Updating triggerZone in show()
            this.triggerZone.style.display = 'none'; // 完全隐藏触发区域
            this.triggerZone.classList.remove('visible');
            this.triggerZone.classList.remove('active');
            this.triggerZone.classList.remove('idle');
            // triggerZone hidden
            if (this.triggerIdleTimer) {
                clearTimeout(this.triggerIdleTimer);
                this.triggerIdleTimer = null;
                // Cleared triggerIdleTimer in show()
            }
        } else {
            // triggerZone not found in show()
        }
    }

    togglePopup() {
        // 切换侧边栏的显示/隐藏状态
        // togglePopup called
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
                            // getOpenTabs request timed out, using empty tabs list
                            resolve([]);
                        }, 3000); // 增加到3秒超时

                        chrome.runtime.sendMessage({ action: 'getOpenTabs' }, (response) => {
                            clearTimeout(timeoutId);

                            // 检查运行时错误
                            if (chrome.runtime.lastError) {
                                // Chrome runtime returned error for getOpenTabs
                                resolve([]);
                                return;
                            }

                            // 验证响应数据
                            if (!response || !Array.isArray(response.tabs)) {
                                // Invalid response format from getOpenTabs
                                resolve([]);
                                return;
                            }

                            resolve(response.tabs);
                        });
                    } catch (sendError) {
                        // Failed to send getOpenTabs message
                        resolve([]);
                    }
                } else {
                    // Chrome runtime API not available for getOpenTabs
                    resolve([]);
                }
            } catch (error) {
                // Unexpected error in getOpenTabs
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
            // const appPath = appUrlObj.pathname + appUrlObj.search;

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
                // Popup element not found, cannot update active status
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
                    const isGroup = icon.dataset.isGroup === 'true';

                    if (isGroup) {
                        // 如果是分组，检查其子应用是否有活跃的
                        const apps = this.getApps();
                        const index = parseInt(icon.dataset.index);
                        const groupApp = apps[index];

                        if (groupApp && groupApp.children && groupApp.children.length > 0) {
                            const hasActiveChild = groupApp.children.some(child =>
                                this.isAppOpen(child.url, openTabs));

                            if (hasActiveChild) {
                                icon.classList.add('active');
                            } else {
                                icon.classList.remove('active');
                            }
                        } else {
                            icon.classList.remove('active');
                        }
                    } else {
                        // 普通应用图标
                        if (this.isAppOpen(appUrl, openTabs)) {
                            icon.classList.add('active');
                        } else {
                            icon.classList.remove('active');
                        }
                    }
                } catch (error) {
                    // Error updating icon status
                }
            });
        } catch (error) {
            // Error in updateActiveStatus
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
                    // Failed to compress image
                    resolve(dataUrl);
                }
            };

            img.onerror = () => {
                // 如果加载失败，返回原始数据
                // Failed to load image
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

    async handleAddApp() {
        try {
            // Adding new app...

            // 检查chrome API是否可用
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                // Chrome storage API not available, cannot add app
                return;
            }

            // 获取当前页面信息
            const title = document.title || 'Untitled';
            const url = window.location.href;

            if (!url) {
                // Cannot get current URL
                return;
            }

            // Adding app

            try {
                // 检查是否已经添加过该应用
                const existingApps = await this.getApps();
                // Checking against existing apps

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

                        // 比较URL

                        const isMatch = appFullUrl === currentFullUrl;
                        if (isMatch) {
                            // 找到重复应用，完整URL匹配
                            duplicateIndex = index;
                        }
                        return isMatch;
                    } catch (e) {
                        // Error comparing URLs
                        // 如果无法解析URL，则直接比较字符串
                        const isMatch = app.url === url;
                        if (isMatch) {
                            // 找到重复应用，字符串匹配
                            duplicateIndex = index;
                        }
                        return isMatch;
                    }
                });

                if (isDuplicate) {
                    // 该应用已经添加过了

                    // 高亮显示已添加的应用图标
                    this.highlightDuplicateApp(duplicateIndex);

                    return; // 如果已经添加过，则不重复添加
                }

                // 获取图标
                // Getting favicon...
                let favicon;
                try {
                    favicon = await this.getFaviconFromUrl(url);
                } catch (faviconError) {
                    // Error getting favicon, using default icon
                    favicon = this.generateDefaultIcon(title);
                }

                // 创建新应用对象
                const app = { title, url, favicon };

                // 添加到应用列表
                const apps = await this.getApps();
                apps.push(app);

                // Saving app to storage

                // 保存到存储
                await this.saveApps(apps);

                // App saved, reloading app list...

                // 不需要手动重新加载，因为 storage 变更会触发自动重新加载
                // App added, waiting for automatic reload
            } catch (storageError) {
                // Error accessing storage during add
            }
        } catch (error) {
            // Error adding app
        }
    }

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
            // 忽略错误
        }
    }

    hide() {
        // hide() called

        // 防抖动：检查是否已经隐藏
        if (!this.visible && this.popup && !this.popup.classList.contains('visible')) {
            // Sidebar already hidden, ignoring redundant hide() call
            return;
        }

        if (this.popup) {
            this.popup.classList.remove('visible');
            this.visible = false;
            // Popup hidden, visible set to false
        } else {
            // Popup not found in hide()
        }
        if (this.triggerZone) {
            // Updating triggerZone in hide()
            // 清除可能存在的闲置定时器
            if (this.triggerIdleTimer) {
                clearTimeout(this.triggerIdleTimer);
                this.triggerIdleTimer = null;
                // Cleared triggerIdleTimer in hide()
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
                    // triggerZone shown after delay with animation

                    // 启动闲置定时器，在一段时间后使指示线变得更微弱
                    this.triggerIdleTimer = setTimeout(() => {
                        // Idle timer fired in hide()
                        if (!this.visible && this.triggerZone && this.triggerZone.style.display !== 'none') {
                            this.triggerZone.classList.add('idle');
                            // Added idle class to triggerZone in hide()
                        }
                        this.triggerIdleTimer = null;
                    }, this.IDLE_DELAY);
                }
            }, 500); // 0.5秒延迟
        } else {
            // triggerZone not found in hide()
        }
    }

    // 设置输入框键盘事件处理器
    setupInputKeydownHandlers() {
        // 移除可能存在的旧事件监听器
        if (this.domElements.editTitle) {
            this.domElements.editTitle.removeEventListener('keydown', this.handleInputKeydown);
            this.domElements.editTitle.addEventListener('keydown', this.handleInputKeydown);
        }

        if (this.domElements.editUrl) {
            this.domElements.editUrl.removeEventListener('keydown', this.handleInputKeydown);
            this.domElements.editUrl.addEventListener('keydown', this.handleInputKeydown);
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

// 初始化 SideDock
(function() {
    try {
        // 检查是否已经创建了实例
        if (window.sideDock && window.sideDock instanceof SideDock) {
            // SideDock already initialized, reusing existing instance

            // 如果实例已存在，不需要重新加载应用列表
            // 因为实例已经在初始化时加载了应用列表
            // Using existing SideDock instance, no need to reload apps
        } else {
            // Creating new SideDock instance...
            // 创建新实例
            const sideDock = new SideDock();

            // 确保实例正确创建
            if (!window.sideDock) {
                // SideDock instance not set in window object, setting it manually
                window.sideDock = sideDock;
            }
        }
    } catch (error) {
        // Error initializing SideDock
    }
})()

// 检查chrome API是否可用
try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        // Handle extension messages
        chrome.runtime.onMessage.addListener((request, _, __) => {
            try {
                // 检查请求和sideDock实例是否存在
                if (!request || !window.sideDock) {
                    return;
                }

                // 处理切换侧边栏显示状态的请求
                if (request.action === 'toggle') {
                    // Received toggle message from extension
                    window.sideDock.togglePopup();
                } else
                if (request.action === 'updateShortcut' && request.shortcut) {
                    // 处理快捷键更新消息
                    // Received shortcut update
                    window.sideDock.shortcut = request.shortcut;
                } else if (request.action === 'tabsChanged') {
                    // 标签页变化时更新图标状态
                    window.sideDock.updateActiveStatus();
                }
            } catch (error) {
                // Error handling extension message
            }
        });
        // Chrome runtime message listener added successfully
    } else {
        // 将错误级别从 warn 降低到 info，因为这不是严重错误
        // Chrome runtime API not available, message listener not added
    }
} catch (error) {
    // Error setting up message listener
}
