// 默认设置
var defaultExt = new Array(
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
    { "ext": "mpeg4", "size": 0, "state": true }
);
var defaultType = new Array(
    { "type": "audio/*", "size": 0, "state": true },
    { "type": "video/*", "size": 0, "state": true },
    { "type": "application/ogg", "size": 0, "state": true },
    { "type": "application/vnd.apple.mpegurl", "size": 0, "state": true },
    { "type": "application/x-mpegurl", "size": 0, "state": true },
    { "type": "application/octet-stream", "size": 0, "state": false },
    { "type": "image/*", "size": 0, "state": false }
);
var defaultDebug = false;
var defaultTitleName = false;
var defaultOtherAutoClear = 500;
var defaultPotplayer = false;
var Options = new Object();

// Init
SetOptions();
function SetOptions() {
    chrome.storage.sync.get(["Ext", "Debug", "TitleName", "OtherAutoClear", "Potplayer", "Type"], function (items) {
        Options.Ext = items.Ext ? items.Ext : defaultExt;
        Options.Debug = items.Debug ? items.Debug : defaultDebug;
        Options.TitleName = items.TitleName ? items.TitleName : defaultTitleName;
        Options.OtherAutoClear = items.OtherAutoClear ? items.OtherAutoClear : defaultOtherAutoClear;
        Options.Potplayer = items.Potplayer ? items.Potplayer : defaultPotplayer;
        Options.Type = items.Type ? items.Type : defaultType;
        if (items.Ext === undefined || items.Ext[0].state === undefined) {
            chrome.storage.sync.set({ "Ext": defaultExt });
        }
        if (items.Debug === undefined) {
            chrome.storage.sync.set({ "Debug": defaultDebug });
        }
        if (items.TitleName === undefined) {
            chrome.storage.sync.set({ "TitleName": defaultTitleName });
        }
        if (items.OtherAutoClear === undefined) {
            chrome.storage.sync.set({ "OtherAutoClear": defaultOtherAutoClear });
        }
        if (items.Potplayer === undefined) {
            chrome.storage.sync.set({ "Potplayer": defaultPotplayer });
        }
        if (items.Type === undefined) {
            chrome.storage.sync.set({ "Type": defaultType });
        }
    });
}

// chrome.runtime.onInstalled.addListener(function (details) {
//     if(details.reason == "update"){
//         chrome.storage.sync.clear();
//         SetOptions();
//     }
// });