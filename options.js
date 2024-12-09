document.addEventListener('DOMContentLoaded', function() {
    const shortcutInput = document.getElementById('shortcutInput');
    const saveButton = document.getElementById('saveButton');
    const resetButton = document.getElementById('resetButton');
    const tips = document.getElementById('tips');
    const defaultShortcut = { key: 'z', ctrl: false, alt: false, shift: false };
    let currentShortcut = { ...defaultShortcut };
    let isRecording = false;

    // 禁用的快捷键组合
    const disabledShortcuts = [
        { key: 'f5', ctrl: false, alt: false, shift: false },
        { key: 'w', ctrl: true, alt: false, shift: false },
        { key: 't', ctrl: true, alt: false, shift: false },
    ];

    // 加载保存的快捷键
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
    });

    // 停止记录快捷键
    shortcutInput.addEventListener('blur', function() {
        isRecording = false;
        shortcutInput.classList.remove('recording');
        updateShortcutDisplay();
    });

    // 处理键盘输入
    shortcutInput.addEventListener('keydown', function(e) {
        e.preventDefault();
        
        if (!isRecording) return;

        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
            return;
        }
        
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
        return disabledShortcuts.some(disabled => 
            disabled.key === shortcut.key &&
            disabled.ctrl === shortcut.ctrl &&
            disabled.alt === shortcut.alt &&
            disabled.shift === shortcut.shift
        );
    }

    function updateShortcutDisplay() {
        let display = [];
        if (currentShortcut.ctrl) display.push('Ctrl');
        if (currentShortcut.alt) display.push('Alt');
        if (currentShortcut.shift) display.push('Shift');
        
        const key = currentShortcut.key;
        const keyMap = {
            'arrowup': '↑',
            'arrowdown': '↓',
            'arrowleft': '←',
            'arrowright': '→',
            'space': '空格',
        };
        
        display.push(keyMap[key.toLowerCase()] || key.toUpperCase());
        shortcutInput.value = display.join(' + ');
    }

    function showTips(message) {
        tips.textContent = message;
        tips.classList.add('show');
        
        setTimeout(() => {
            tips.classList.remove('show');
        }, 2000);
    }

    // 保存设置
    saveButton.addEventListener('click', function() {
        chrome.storage.sync.set({
            shortcut: currentShortcut
        }, function() {
            showTips('已保存');
            // 通知后台脚本更新快捷键
            chrome.runtime.sendMessage({
                action: 'updateShortcut',
                shortcut: currentShortcut
            });
        });
    });

    // 重置设置
    resetButton.addEventListener('click', function() {
        currentShortcut = { ...defaultShortcut };
        updateShortcutDisplay();
        chrome.storage.sync.set({
            shortcut: currentShortcut
        }, function() {
            showTips('已重置');
            // 通知后台脚本更新快捷键
            chrome.runtime.sendMessage({
                action: 'updateShortcut',
                shortcut: currentShortcut
            });
        });
    });
});
