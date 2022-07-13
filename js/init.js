// 全局变量
var G = {};
// 缓存数据
var cacheData = { init: true };
var refererData = [];
// 当前tabID
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].id) {
        G.tabId = tabs[0].id;
    }
});
// 所有设置变量
G.OptionLists = [
    "Ext",
    "Debug",
    "TitleName",
    "OtherAutoClear",
    "Potplayer",
    "Type",
    "Regex",
    "ShowWebIco",
    "MobileUserAgent",
    "m3u8dl",
    "m3u8dlArg",
    "injectScript",
    "playbackRate",
    "copyM3U8",
    "copyMPD",
];
G.TabIdList = [
    "featMobileTabId",
    "featAutoDownTabId",
    "featCatchTabId"
]

// 102版本以上 非Firefox 开启更多功能
G.isFirefox = false;
G.moreFeat = moreFeatFun();
function moreFeatFun() {
    if (navigator.userAgent.includes("Firefox/")) {
        G.isFirefox = true;
        return false;
    }
    const version = navigator.userAgent.match(/Chrome\/([\d]+)/);
    if (version && version[1] >= 102) {
        return true;
    }
    return false;
}

// Init
InitOptions();

// 变量初始值
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
        { "ext": "m3u", "size": 0, "state": true },
        { "ext": "mpeg", "size": 0, "state": true },
        { "ext": "avi", "size": 0, "state": true },
        { "ext": "wmv", "size": 0, "state": true },
        { "ext": "asf", "size": 0, "state": true },
        { "ext": "movie", "size": 0, "state": true },
        { "ext": "divx", "size": 0, "state": true },
        { "ext": "mpeg4", "size": 0, "state": true },
        { "ext": "vid", "size": 0, "state": true },
        { "ext": "aac", "size": 0, "state": true },
        { "ext": "mpd", "size": 0, "state": true }
    );
    const defaultType = new Array(
        { "type": "audio/*", "size": 0, "state": true },
        { "type": "video/*", "size": 0, "state": true },
        { "type": "application/ogg", "size": 0, "state": true },
        { "type": "application/vnd.apple.mpegurl", "size": 0, "state": true },
        { "type": "application/x-mpegurl", "size": 0, "state": true },
        { "type": "application/mpegurl", "size": 0, "state": true },
        { "type": "application/octet-stream-m3u8", "size": 0, "state": true },
        { "type": "application/dash+xml", "size": 0, "state": true }

    );
    const defaultRegex = new Array(
        { "type": "ig", "regex": ".*vurl=([^&]*)", "ext": "m3u8", "state": true },
        { "type": "ig", "regex": "/getvinfo\\?", "ext": "json", "state": true },
        { "type": "ig", "regex": "https://cache\\.video\\.[a-z]*\\.com/dash\\?tvid=.*", "ext": "json", "state": true }
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
        case "MobileUserAgent":
            return "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1";
        case "m3u8dl": return false;
        case "m3u8dlArg": return '"$url$" --workDir "%USERPROFILE%\\Downloads\\m3u8dl" --saveName "$title$" --enableDelAfterDone --headers "Referer:$referer$"';
        case "injectScript": return "catch.js";
        case "featMobileTabId": return [];
        case "featAutoDownTabId": return [];
        case "featCatchTabId": return [];
        case "playbackRate": return 2;
        case "copyM3U8": return "$url$";
        case "copyMPD": return "ffmpeg -headers \"referer: $referer$\" -i \"$url$\" -c copy \"$title$.mp4\"";
    }
}
// 初始变量
function InitOptions() {
    chrome.storage.local.get({ MediaData: {} }, function (items) {
        cacheData = items.MediaData;
        if(items.MediaData.init){ cacheData = {}; }
    });
    chrome.storage.sync.get(G.OptionLists, function (items) {
        for (let list of G.OptionLists) {
            if (items[list] === undefined) {
                chrome.storage.sync.set({ [list]: GetDefault(list) });
                continue;
            }
            G[list] = items[list];
        }
    });
    chrome.storage.local.get(G.TabIdList, function (items) {
        for (let list of G.TabIdList) {
            if (items[list] === undefined) {
                chrome.storage.local.set({ [list]: GetDefault(list) });
                continue;
            }
            G[list] = items[list];
        }
    });
}
// 监听变化，新值给全局变量
chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (changes.MediaData) {
        if(changes.MediaData.newValue?.init){ cacheData = {}; }
        return;
    }
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        G[key] = newValue;
    }
});
// 扩展升级，清空本地储存
chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == "update") {
        chrome.storage.local.clear();
        clearRedundant();
    }
});

/*公共函数*/
// 秒转换成时间
function secToTime(sec) {
    let time = "";
    let hour = Math.floor(sec / 3600);
    let min = Math.floor((sec % 3600) / 60);
    sec = Math.floor(sec % 60);
    if (hour > 0) {
        time = hour + ":";
    }
    if (min < 10) {
        time += "0";
    }
    time += min + ":";
    if (sec < 10) {
        time += "0";
    }
    time += sec;
    return time;
}
// 字节转换成大小
function byteToSize(byte) {
    if (!byte || byte < 1024) { return 0; }
    if (byte < 1024 * 1024) {
        return parseFloat((byte / 1024).toFixed(1)) + "KB";
    } else if (byte < 1024 * 1024 * 1024) {
        return parseFloat((byte / 1024 / 1024).toFixed(1)) + "MB";
    } else {
        return parseFloat((byte / 1024 / 1024 / 1024).toFixed(1)) + "GB";
    }
}