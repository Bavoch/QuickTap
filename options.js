document.addEventListener('DOMContentLoaded', function() {
    const shortcutInput = document.getElementById('shortcutInput');
    const saveButton = document.getElementById('saveButton');
    const resetButton = document.getElementById('resetButton');
    const status = document.getElementById('status');
    const defaultShortcut = { key: 'z', ctrl: false, alt: false, shift: false };
    let currentShortcut = { ...defaultShortcut };

    // Load saved shortcut
    chrome.storage.sync.get(['shortcut'], function(result) {
        if (result.shortcut) {
            currentShortcut = result.shortcut;
            updateShortcutDisplay();
        }
    });

    // Handle keyboard input
    shortcutInput.addEventListener('keydown', function(e) {
        e.preventDefault();
        
        // Get the key and modifiers
        currentShortcut = {
            key: e.key.toLowerCase(),
            ctrl: e.ctrlKey,
            alt: e.altKey,
            shift: e.shiftKey
        };

        updateShortcutDisplay();
    });

    // Update the input display
    function updateShortcutDisplay() {
        let display = [];
        if (currentShortcut.ctrl) display.push('Ctrl');
        if (currentShortcut.alt) display.push('Alt');
        if (currentShortcut.shift) display.push('Shift');
        display.push(currentShortcut.key.toUpperCase());
        shortcutInput.value = display.join(' + ');
    }

    // Show status message
    function showStatus(message, isSuccess = true) {
        status.textContent = message;
        status.style.color = isSuccess ? '#58E348' : '#FF4444';
        status.style.display = 'block';
        setTimeout(() => {
            status.style.display = 'none';
        }, 2000);
    }

    // Save settings
    saveButton.addEventListener('click', function() {
        chrome.storage.sync.set({
            shortcut: currentShortcut
        }, function() {
            showStatus('设置已保存！');
        });
    });

    // Reset settings
    resetButton.addEventListener('click', function() {
        currentShortcut = { ...defaultShortcut };
        updateShortcutDisplay();
        chrome.storage.sync.set({
            shortcut: currentShortcut
        }, function() {
            showStatus('已重置为默认设置');
        });
    });
});
