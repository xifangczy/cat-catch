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
    function updateSessionRules(obj) {
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
    }
    chrome.declarativeNetRequest = new Object();
    chrome.declarativeNetRequest.updateSessionRules = updateSessionRules;
}