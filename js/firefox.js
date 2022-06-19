// 兼容Firefox的manifest V2
if (typeof (browser) == "object") {
    chrome.action = browser.browserAction;
    chrome.action.setBadgeText = browser.browserAction.setBadgeText;
    chrome.action.setTitle = browser.browserAction.setTitle;

    function importScripts(script) {
        let js = document.createElement('script');
        js.src = script;
        document.head.appendChild(js);
    }

    // webRequest.onBeforeSendHeaders To declarativeNetRequest.updateSessionRules
    chrome.declarativeNetRequest = new Object();
    chrome.declarativeNetRequest.updateSessionRules = (obj) => {
        if (obj.addRules == undefined) { browser.runtime.reload(); return; }
        browser.webRequest.onBeforeSendHeaders.addListener(
            function (details) {
                for (var i = 0; i < details.requestHeaders.length; ++i) {
                    if (details.requestHeaders[i].name === 'User-Agent') {
                        details.requestHeaders[i].value = G.Options.MobileUserAgent;
                    }
                }
                return { requestHeaders: details.requestHeaders };
            }, { urls: ["<all_urls>"], tabId: G.tabId }, ["blocking", "requestHeaders"]
        );
    };

    // V3 引入scripting 为解决Service Worker休眠问题
    // V2 不存在此问题 只需要return
    // chrome.scripting = new Object();
    chrome.scripting.executeScript = (obj) => {
        // console.log(obj.files[0]);
        // if(obj.files[0]){
        //     browser.tabs.executeScript(obj.target.tabId, {
        //         allFrames: obj.target.allFrames,
        //         file: obj.files[0],
        //         runAt: "document_start"
        //     });
        // }
        return;
    }
}