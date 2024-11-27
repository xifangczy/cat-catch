// 低版本chrome manifest v3协议 会有 getMessage 函数不存在的bug
if (chrome.i18n.getMessage === undefined) {
    chrome.i18n.getMessage = (key) => key;
    fetch(chrome.runtime.getURL("_locales/zh/messages.json")).then(res => res.json()).then(data => {
        chrome.i18n.getMessage = (key) => data[key].messages;
    });
}
// 简写翻译函数
const i18n = new Proxy(chrome.i18n.getMessage, {
    get: function (target, key) {
        return chrome.i18n.getMessage(key);
    }
});
// 全局变量
var G = {};
G.initSyncComplete = false;
G.initLocalComplete = false;
// 缓存数据
var cacheData = { init: true };
G.blackList = new Set();
G.requestHeaders = new Map();
// 当前tabID
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].id) {
        G.tabId = tabs[0].id;
    } else {
        G.tabId = -1;
    }
});
// 所有设置变量 默认值
G.OptionLists = {
    Ext: [
        { "ext": "flv", "size": 0, "state": true },
        { "ext": "hlv", "size": 0, "state": true },
        { "ext": "f4v", "size": 0, "state": true },
        { "ext": "mp4", "size": 0, "state": true },
        { "ext": "mp3", "size": 0, "state": true },
        { "ext": "wma", "size": 0, "state": true },
        { "ext": "wav", "size": 0, "state": true },
        { "ext": "m4a", "size": 0, "state": true },
        { "ext": "ts", "size": 0, "state": false },
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
    ],
    Type: [
        { "type": "audio/*", "size": 0, "state": true },
        { "type": "video/*", "size": 0, "state": true },
        { "type": "application/ogg", "size": 0, "state": true },
        { "type": "application/vnd.apple.mpegurl", "size": 0, "state": true },
        { "type": "application/x-mpegurl", "size": 0, "state": true },
        { "type": "application/mpegurl", "size": 0, "state": true },
        { "type": "application/octet-stream-m3u8", "size": 0, "state": true },
        { "type": "application/dash+xml", "size": 0, "state": true },
        { "type": "application/m4s", "size": 0, "state": true },
    ],
    Regex: [
        { "type": "ig", "regex": "https://cache\\.video\\.[a-z]*\\.com/dash\\?tvid=.*", "ext": "json", "state": false },
        { "type": "ig", "regex": ".*\\.bilivideo\\.(com|cn).*\\/live-bvc\\/.*m4s", "ext": "", "blackList": true, "state": false },
    ],
    TitleName: false,
    Player: "",
    ShowWebIco: true,
    MobileUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
    m3u8dl: 0,
    m3u8dlArg: `"\${url}" --save-dir "%USERPROFILE%\\Downloads\\m3u8dl" --save-name "\${title}_\${now}" \${referer|exists:'-H "Referer:*"'} \${cookie|exists:'-H "Cookie:*"'} --no-log`,
    m3u8dlConfirm: false,
    playbackRate: 2,
    copyM3U8: "${url}",
    copyMPD: "${url}",
    copyOther: "${url}",
    autoClearMode: 2,
    catDownload: false,
    saveAs: false,
    userAgent: "",
    downFileName: "${title}.${ext}",
    css: "",
    checkDuplicates: true,
    enable: true,
    downActive: true,
    downAutoClose: false,
    downStream: false,
    aria2Rpc: "http://localhost:6800/jsonrpc",
    enableAria2Rpc: false,
    enableAria2RpcReferer: true,
    aria2RpcToken: "",
    m3u8AutoDown: true,
    badgeNumber: true,
    send2local: false,
    send2localURL: "http://127.0.0.1:8000/",
    popup: false,
    popupHeight: 720,
    popupWidth: 1280,
    popupTop: 0,
    popupLeft: 0,
    invoke: false,
    invokeText: `m3u8dlre:"\${url}" --save-dir "%USERPROFILE%\\Downloads" --del-after-done --save-name "\${title}_\${now}" --auto-select \${referer|exists:'-H "Referer: *"'}`,
    invokeConfirm: false,
    // m3u8解析器默认参数
    M3u8Thread: 6,
    M3u8Mp4: false,
    M3u8OnlyAudio: false,
    M3u8SkipDecrypt: false,
    M3u8StreamSaver: false,
    M3u8Ffmpeg: true,
    M3u8AutoClose: false,
    // 第三方服务地址
    onlineServiceAddress: 0,
    // 新 猫抓下载器
    testDownloader: true
};
// 本地储存的配置
G.LocalVar = {
    featMobileTabId: [],
    featAutoDownTabId: [],
    mediaControl: { tabid: 0, index: -1 }
};

