// 默认设置
var defaultExt = new Array(
    {"ext":"flv","size":0},
    {"ext":"hlv","size":0},
    {"ext":"f4v","size":0},
    {"ext":"mp4","size":0},
    {"ext":"mp3","size":0},
    {"ext":"wma","size":0},
    {"ext":"wav","size":0},
    {"ext":"m4a","size":0},
    {"ext":"letv","size":0},
    {"ext":"ts","size":0},
    {"ext":"webm","size":0},
    {"ext":"ogg","size":0},
    {"ext":"ogv","size":0},
    {"ext":"acc","size":0},
    {"ext":"mov","size":0},
    {"ext":"mkv","size":0},
    {"ext":"m4s","size":0},
    {"ext":"m3u8","size":0}
);
var defaultDebug = false;
var defaultTitleName = false;
var defaultAutoClear = 500;
var defaultPotplayer = false;
var Options = new Array();

// Init
chrome.storage.sync.get("Ext", function(items) {
    if(items.Ext === undefined){
        chrome.storage.sync.set({"Ext": defaultExt});
        Options["Ext"] = defaultExt;
    }else{
        Options["Ext"] = items.Ext;
    }
});
chrome.storage.sync.get("Debug", function(items) {
    if(items.Debug === undefined){
        chrome.storage.sync.set({"Debug": defaultDebug});
        Options["Debug"] = defaultDebug;
    }else{
        Options["Debug"] = items.Debug;
    }
});
chrome.storage.sync.get("TitleName", function(items) {
    if(items.TitleName === undefined){
        chrome.storage.sync.set({"TitleName": defaultTitleName});
        Options["TitleName"] = defaultTitleName;
    }else{
        Options["TitleName"] = items.TitleName;
    }
});
chrome.storage.sync.get("AutoClear", function(items) {
    if(items.AutoClear === undefined){
        chrome.storage.sync.set({"AutoClear": defaultAutoClear});
        Options["AutoClear"] = defaultAutoClear;
    }else{
        Options["AutoClear"] = items.AutoClear;
    }
});
chrome.storage.sync.get("Potplayer", function(items) {
    if(items.Potplayer === undefined){
        chrome.storage.sync.set({"Potplayer": defaultPotplayer});
        Options['Potplayer'] = defaultPotplayer;
    }else{
        Options['Potplayer'] = items.Potplayer;
    }
});

chrome.storage.sync.get("MediaData", function(items) {
    if(items.MediaData !== undefined){
        chrome.action.setBadgeText({text: items.MediaData.length.toString()});
        chrome.action.setTitle({title: "抓到 " + items.MediaData.length.toString() + " 条资源"});
    }
});