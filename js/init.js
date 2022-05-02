// 默认设置
var defaultExt = new Array(
    { "ext": "flv", "size": 0 },
    { "ext": "hlv", "size": 0 },
    { "ext": "f4v", "size": 0 },
    { "ext": "mp4", "size": 0 },
    { "ext": "mp3", "size": 0 },
    { "ext": "wma", "size": 0 },
    { "ext": "wav", "size": 0 },
    { "ext": "m4a", "size": 0 },
    { "ext": "letv", "size": 0 },
    { "ext": "ts", "size": 0 },
    { "ext": "webm", "size": 0 },
    { "ext": "ogg", "size": 0 },
    { "ext": "ogv", "size": 0 },
    { "ext": "acc", "size": 0 },
    { "ext": "mov", "size": 0 },
    { "ext": "mkv", "size": 0 },
    { "ext": "m4s", "size": 0 },
    { "ext": "m3u8", "size": 0 }
);
var defaultDebug = false;
var defaultTitleName = false;
var defaultAutoClear = 500;
var defaultPotplayer = false;
var defaultMoreType = false;
var Options = new Object();

// Init
SetOptions();
function SetOptions(){
    chrome.storage.sync.get(["Ext", "Debug", "TitleName", "AutoClear", "Potplayer", "MoreType"], function (items) {
        Options.Ext = items.Ext ? items.Ext : defaultExt;
        Options.Debug = items.Debug ? items.Debug : defaultDebug;
        Options.TitleName = items.TitleName ? items.TitleName : defaultTitleName;
        Options.AutoClear = items.AutoClear ? items.AutoClear : defaultAutoClear;
        Options.Potplayer = items.Potplayer ? items.Potplayer : defaultPotplayer;
        Options.MoreType = items.MoreType ? items.MoreType : defaultMoreType;
        if (items.Ext === undefined) {
            chrome.storage.sync.set({ "Ext": defaultExt });
        }
        if (items.Debug === undefined) {
            chrome.storage.sync.set({ "Debug": defaultDebug });
        }
        if (items.TitleName === undefined) {
            chrome.storage.sync.set({ "TitleName": defaultTitleName });
        }
        if (items.AutoClear === undefined) {
            chrome.storage.sync.set({ "AutoClear": defaultAutoClear });
        }
        if (items.Potplayer === undefined) {
            chrome.storage.sync.set({ "Potplayer": defaultPotplayer });
        }
        if (items.MoreType === undefined) {
            chrome.storage.sync.set({ "MoreType": defaultMoreType });
        }
    });
}

chrome.storage.local.get("MediaData", function (items) {
    if (items.MediaData !== undefined) {
        chrome.action.setBadgeText({ text: items.MediaData.length.toString() });
        chrome.action.setTitle({ title: "抓到 " + items.MediaData.length.toString() + " 条资源" });
    }
});