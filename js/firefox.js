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
    var webRequestData = {};
    function userAgentListener(details) {
        for (var i = 0; i < details.requestHeaders.length; ++i) {
            if (details.requestHeaders[i].name === webRequestData.addRules[0].action.requestHeaders[0].header) {
                details.requestHeaders[i].value = webRequestData.addRules[0].action.requestHeaders[0].value;
                return { requestHeaders: details.requestHeaders };
            }
        }
        details.requestHeaders.push({
            name: webRequestData.addRules[0].action.requestHeaders[0].header,
            value: webRequestData.addRules[0].action.requestHeaders[0].value
        });
        return { requestHeaders: details.requestHeaders };
    }
    chrome.declarativeNetRequest = new Object();
    chrome.declarativeNetRequest.updateSessionRules = (obj, callback) => {
        webRequestData = obj;
        if (obj.addRules == undefined) {
            browser.webRequest.onBeforeSendHeaders.removeListener(userAgentListener);
            return;
        }
        browser.webRequest.onBeforeSendHeaders.addListener(
            userAgentListener, { urls: ["<all_urls>"], tabId: obj.addRules[0].id }, ["blocking", "requestHeaders"]
        );
        callback && callback();
    };
    chrome.declarativeNetRequest.getSessionRules = () => {
        chrome.tabs.query({}, function (tabs) {
            let allTabId = [];
            for (let item of tabs) {
                allTabId.push(item.id);
            }
            for (let item of G.featMobileTabId) {
                if (!allTabId.includes(item)) {
                    mobileUserAgent(item, false);
                }
            }
        });
    }

    // Firefox scripting API 不完善
    chrome.scripting = new Object();
    chrome.scripting.executeScript = (obj) => {
        return;
    }
}