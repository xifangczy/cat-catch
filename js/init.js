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
    "Player",
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
    "copyOther",
    "refreshClear",
    "initComplete",
    "youtube"
];
G.TabIdList = [
    "featMobileTabId",
    "featAutoDownTabId",
    "featCatchTabId",
    "mediaControl"
];

// Init
InitOptions();

// 102版本以上 非Firefox 开启更多功能
G.isFirefox = navigator.userAgent.includes("Firefox/");
G.isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
G.version = 93;
if (navigator.userAgent.includes("Chrome/")) {
    const version = navigator.userAgent.match(/Chrome\/([\d]+)/);
    if (version && version[1]) {
        G.version = parseInt(version[1]);
    }
}

// 脚本列表
G.scriptList = new Map();
G.scriptList.set("search.js", { refresh: true, allFrames: true, world: "MAIN", name: "深度搜索" });
G.scriptList.set("catch.js", { refresh: true, allFrames: true, world: "MAIN", name: "hook脚本" });
G.scriptList.set("recorder.js", { refresh: false, allFrames: true, world: "MAIN", name: "录制脚本" });
if (G.version >= 104) {
    G.scriptList.set("recorder2.js", { refresh: false, allFrames: false, world: "ISOLATED", name: "录制脚本2" });
}

// 正则预编译
const reProtocol = /^[\w]+:\/\/.+/i;
const reFilename = /filename="(.*?)"/;
const reRange = /([\d]+)-([\d]+)\/([\d]+)/;
const reYoutube = /&range=[^&]*|&rbuf=[^&]*|&rn=[^&]*|&cver=[^&]*|&altitags=[^&]*|&pot=[^&]*|&fallback_count=[^&]*/g;
const reStringModify = /['\\:\*\?"<\/>\|~]/g;
const reOptionsType = /^[^\/]+\/[^\/]+$/ig;

// 防抖
let debounce = undefined;
let debounceCount = 0;

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
        { "type": "application/dash+xml", "size": 0, "state": true },
        { "type": "application/m4s", "size": 0, "state": true }
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
        case "Player": return "";
        case "Regex": return defaultRegex;
        case "ShowWebIco": return false;
        case "MobileUserAgent":
            return "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1";
        case "m3u8dl": return false;
        case "m3u8dlArg": return '"$url$" --workDir "%USERPROFILE%\\Downloads\\m3u8dl" --saveName "$title$" --enableDelAfterDone --headers "Referer:$referer$"';
        case "injectScript": return "search.js";
        case "featMobileTabId": return [];
        case "featAutoDownTabId": return [];
        case "featCatchTabId": return [];
        case "mediaControl": return { tabid: 0, index: -1 };
        case "playbackRate": return 2;
        case "copyM3U8": return "$url$";
        case "copyMPD": return "ffmpeg -headers \"referer: $referer$\" -i \"$url$\" -c copy \"$title$.mp4\"";
        case "copyOther": return "$url$";
        case "refreshClear": return true;
        case "initComplete": return true;
        case "youtube": return false;
    }
}
// 初始变量
function InitOptions() {
    // 断开重新连接后 立刻把local里MediaData数据交给cacheData
    chrome.storage.local.get({ MediaData: {} }, function (items) {
        if (items.MediaData.init) {
            cacheData = {};
            return;
        }
        cacheData = items.MediaData;
    });
    // 读取sync配置数据 交给全局变量G
    chrome.storage.sync.get(G.OptionLists, function (items) {
        for (let list of G.OptionLists) {
            if (items[list] === undefined) {
                chrome.storage.sync.set({ [list]: GetDefault(list) });
                continue;
            }
            if (list == "Ext") {
                G.Ext = new Map();
                for (let key in items[list]) {
                    G.Ext.set(items[list][key].ext, items[list][key]);
                }
                continue;
            }
            G[list] = items[list];
        }
    });
    // 读取local配置数据 交给全局变量G
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
        if (changes.MediaData.newValue?.init) { cacheData = {}; }
        return;
    }
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        if (key == "Ext") {
            G.Ext = new Map();
            for (let key in newValue) {
                G.Ext.set(newValue[key].ext, newValue[key]);
            }
            continue;
        }
        G[key] = newValue;
    }
});
// 扩展升级，清空本地储存
chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == "update") {
        InitOptions();
        chrome.storage.local.clear();
        clearRedundant();

        // 兼容之前版本 PotPlayer打开预览视频选项
        if (G.Potplayer) {
            chrome.storage.sync.set({ Player: "potplayer://$url$" });
            delete G.Potplayer;
        }
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
// 替换掉不允许的文件名称字符
function stringModify(str) {
    return str.replace(reStringModify, function (m) {
        return {
            "'": '&#39;',
            '\\': '&#92;',
            '/': '&#47;',
            ':': '&#58;',
            '*': '&#42;',
            '?': '&#63;',
            '"': '&quot;',
            '<': '&lt;',
            '>': '&gt;',
            '|': '&#124;',
            '~': '_'
        }[m];
    });
}
// Firefox download API 无法下载 data URL
function downloadDataURL(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    delete link;
}
// 判断是否为空
function isEmpty(obj) {
    return (typeof obj == "undefined" ||
        obj == null ||
        obj == "" ||
        obj == " ")
}

function setReferer(referer, callback) {
    chrome.tabs.getCurrent(function (tabs) {
        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [tabs.id],
            addRules: [{
                "id": tabs.id,
                "action": {
                    "type": "modifyHeaders",
                    "requestHeaders": [{
                        "header": "Referer",
                        "operation": "set",
                        "value": referer
                    }]
                },
                "condition": {
                    "tabIds": [tabs.id],
                    "resourceTypes": ["xmlhttprequest"]
                }
            }]
        }, function () {
            callback && callback();
        });
    });
}