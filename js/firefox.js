// 兼容Firefox的manifest V2
if(typeof(browser) == "object"){
    chrome.action = chrome.browserAction;
    chrome.action.setBadgeText = chrome.browserAction.setBadgeText;
    chrome.action.setTitle = chrome.browserAction.setTitle;

    function importScripts(script){
        let js = document.createElement('script');
        js.src = script;
        document.getElementsByTagName('head')[0].appendChild(js);
    }
}