// 兼容Firefox
if(typeof(browser) == "object"){
    chrome.storage.sync = chrome.storage.local;
    chrome.storage.sync.get = chrome.storage.local.get;
    chrome.storage.sync.set = chrome.storage.local.set;
    chrome.action = chrome.browserAction;
    chrome.action.setBadgeText = chrome.browserAction.setBadgeText;
    chrome.action.setTitle = chrome.browserAction.setTitle;
}

//全局变量
var G = new Object();
//当前tabID
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].id) {
        G.tabId = tabs[0].id;
        G.tabIdStr = "tabId" + tabs[0].id;
    }
});
//设置参数
G.Options = new Object();
//所有设置变量
G.OptionLists = ["Ext", "Debug", "TitleName", "OtherAutoClear", "Potplayer", "Type", "Regex", "ShowWebIco"];

// Init
InitOptions();

//变量初始值
function GetDefault(Obj) {
    const defaultExt = new Array(
        { "ext": "flv", "size": 0, "state": true },
        { "ext": "hlv", "size": 0, "state": true },
        { "ext": "f4v", "size": 0, "state": true },
        { "ext": "mp4", "size": 0, "state": true },
        { "ext": "mp3", "size": 0, "state": true },
        { "ext": "wma", "size": 0, "state": true },
        { "ext": "wav", "size": 0, "state": true },
        { "ext": "m4a", "size": 0, "state": true },
        { "ext": "letv", "size": 0, "state": true },
        { "ext": "ts", "size": 0, "state": true },
        { "ext": "webm", "size": 0, "state": true },
        { "ext": "ogg", "size": 0, "state": true },
        { "ext": "ogv", "size": 0, "state": true },
        { "ext": "acc", "size": 0, "state": true },
        { "ext": "mov", "size": 0, "state": true },
        { "ext": "mkv", "size": 0, "state": true },
        { "ext": "m4s", "size": 0, "state": true },
        { "ext": "m3u8", "size": 0, "state": true },
        { "ext": "mpeg", "size": 0, "state": true },
        { "ext": "avi", "size": 0, "state": true },
        { "ext": "wmv", "size": 0, "state": true },
        { "ext": "asf", "size": 0, "state": true },
        { "ext": "movie", "size": 0, "state": true },
        { "ext": "divx", "size": 0, "state": true },
        { "ext": "mpeg4", "size": 0, "state": true },
        { "ext": "webp", "size": 5120, "state": false }
    );
    const defaultType = new Array(
        { "type": "audio/*", "size": 0, "state": true },
        { "type": "video/*", "size": 0, "state": true },
        { "type": "application/ogg", "size": 0, "state": true },
        { "type": "application/vnd.apple.mpegurl", "size": 0, "state": true },
        { "type": "application/x-mpegurl", "size": 0, "state": true },
        { "type": "application/octet-stream", "size": 0, "state": false },
        { "type": "image/*", "size": 0, "state": false }
    );
    const defaultRegex = new Array(
        { "type": "ig", "regex": "video\\.weibocdn\\.com.*\\.mp4", "state": false }
    );
    switch (Obj) {
        case "Ext": return defaultExt;
        case "Type": return defaultType;
        case "Debug": return false;
        case "TitleName": return false;
        case "OtherAutoClear": return 100;
        case "Potplayer": return false;
        case "Regex": return defaultRegex;
        case "ShowWebIco": return false;
    }
}
//初始变量
function InitOptions() {
    chrome.storage.sync.get(G.OptionLists, function (items) {
        for (let list of G.OptionLists) {
            if (items[list] === undefined) {
                chrome.storage.sync.set({ [list]: GetDefault(list) });
                continue;
            }
            G.Options[list] = items[list];
        }
    });
}
//监听变化，新值给全局变量
chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (namespace != "sync") { return; }
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        G.Options[key] = newValue;
    }
});

// chrome.runtime.onInstalled.addListener(function (details) {
//     if(details.reason == "update"){
//         chrome.storage.sync.clear();
//         InitOptions()
//     }
// });