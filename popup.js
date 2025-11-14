document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const resetButton = document.getElementById('resetButton');
    const statusDiv = document.getElementById('status');

    // Immediately request current status from background script when popup opens
    chrome.runtime.sendMessage({ type: 'GET_STATUS' });

    startButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'START_AUTOMATION' });
    });

    resetButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'RESET_AUTOMATION' });
    });

    // Listen for status updates from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'UPDATE_STATUS') {
            statusDiv.textContent = message.text;
        }
    });
});