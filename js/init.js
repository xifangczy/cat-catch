// 全局变量
var G = {};
G.initSyncComplete = false;
G.initLocalComplete = false;
// 缓存数据
var cacheData = { init: true };
G.blockUrlSet = new Set();    // 屏蔽网址列表

// 避免抓取列表
G.damnUrl = [
    /^https:\/\/.*\.douyin\.com\/.*$/i,
];
G.damnUrlSet = new Set();

// 初始化当前tabId
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].id) {
        G.tabId = tabs[0].id;
    } else {
        G.tabId = -1;
    }
});

// 手机浏览器
G.isMobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

// 所有设置变量 默认值
G.OptionLists = {
    Ext: [
        { "ext": "flv", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "hlv", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "f4v", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "mp4", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "mp3", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "wma", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "wav", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "m4a", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "ts", "size": 0, "operator": ">=", "unit": "KB", "state": false },
        { "ext": "webm", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "ogg", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "ogv", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "acc", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "mov", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "mkv", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "m4s", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "m3u8", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "m3u", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "mpeg", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "avi", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "wmv", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "asf", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "movie", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "divx", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "mpeg4", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "vid", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "aac", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "mpd", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "weba", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "opus", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "ext": "srt", "size": 0, "operator": ">=", "unit": "KB", "state": false },
        { "ext": "vtt", "size": 0, "operator": ">=", "unit": "KB", "state": false },
    ],
    Type: [
        { "type": "audio/*", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "type": "video/*", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "type": "application/ogg", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "type": "application/vnd.apple.mpegurl", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "type": "application/x-mpegurl", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "type": "application/mpegurl", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "type": "application/octet-stream-m3u8", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "type": "application/dash+xml", "size": 0, "operator": ">=", "unit": "KB", "state": true },
        { "type": "application/m4s", "size": 0, "operator": ">=", "unit": "KB", "state": true },
    ],
    Regex: [
        { "type": "ig", "regex": "https://cache\\.video\\.[a-z]*\\.com/dash\\?tvid=.*", "ext": "json", "state": false },
        { "type": "ig", "regex": ".*\\.bilivideo\\.(com|cn).*\\/live-bvc\\/.*m4s", "ext": "", "blackList": true, "state": false },
        { "type": "ig", "regex": "(^https://scontent[a-z0-9-]*\\.cdninstagram\\.com/.*)&bytestart=.*", "ext": "", "blackList": false, "state": false },
        { "type": "ig", "regex": "(^https://.*\\.fbcdn\\.net/.*)&bytestart=.*", "ext": "", "blackList": false, "state": false },
    ],
    TitleName: false,   // 使用自定义文件名保存文件(默认为网页标题)
    Player: "", // 使用本地播放器调用协议打开视频预览
    ShowWebIco: !G.isMobile,    // 显示网页图标
    MobileUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",   // 模拟手机浏览器UA

    // m3u8dl: 协议
    m3u8dl: 0,  // 0:禁用 1:CIL 2:RE
    m3u8dlArg: `"\${url}" --save-dir "%USERPROFILE%\\Downloads\\m3u8dl" --save-name "\${title}_\${now}" \${referer|exists:'-H "Referer:*"'} \${cookie|exists:'-H "Cookie:*"'} --no-log`,
    m3u8dlConfirm: false, // 点击下载后是否提示 确认参数

    playbackRate: 2,    // 默认播放倍率

    // 复制
    copyM3U8: "${url}",
    copyMPD: "${url}",
    copyOther: "${url}",

    autoClearMode: 1,   // 清理模式 0:不清理 1:正常清理 2:更频繁
    catDownload: false, // 始终不启用猫抓下载器
    saveAs: false,  // 下载完选择保存目录 另存为
    userAgent: "",
    downFileName: "${title}.${ext}",    // 默认下载文件名
    css: "",    // 自定义css
    checkDuplicates: true,  // 检查重复项
    enable: true,   // 启用总开关
    downActive: !G.isMobile,    // 手机端默认不启用 后台下载
    downAutoClose: true,    // 下载后自动关闭
    downStream: false,  // 边下边存

    // Aria2
    aria2Rpc: "http://localhost:6800/jsonrpc",
    enableAria2Rpc: false,
    enableAria2RpcReferer: true,
    aria2RpcToken: "",
    aria2RpcDir: "",

    m3u8AutoDown: true, // m3u8自动下载
    badgeNumber: true,  // 显示数字徽章

    // 发送到本地
    send2local: false,
    send2localManual: false,
    send2localURL: "http://127.0.0.1:8000/",
    send2localMethod: 'POST',
    send2localBody: '{"action": "${action}", "data": ${data}, "tabId": "${tabId}"}',
    send2localType: 0,
    send2localHeaders: "",

    popup: false,   // 是否默认弹出模式
    popupMode: 0, // 0:preview.html 1:popup.html 2:window preview.html 3: window popup.html

    // 远程调用
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
    chromeLimitSize: 1.8 * 1024 * 1024 * 1024,
    blockUrl: [],
    blockUrlWhite: false,
    maxLength: G.isMobile ? 999 : 9999,
    sidePanel: false,   // 侧边栏
    deepSearch: false, // 常开深度搜索

    // MQTT 配置
    send2MQTT: false,
    mqttEnable: false,
    mqttBroker: "test.mosquitto.org",
    mqttPort: 8081,
    mqttPath: "/mqtt",
    mqttProtocol: "wss",
    mqttClientId: "cat-catch-client",
    mqttUser: "",
    mqttPassword: "",
    mqttTopic: "cat-catch/media",
    mqttQos: 0,
    mqttTitleLength: 100,
    mqttDataFormat: "",

    getHtmlDOM: false,  // 实验项 获取当前网页DOM

    damn: false,    // 强制屏蔽网站开关

    iframeFFmpeg: false,    // 潜入在线ffmpeg
    contextMenus: false,    // 右键菜单
};