// 102版本以上 非Firefox 开启更多功能
G.isFirefox = (typeof browser == "object");
G.version = navigator.userAgent.match(/(Chrome|Firefox)\/([\d]+)/);
G.version = G.version && G.version[2] ? parseInt(G.version[2]) : 93;

// 脚本列表
G.scriptList = new Map();
G.scriptList.set("search.js", { key: "search", refresh: true, allFrames: true, world: "MAIN", name: i18n.deepSearch, off: i18n.closeSearch, i18n: false, tabId: new Set() });
G.scriptList.set("catch.js", { key: "catch", refresh: true, allFrames: true, world: "MAIN", name: i18n.cacheCapture, off: i18n.closeCapture, i18n: true, tabId: new Set() });
G.scriptList.set("recorder.js", { key: "recorder", refresh: false, allFrames: true, world: "MAIN", name: i18n.videoRecording, off: i18n.closeRecording, i18n: true, tabId: new Set() });
G.scriptList.set("recorder2.js", { key: "recorder2", refresh: false, allFrames: false, world: "ISOLATED", name: i18n.screenCapture, off: i18n.closeCapture, i18n: true, tabId: new Set() });
G.scriptList.set("webrtc.js", { key: "webrtc", refresh: true, allFrames: true, world: "MAIN", name: i18n.recordWebRTC, off: i18n.closeRecording, i18n: true, tabId: new Set() });

// ffmpeg
G.ffmpegConfig = {
    tab: 0,
    cacheData: [],
    version: 1,
    get url() {
        return G.onlineServiceAddress == 0 ? "https://ffmpeg.bmmmd.com/" : "https://ffmpeg2.bmmmd.com/";
    }
}
// streamSaver 边下边存
G.streamSaverConfig = {
    get url() {
        return G.onlineServiceAddress == 0 ? "https://stream.bmmmd.com/mitm.html" : "https://stream2.bmmmd.com/mitm.html";
    }
}

// 正则预编译
const reFilename = /filename="?([^"]+)"?/;
const reStringModify = /[<>:"\/\\|?*~]/g;
const reFilterFileName = /[<>:"|?*~]/g;
const reTemplates = /\${([^}|]+)(?:\|([^}]+))?}/g;

// 防抖
let debounce = undefined;
let debounceCount = 0;
let debounceTime = 0;

// Init
InitOptions();

// 初始变量
function InitOptions() {
    // 断开重新连接后 立刻把local里MediaData数据交给cacheData
    (chrome.storage.session ?? chrome.storage.local).get({ MediaData: {} }, function (items) {
        if (items.MediaData.init) {
            cacheData = {};
            return;
        }
        cacheData = items.MediaData;
    });
    // 读取sync配置数据 交给全局变量G
    chrome.storage.sync.get(G.OptionLists, function (items) {
        if (chrome.runtime.lastError) {
            items = G.OptionLists;
        }
        // Ext的Array转为Map类型
        items.Ext = new Map(items.Ext.map(item => [item.ext, item]));
        // Type的Array转为Map类型
        items.Type = new Map(items.Type.map(item => [item.type, { size: item.size, state: item.state }]));
        // 预编译正则匹配
        items.Regex = items.Regex.map(item => {
            let reg = undefined;
            try { reg = new RegExp(item.regex, item.type) } catch (e) { item.state = false; }
            return { regex: reg, ext: item.ext, blackList: item.blackList, state: item.state }
        });

        // 兼容旧配置
        if (items.copyM3U8.includes('$url$')) {
            items.copyM3U8 = items.copyM3U8.replaceAll('$url$', '${url}').replaceAll('$referer$', '${referer}').replaceAll('$title$', '${title}');
            chrome.storage.sync.set({ copyM3U8: items.copyM3U8 });
        }
        if (items.copyMPD.includes('$url$')) {
            items.copyMPD = items.copyMPD.replaceAll('$url$', '${url}').replaceAll('$referer$', '${referer}').replaceAll('$title$', '${title}');
            chrome.storage.sync.set({ copyMPD: items.copyMPD });
        }
        if (items.copyOther.includes('$url$')) {
            items.copyOther = items.copyOther.replaceAll('$url$', '${url}').replaceAll('$referer$', '${referer}').replaceAll('$title$', '${title}');
            chrome.storage.sync.set({ copyOther: items.copyOther });
        }
        if (typeof items.m3u8dl == 'boolean') {
            items.m3u8dl = items.m3u8dl ? 1 : 0;
            chrome.storage.sync.set({ m3u8dl: items.m3u8dl });
        }

        G = { ...items, ...G };

        const icon = { path: G.enable ? "/img/icon.png" : "/img/icon-disable.png" };
        chrome.action.setIcon(icon);

        G.initSyncComplete = true;
    });
    // 读取local配置数据 交给全局变量G
    (chrome.storage.session ?? chrome.storage.local).get(G.LocalVar, function (items) {
        items.featMobileTabId = new Set(items.featMobileTabId);
        items.featAutoDownTabId = new Set(items.featAutoDownTabId);
        G = { ...items, ...G };
        G.initLocalComplete = true;
    });
}
// 监听变化，新值给全局变量
chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (changes.MediaData) {
        if (changes.MediaData.newValue?.init) { cacheData = {}; }
        return;
    }
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        newValue ??= G.OptionLists[key];
        if (key == "Ext") {
            G.Ext = new Map(newValue.map(item => [item.ext, item]));
            continue;
        }
        if (key == "Type") {
            G.Type = new Map(newValue.map(item => [item.type, { size: item.size, state: item.state }]));
            continue;
        }
        if (key == "Regex") {
            G.Regex = newValue.map(item => {
                let reg = undefined;
                try { reg = new RegExp(item.regex, item.type) } catch (e) { item.state = false; }
                return { regex: reg, ext: item.ext, blackList: item.blackList, state: item.state }
            });
            continue;
        }
        if (key == "featMobileTabId" || key == "featAutoDownTabId") {
            G[key] = new Set(newValue);
            continue;
        }
        G[key] = newValue;
    }
});

