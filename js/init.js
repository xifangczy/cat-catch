//全局变量
var G = new Object();
//当前tabID
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    G.tabId = tabs[0].id;
    G.tabIdStr = "tabId" + tabs[0].id;
});
G.Version = "1.0.23";
//设置参数
G.Options = new Object();

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
        { "type": "ig", "regex": "music\\.126\\.net.*\\.m4a", "state": false }
    );
    switch (Obj) {
        case "Ext": return defaultExt;
        case "Type": return defaultType;
        case "Debug": return false;
        case "TitleName": return false;
        case "OtherAutoClear": return 500;
        case "Potplayer": return false;
        case "Regex": return defaultRegex;
    }
}
//初始变量
function InitOptions() {
    chrome.storage.sync.get(["Ext", "Debug", "TitleName", "OtherAutoClear", "Potplayer", "Type", "Regex"], function (items) {
        G.Options.Ext = items.Ext ? items.Ext : GetDefault("Ext");
        G.Options.Debug = items.Debug ? items.Debug : GetDefault("Debug");
        G.Options.TitleName = items.TitleName ? items.TitleName : GetDefault("TitleName");
        G.Options.OtherAutoClear = items.OtherAutoClear ? items.OtherAutoClear : GetDefault("OtherAutoClear");
        G.Options.Potplayer = items.Potplayer ? items.Potplayer : GetDefault("Potplayer");
        G.Options.Type = items.Type ? items.Type : GetDefault("Type");
        G.Options.Regex = items.Regex ? items.Regex : GetDefault("Regex");
        if (items.Ext === undefined) {
            chrome.storage.sync.set({ "Ext": GetDefault("Ext") });
        }
        if (items.Debug === undefined) {
            chrome.storage.sync.set({ "Debug": GetDefault("Debug") });
        }
        if (items.TitleName === undefined) {
            chrome.storage.sync.set({ "TitleName": GetDefault("TitleName") });
        }
        if (items.OtherAutoClear === undefined) {
            chrome.storage.sync.set({ "OtherAutoClear": GetDefault("OtherAutoClear") });
        }
        if (items.Potplayer === undefined) {
            chrome.storage.sync.set({ "Potplayer": GetDefault("Potplayer") });
        }
        if (items.Type === undefined) {
            chrome.storage.sync.set({ "Type": GetDefault("Type") });
        }
        if (items.Regex === undefined) {
            chrome.storage.sync.set({ "Regex": GetDefault("Regex") });
        }
    });
}
//设置变量
function SetOption(obj, val) {
    if (obj != undefined) {
        val = val ? val : GetDefault(obj);
        chrome.storage.sync.set({ [obj]: val });
    }
}
//重置所有变量
function ResetOptions() {
    chrome.storage.sync.clear();
    InitOptions();
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
//         ResetOptions();
//     }
// });