document.addEventListener('DOMContentLoaded', function() {
    const shortcutInput = document.getElementById('shortcutInput');
    const saveButton = document.getElementById('saveButton');
    const status = document.getElementById('status');
    let currentShortcut = { key: 'z', ctrl: false, alt: false, shift: false };

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

    // Save settings
    saveButton.addEventListener('click', function() {
        chrome.storage.sync.set({
            shortcut: currentShortcut
        }, function() {
            status.style.display = 'block';
            setTimeout(function() {
                status.style.display = 'none';
            }, 2000);
        });
    });
});