// 本地储存的配置
G.LocalVar = {
    featMobileTabId: [],
    featAutoDownTabId: [],
    mediaControl: { tabid: 0, index: -1 },

    // 预览页面
    previewShowTitle: false, // 是否显示标题
    previewDeleteDuplicateFilenames: false, // 是否删除重复文件名
};

// 102版本以上 非Firefox 开启更多功能
G.isFirefox = navigator.userAgent.includes('Firefox') && (typeof browser !== 'undefined' && !!browser.runtime?.getBrowserInfo);
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
        return G.onlineServiceAddress == 0 ? "https://ffmpeg.bmmmd.com/" : "https://ffmpeg.94cat.com/";
    }
}
// streamSaver 边下边存
G.streamSaverConfig = {
    get url() {
        return G.onlineServiceAddress == 0 ? "https://stream.bmmmd.com/mitm.html" : "https://ffmpeg.94cat.com/mitm.html";
    }
}

// 正则预编译
const reFilterFileName = /[<>:"|?*~]/g; // 过滤文件名包含的非法字符
const reJSONparse = /([{,]\s*)([\w-]+)(\s*:)/g; // JSON.parse 解析不带引号的key

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
        // 确保有默认值
        for (let key in G.OptionLists) {
            if (items[key] === undefined || items[key] === null) {
                items[key] = G.OptionLists[key];
            }
        }
        // Ext的Array转为Map类型 如果是范围 增加min max属性
        items.Ext = new Map(items.Ext.map(item => {
            if (item.operator === undefined) { item.operator = ">="; }
            if (item.operator === "~") {
                const [min, max] = item.size.split("-");
                item.min = min ? parseInt(min) : 0;
                item.max = max ? parseInt(max) : 0;
            }
            return [item.ext, item];
        }));
        // Type的Array转为Map类型 如果是范围 增加min max属性
        items.Type = new Map(items.Type.map(item => {
            if (item.operator === undefined) { item.operator = ">="; }
            if (item.operator === "~") {
                const [min, max] = item.size.split("-");
                item.min = min ? parseInt(min) : 0;
                item.max = max ? parseInt(max) : 0;
            }
            return [item.type, item];
        }));
        // 预编译正则匹配
        items.Regex = items.Regex.map(item => {
            let reg = undefined;
            try { reg = new RegExp(item.regex, item.type) } catch (e) { item.state = false; }
            return { regex: reg, ext: item.ext, blackList: item.blackList, state: item.state }
        });
        // 预编译屏蔽通配符
        items.blockUrl = items.blockUrl.map(item => {
            return { url: wildcardToRegex(item.url), state: item.state }
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

        // 侧边栏
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: items.sidePanel });

        // 右键菜单注册
        contextMenusInit(items.contextMenus);

        G = { ...items, ...G };

        // 初始化 G.blockUrlSet
        (typeof isLockUrl == 'function') && chrome.tabs.query({}, function (tabs) {
            for (const tab of tabs) {
                if (tab.url) {
                    isLockUrl(tab.url) && G.blockUrlSet.add(tab.id);
                    isDamnUrl(tab.url) && G.damnUrlSet.add(tab.id);
                }
            }
        });

        chrome.action.setIcon({ path: G.enable ? "/img/icon.png" : "/img/icon-disable.png" });
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
            G.Ext = new Map(newValue.map(item => {
                if (item.operator === "~") {
                    const [min, max] = item.size.split("-");
                    item.min = min ? parseInt(min) : 0;
                    item.max = max ? parseInt(max) : 0;
                }
                return [item.ext, item];
            }));
            continue;
        }
        if (key == "Type") {
            G.Type = new Map(newValue.map(item => {
                if (item.operator === "~") {
                    const [min, max] = item.size.split("-");
                    item.min = min ? parseInt(min) : 0;
                    item.max = max ? parseInt(max) : 0;
                }
                return [item.type, item];
            }));
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
        if (key == "blockUrl") {
            G.blockUrl = newValue.map(item => {
                return { url: wildcardToRegex(item.url), state: item.state }
            });
            continue;
        }
        if (key == "featMobileTabId" || key == "featAutoDownTabId") {
            G[key] = new Set(newValue);
            continue;
        }
        if (key == "sidePanel" && !G.isFirefox) {
            chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: newValue });
            continue;
        }
        if (key == "contextMenus") {
            contextMenusInit(newValue);
            continue;
        }
        G[key] = newValue;
    }
});

