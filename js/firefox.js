// 兼容Firefox的manifest V2
if (typeof (browser) == "object") {
    chrome.action = browser.browserAction;
    chrome.action.setBadgeText = browser.browserAction.setBadgeText;
    chrome.action.setTitle = browser.browserAction.setTitle;

    function importScripts() {
        for (let script of arguments) {
            const js = document.createElement('script');
            js.src = script;
            document.head.appendChild(js);
        }
    }

    // Firefox scripting API 不完善
    chrome.scripting = new Object();
    chrome.scripting.executeScript = (obj) => {
        return;
    }

    // browser.windows.onFocusChanged.addListener 少一个参数
    chrome.windows.onFocusChanged.addListener = (listener, obj) => {
        browser.windows.onFocusChanged.addListener(listener);
    };

    browser.runtime.onInstalled.addListener(({ reason }) => {
        if (reason == "install") {
            browser.tabs.create({ url: "privacy.html" });
        }
    });

    if (typeof jQuery != "undefined") {
        $('#firefoxYes').click(function () {
            window.close();
        });
        $('#firefoxUninstallSelf').click(function () {
            browser.management.uninstallSelf();
        });
    }
}