// 扩展升级，清空本地储存
chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == "update") {
        chrome.storage.local.clear(function () {
            if (chrome.storage.session) {
                chrome.storage.session.clear(InitOptions);
            } else {
                InitOptions();
            }
        });
        chrome.alarms.create("nowClear", { when: Date.now() + 3000 });
    }
});

// 清理冗余数据
function clearRedundant() {
    chrome.tabs.query({}, function (tabs) {
        const allTabId = new Set(tabs.map(tab => tab.id));

        if (!cacheData.init) {
            // 清理 缓存数据
            let cacheDataFlag = false;
            for (let key in cacheData) {
                if (!allTabId.has(Number(key))) {
                    cacheDataFlag = true;
                    delete cacheData[key];
                }
            }
            cacheDataFlag && (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        }
        // 清理脚本
        G.scriptList.forEach(function (scriptList) {
            scriptList.tabId.forEach(function (tabId) {
                if (!allTabId.has(tabId)) {
                    scriptList.tabId.delete(tabId);
                }
            });
        });

        if (!G.initLocalComplete) { return; }

        // 清理 declarativeNetRequest 模拟手机
        chrome.declarativeNetRequest.getSessionRules(function (rules) {
            let mobileFlag = false;
            for (let item of rules) {
                if (item.condition.tabIds) {
                    // 如果tabIds列表都不存在 则删除该条规则
                    if (!item.condition.tabIds.some(id => allTabId.has(id))) {
                        mobileFlag = true;
                        item.condition.tabIds.forEach(id => G.featMobileTabId.delete(id));
                        chrome.declarativeNetRequest.updateSessionRules({
                            removeRuleIds: [item.id]
                        });
                    }
                } else if (item.id == 1) {
                    // 清理预览视频增加的请求头
                    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] });
                }
            }
            mobileFlag && (chrome.storage.session ?? chrome.storage.local).set({ featMobileTabId: Array.from(G.featMobileTabId) });
        });
        // 清理自动下载
        let autoDownFlag = false;
        G.featAutoDownTabId.forEach(function (tabId) {
            if (!allTabId.has(tabId)) {
                autoDownFlag = true;
                G.featAutoDownTabId.delete(tabId);
            }
        });
        autoDownFlag && (chrome.storage.session ?? chrome.storage.local).set({ featAutoDownTabId: Array.from(G.featAutoDownTabId) });
    });
    // G.referer.clear();
    // G.blackList.clear();
    // G.temp.clear();
}

// 替换掉不允许的文件名称字符
function stringModify(str, text) {
    if (!str) { return str; }
    str = filterFileName(str, text);
    return str.replaceAll("\\", "&bsol;").replaceAll("/", "&sol;");
}
function filterFileName(str, text) {
    if (!str) { return str; }
    reFilterFileName.lastIndex = 0;
    str = str.replaceAll(/\u200B/g, "").replaceAll(/\u200C/g, "").replaceAll(/\u200D/g, "");
    str = str.replace(reFilterFileName, function (match) {
        return text || {
            '<': '&lt;',
            '>': '&gt;',
            ':': '&colon;',
            '"': '&quot;',
            '|': '&vert;',
            '?': '&quest;',
            '*': '&ast;',
            '~': '_'
        }[match];
    });

    // 如果最后一位是"." chrome.download 无法下载
    if (str.endsWith(".")) {
        str = str + "catCatch";
    }
    return str;
}

// 发送到本地接口
async function send2local(action, data, tabId = 0) {
    fetch(G.send2localURL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        },
        body: JSON.stringify({ action: action, data: data, tabId: tabId })
    }).catch((e) => { console.log(e) });
}