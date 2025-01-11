document.getElementById('installYes').addEventListener('click', function () {
    window.close();
});
document.getElementById('installUninstallSelf').addEventListener('click', function () {
    chrome.management.uninstallSelf();
});