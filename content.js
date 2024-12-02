class QuickTap {
    constructor() {
        this.popup = null;
        this.searchBox = null;
        this.appList = null;
        this.contextMenu = null;
        this.editModal = null;
        this.currentAppIndex = null;
        this.shortcut = { key: 'z', ctrl: false, alt: false, shift: false };
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

        const img = document.createElement('img');
        img.alt = app.title;
        img.addEventListener('error', () => this.handleImageError(img, app.title, index));
        img.src = app.favicon;

        container.appendChild(img);
        container.addEventListener('contextmenu', (e) => {
            this.showContextMenu(e, index);
        });

        return container;
    }

    async handleSearch(event) {
        if (event.key === 'Enter') {
            const query = this.searchBox.value.trim();
            if (event.ctrlKey) {
                // Auto-complete URL and visit
                let url = query;
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                }
                window.location.href = url;
            } else if (event.shiftKey) {
                // Translate
                const translatedText = await this.translate(query);
                this.searchBox.value = translatedText;
                this.searchBox.select();
            } else {
                // Google search
                window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            }
        }
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
        const favicon = document.querySelector('link[rel="icon"]') || 
                       document.querySelector('link[rel="shortcut icon"]');
        return favicon ? favicon.href : 'https://www.google.com/s2/favicons?domain=' + window.location.hostname;
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

    async loadApps() {
        const apps = await this.getApps();
        const appList = this.popup.querySelector('.app-list');
        appList.innerHTML = '';
        
        apps.forEach((app, index) => {
            appList.appendChild(this.createAppIcon(app, index));
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
