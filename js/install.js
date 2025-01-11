document.getElementById('installYes').addEventListener('click', function () {
    closeTab();
});
document.getElementById('installUninstallSelf').addEventListener('click', function () {
    chrome.management.uninstallSelf();
});