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
        if (obj.addRules == undefined) { browser.runtime.reload(); }
        browser.webRequest.onBeforeSendHeaders.addListener(
            function (details) {
                for (var i = 0; i < details.requestHeaders.length; ++i) {
                    if (details.requestHeaders[i].name === obj.addRules[0].action.requestHeaders[0].header) {
                        details.requestHeaders[i].value = obj.addRules[0].action.requestHeaders[0].value;
                        return { requestHeaders: details.requestHeaders };
                    }
                }
                details.requestHeaders.push({
                    name: obj.addRules[0].action.requestHeaders[0].header,
                    value: obj.addRules[0].action.requestHeaders[0].value
                });
                return { requestHeaders: details.requestHeaders };
                
            }, { urls: ["<all_urls>"], tabId: obj.addRules[0].id }, ["blocking", "requestHeaders"]
        );
    };
    chrome.declarativeNetRequest.getSessionRules = () => {
        return [];
    }

    // Firefox scripting API 不完善
    chrome.scripting = new Object();
    chrome.scripting.executeScript = (obj) => {
        return;
    }
}