function contextMenusInit(visible = false) {
    // 注册右键
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "cat-catch",
            title: i18n.catCatch,
            contexts: ["page", "image"],
            visible: visible
        });
        chrome.contextMenus.create({
            id: "image-save",
            parentId: "cat-catch",
            title: i18n.save,
            contexts: ["image"]
        });
        chrome.contextMenus.create({
            id: "enable",
            parentId: "cat-catch",
            title: `${i18n.enable} / ${i18n.disable}`,
            contexts: ["page", "image"]
        });
        chrome.contextMenus.create({
            id: "preview",
            parentId: "cat-catch",
            title: i18n.preview,
            contexts: ["page", "image"]
        });
        chrome.contextMenus.create({
            id: "deepSearch",
            parentId: "cat-catch",
            title: i18n.deepSearch,
            contexts: ["page", "image"]
        });
        chrome.contextMenus.create({
            id: "catch",
            parentId: "cat-catch",
            title: i18n.cacheCapture,
            contexts: ["page", "image"]
        });
        chrome.contextMenus.create({
            id: "auto_down",
            parentId: "cat-catch",
            title: i18n.autoDownload,
            contexts: ["page", "image"]
        });
    });
}

/**
 * 将用户输入的URL（可能包含通配符）转换为正则表达式
 * @param {string} urlPattern - 用户输入的URL，可能包含通配符
 * @returns {RegExp} - 转换后的正则表达式
 */
function wildcardToRegex(urlPattern) {
    // 将通配符 * 转换为正则表达式的 .*
    // 将通配符 ? 转换为正则表达式的 .
    // 同时转义其他正则表达式特殊字符
    const regexPattern = urlPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 转义正则表达式特殊字符
        .replace(/\*/g, '.*') // 将 * 替换为 .*
        .replace(/\?/g, '.'); // 将 ? 替换为 .

    // 创建正则表达式，确保匹配整个URL
    return new RegExp(`^${regexPattern}$`, 'i'); // 忽略大小写
}