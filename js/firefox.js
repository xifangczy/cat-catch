// 兼容Firefox
if (typeof (browser) == "object" && !(typeof (G) == "object" && !G.isFirefox)) {
    function importScripts() {
        for (let script of arguments) {
            const js = document.createElement('script');
            js.src = script;
            document.head.appendChild(js);
        }
    }

    // browser.windows.onFocusChanged.addListener 少一个参数
    const _onFocusChanged = chrome.windows.onFocusChanged.addListener;
    chrome.windows.onFocusChanged.addListener = function (listener, option) {
        _onFocusChanged(listener);
    };
}