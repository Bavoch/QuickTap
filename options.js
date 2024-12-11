document.addEventListener('DOMContentLoaded', function() {
    const shortcutInput = document.getElementById('shortcutInput');
    const saveButton = document.getElementById('saveButton');
    const resetButton = document.getElementById('resetButton');
    const tips = document.getElementById('tips');
    const defaultShortcut = { key: 'z', ctrl: false, alt: false, shift: false };
    let currentShortcut = { ...defaultShortcut };
    let isRecording = false;

    // 预定义键盘映射
    const keyMap = {
        'arrowup': '↑',
        'arrowdown': '↓',
        'arrowleft': '←',
        'arrowright': '→',
        'space': '空格',
    };

    // 禁用的快捷键组合
    const disabledShortcuts = new Set([
        JSON.stringify({ key: 'f5', ctrl: false, alt: false, shift: false }),
        JSON.stringify({ key: 'w', ctrl: true, alt: false, shift: false }),
        JSON.stringify({ key: 't', ctrl: true, alt: false, shift: false }),
    ]);

    // 先显示默认快捷键
    updateShortcutDisplay();

    // 异步加载保存的快捷键
    chrome.storage.sync.get(['shortcut'], function(result) {
        if (result.shortcut) {
            currentShortcut = result.shortcut;
            updateShortcutDisplay();
        }
    });

    // 开始记录快捷键
    shortcutInput.addEventListener('focus', function() {
        isRecording = true;
        shortcutInput.classList.add('recording');
        shortcutInput.value = '请按下快捷键';
    });

    // 停止记录快捷键
    shortcutInput.addEventListener('blur', function() {
        isRecording = false;
        shortcutInput.classList.remove('recording');
        updateShortcutDisplay();
    });

    // 处理键盘输入
    shortcutInput.addEventListener('keydown', function(e) {
        if (!isRecording) return;
        e.preventDefault();

        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
        
        const newShortcut = {
            key: e.key.toLowerCase(),
            ctrl: e.ctrlKey,
            alt: e.altKey,
            shift: e.shiftKey
        };

        if (isDisabledShortcut(newShortcut)) {
            showTips('此快捷键组合不可用');
            return;
        }

        currentShortcut = newShortcut;
        updateShortcutDisplay();
        shortcutInput.blur();
    });

    function isDisabledShortcut(shortcut) {
        return disabledShortcuts.has(JSON.stringify(shortcut));
    }

    function updateShortcutDisplay() {
        const display = [];
        if (currentShortcut.ctrl) display.push('Ctrl');
        if (currentShortcut.alt) display.push('Alt');
        if (currentShortcut.shift) display.push('Shift');
        
        const key = currentShortcut.key;
        display.push(keyMap[key.toLowerCase()] || key.toUpperCase());
        shortcutInput.value = display.join(' + ');
    }

    let tipTimeout;
    function showTips(message) {
        if (tipTimeout) {
            clearTimeout(tipTimeout);
        }
        tips.textContent = message;
        tips.classList.add('show');
        
        tipTimeout = setTimeout(() => {
            tips.classList.remove('show');
        }, 2000);
    }

    // 保存设置
    saveButton.addEventListener('click', function() {
        chrome.storage.sync.set({ shortcut: currentShortcut }, function() {
            if (chrome.runtime.lastError) {
                console.error('Failed to save shortcut:', chrome.runtime.lastError);
                showTips('保存失败');
                return;
            }

            chrome.runtime.sendMessage({
                action: 'updateShortcut',
                shortcut: currentShortcut
            });
            showTips('已保存');
        });
    });

    // 重置设置
    resetButton.addEventListener('click', function() {
        currentShortcut = { ...defaultShortcut };
        updateShortcutDisplay();
        
        chrome.storage.sync.set({ shortcut: currentShortcut }, function() {
            if (chrome.runtime.lastError) {
                console.error('Failed to reset shortcut:', chrome.runtime.lastError);
                showTips('重置失败');
                return;
            }

            chrome.runtime.sendMessage({
                action: 'updateShortcut',
                shortcut: currentShortcut
            });
            showTips('已重置');
        });
    });
});
