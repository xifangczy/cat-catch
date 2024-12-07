// 兼容Firefox的manifest V2
if (typeof (browser) == "object") {
    function importScripts() {
        for (let script of arguments) {
            const js = document.createElement('script');
            js.src = script;
            document.head.appendChild(js);
        }
    }

    // firefox 小于128版本 executeScript不支持world: MAIN 属性
    let version = navigator.userAgent.match(/Firefox\/([\d]+)/);
    version = version && version[1] ? parseInt(version[1]) : 113;
    if (version < 128) {
        chrome.scripting = new Object();
        chrome.scripting.executeScript = (obj) => {
            return;
        }
    }

    // browser.windows.onFocusChanged.addListener 少一个参数
    const _onFocusChanged = chrome.windows.onFocusChanged.addListener;
    chrome.windows.onFocusChanged.addListener = function (listener) {
        _onFocusChanged(listener);
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