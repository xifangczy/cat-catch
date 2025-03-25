document.getElementById('installYes').focus();
document.getElementById('installYes').addEventListener('click', function () {
    closeTab();
});
document.getElementById('installUninstallSelf').addEventListener('click', function () {
    chrome.management.uninstallSelf({ showConfirmDialog: true });
});

if (/Android|webOS|iPhone|iPad/i.test(navigator.userAgent)) {
    document.getElementById('installYes').style.fontSize = '2rem';
    document.getElementById('installUninstallSelf').style.fontSize = '2rem';
}