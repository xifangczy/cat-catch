/**
 * chrome 使用v3 background.service_worker 加载模式
 * firefox 使用v2 background.scripts 加载模式
 * firefox 在 manifest 文件中已经加载以下脚本，如果已经加载 G 变量存在，不再加载。
 */
if (typeof G === 'undefined') {
    importScripts("/js/polyfill.js", "/js/function.js", "/js/templates.js", "/js/init.js", "/js/popup-utils.js");
}

// Service Worker 5分钟后会强制终止扩展
// https://bugs.chromium.org/p/chromium/issues/detail?id=1271154
// https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/70003493#70003493
chrome.webNavigation.onBeforeNavigate.addListener(function () { return; });
chrome.webNavigation.onHistoryStateUpdated.addListener(function () { return; });
chrome.runtime.onConnect.addListener(function (Port) {
    if (chrome.runtime.lastError || Port.name !== "HeartBeat") return;
    Port.postMessage("HeartBeat");
    Port.onMessage.addListener(function (message, Port) { return; });
    const interval = setInterval(function () {
        clearInterval(interval);
        Port.disconnect();
    }, 250000);
    Port.onDisconnect.addListener(function () {
        interval && clearInterval(interval);
        if (chrome.runtime.lastError) { return; }
    });
});
setInterval(chrome.runtime.getPlatformInfo, 25 * 1000);

// 全局变量
let debounce = undefined;
let debounceCount = 0;
let debounceTime = 0;
const reFilename = /filename="?([^"]+)"?/;

G.deepSearchTemporarilyClose = null; // 深度搜索临时变量
G.urlMap = new Map();   // url查重map
G.requestHeaders = new Map();   // 临时储存请求头
G.blackList = new Set();    // 正则屏蔽资源列表
G.videoFloatDown = new Map();   // 视频浮窗提交的下载任务 下载失败时交给猫抓下载器

/**
 *  定时任务
 *  nowClear clear 清理冗余数据
 *  save 保存数据
 */
chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === "nowClear" || alarm.name === "clear") {
        clearRedundant();
        return;
    }
    if (alarm.name === "save") {
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        return;
    }
});

// onBeforeRequest 浏览器发送请求之前使用正则匹配发送请求的URL
// chrome.webRequest.onBeforeRequest.addListener(
//     function (data) {
//         try { findMedia(data, true); } catch (e) { console.log(e); }
//     }, { urls: ["<all_urls>"] }, ["requestBody"]
// );
// 保存requestHeaders
chrome.webRequest.onSendHeaders.addListener(
    function (data) {
        if (G && G.initSyncComplete && !G.enable) { return; }
        if (data.requestHeaders) {
            G.requestHeaders.set(data.requestId, data.requestHeaders);
            data.allRequestHeaders = data.requestHeaders;
        }
        try { findMedia(data, true); } catch (e) { console.log(e); }
    }, { urls: ["<all_urls>"] }, ['requestHeaders',
        chrome.webRequest.OnBeforeSendHeadersOptions.EXTRA_HEADERS].filter(Boolean)
);
// onResponseStarted 浏览器接收到第一个字节触发，保证有更多信息判断资源类型
chrome.webRequest.onResponseStarted.addListener(
    function (data) {
        try {
            data.allRequestHeaders = G.requestHeaders.get(data.requestId);
            if (data.allRequestHeaders) {
                G.requestHeaders.delete(data.requestId);
            }
            findMedia(data);
        } catch (e) { console.log(e, data); }
    }, { urls: ["<all_urls>"] }, ["responseHeaders"]
);
// 删除失败的requestHeadersData
chrome.webRequest.onErrorOccurred.addListener(
    function (data) {
        G.requestHeaders.delete(data.requestId);
        G.blackList.delete(data.requestId);
    }, { urls: ["<all_urls>"] }
);

function findMedia(data, isRegex = false, filter = false, timer = false) {
    // Service Worker被强行杀死之后重新自我唤醒，等待全局变量初始化完成。
    if (!G || !G.initSyncComplete || !G.initLocalComplete || G.tabId == undefined || cacheData.init) {
        if (timer) { return; }
        setTimeout(() => {
            findMedia(data, isRegex, filter, true);
        }, 500);
        return;
    }

    if (G.damn && G.damnUrlSet.has(data.tabId)) {
        return;
    }

    /**
     * 以下情况不处理
     * 是否全局启用
     * 当前标签是否在屏蔽列表中
     * OPTIONS 请求不处理
     */
    const blockUrlFlag = data.tabId && data.tabId > 0 && G.blockUrlSet.has(data.tabId);
    if (!G.enable || (G.blockUrlWhite ? !blockUrlFlag : blockUrlFlag) || data?.method == "OPTIONS") {
        return;
    }

    data.getTime = Date.now();

    if (!isRegex && G.blackList.has(data.requestId)) {
        G.blackList.delete(data.requestId);
        return;
    }
    // 屏蔽特殊页面发起的资源
    if (data.initiator != "null" &&
        data.initiator != undefined &&
        isSpecialPage(data.initiator)) { return; }
    if (G.isFirefox &&
        data.originUrl &&
        isSpecialPage(data.originUrl)) { return; }
    // 屏蔽特殊页面的资源
    if (isSpecialPage(data.url)) { return; }
    const urlParsing = new URL(data.url);
    let [name, ext] = fileNameParse(urlParsing.pathname);

    //正则匹配
    if (isRegex && !filter) {
        for (let key in G.Regex) {
            if (!G.Regex[key].state) { continue; }
            G.Regex[key].regex.lastIndex = 0;
            let result = G.Regex[key].regex.exec(data.url);
            if (result == null) { continue; }
            if (G.Regex[key].blackList) {
                G.blackList.add(data.requestId);
                return;
            }
            data.extraExt = G.Regex[key].ext ? G.Regex[key].ext : undefined;
            if (result.length == 1) {
                findMedia(data, true, true);
                return;
            }
            result.shift();
            result = result.map(str => decodeURIComponent(str));
            if (!result[0].startsWith('https://') && !result[0].startsWith('http://')) {
                result[0] = urlParsing.protocol + "//" + data.url;
            }
            data.url = result.join("");
            findMedia(data, true, true);
            return;
        }
        return;
    }

    // 非正则匹配
    if (!isRegex) {
        // 获取头部信息
        data.header = getResponseHeadersValue(data);
        //检查后缀
        if (!filter && ext != undefined) {
            filter = CheckExtension(ext, data.header?.size);
            if (filter == "break") { return; }
        }
        //检查类型
        if (!filter && data.header?.type != undefined) {
            filter = CheckType(data.header.type, data.header?.size);
            if (filter == "break") { return; }
        }
        //查找附件
        if (!filter && data.header?.attachment != undefined) {
            const res = data.header.attachment.match(reFilename);
            if (res && res[1]) {
                [name, ext] = fileNameParse(decodeURIComponent(res[1]));
                filter = CheckExtension(ext, 0);
                if (filter == "break") { return; }
            }
        }
        //放过类型为media的资源
        if (data.type == "media") {
            filter = true;
        }
    }

    if (!filter) { return; }

    // 谜之原因 获取得资源 tabId可能为 -1 firefox中则正常
    // 检查是 -1 使用当前激活标签得tabID
    data.tabId = data.tabId == -1 ? G.tabId : data.tabId;

    cacheData[data.tabId] ??= [];
    cacheData[G.tabId] ??= [];

    // 缓存数据大于9999条 清空缓存 避免内存占用过多
    if (cacheData[data.tabId].length > G.maxLength) {
        cacheData[data.tabId] = [];
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        return;
    }

    // 查重 避免CPU占用 大于500 强制关闭查重
    // if (G.checkDuplicates && cacheData[data.tabId].length <= 500) {
    //     for (let item of cacheData[data.tabId]) {
    //         if (item.url.length == data.url.length &&
    //             item.cacheURL.pathname == urlParsing.pathname &&
    //             item.cacheURL.host == urlParsing.host &&
    //             item.cacheURL.search == urlParsing.search) { return; }
    //     }
    // }

    if (G.checkDuplicates && cacheData[data.tabId].length <= 500) {
        const tabFingerprints = G.urlMap.get(data.tabId) || new Set();
        if (tabFingerprints.has(data.url)) {
            return; // 找到重复，直接返回
        }
        tabFingerprints.add(data.url);
        G.urlMap.set(data.tabId, tabFingerprints);
        if (tabFingerprints.size >= 500) {
            tabFingerprints.clear();
        }
    }

    chrome.tabs.get(data.tabId, async function (webInfo) {
        if (chrome.runtime.lastError) { return; }
        data.requestHeaders = getRequestHeaders(data);
        // requestHeaders 中cookie 单独列出来
        if (data.requestHeaders?.cookie) {
            data.cookie = data.requestHeaders.cookie;
            data.requestHeaders.cookie = undefined;
        }
        const info = {
            name: name,
            url: data.url,
            size: data.header?.size,
            ext: ext,
            type: data.mime ?? data.header?.type,
            tabId: data.tabId,
            frameId: data.frameId,  // 资源所属的frame 视频浮窗用来对应页面内的video
            isRegex: isRegex,
            requestId: data.requestId ?? Date.now().toString(),
            initiator: data.initiator,
            requestHeaders: data.requestHeaders,
            cookie: data.cookie,
            // cacheURL: { host: urlParsing.host, search: urlParsing.search, pathname: urlParsing.pathname },
            getTime: data.getTime
        };
        // 不存在扩展使用类型
        if (info.ext === undefined && info.type !== undefined) {
            info.ext = info.type.split("/")[1];
        }
        // 正则匹配的备注扩展
        if (data.extraExt) {
            info.ext = data.extraExt;
        }
        // 不存在 initiator 和 referer 使用web url代替initiator
        if (info.initiator == undefined || info.initiator == "null") {
            info.initiator = info.requestHeaders?.referer ?? webInfo?.url;
        }
        // 装载页面信息
        info.title = webInfo?.title ?? "NULL";
        info.favIconUrl = webInfo?.favIconUrl;
        info.webUrl = webInfo?.url;
        // 屏蔽资源
        if (!isRegex && G.blackList.has(data.requestId)) {
            G.blackList.delete(data.requestId);
            return;
        }
        // 发送到popup 并检查自动下载
        chrome.runtime.sendMessage({ Message: "popupAddData", data: info }, function () {
            if (G.featAutoDownTabId.size > 0 && G.featAutoDownTabId.has(info.tabId) && chrome.downloads?.State) {
                try {
                    const downDir = info.title == "NULL" ? "CatCatch/" : stringModify(info.title) + "/";
                    let fileName = isEmpty(info.name) ? stringModify(info.title) + '.' + info.ext : decodeURIComponent(stringModify(info.name));
                    if (G.TitleName) {
                        fileName = filterFileName(templates(G.downFileName, info));
                    } else {
                        fileName = downDir + fileName;
                    }
                    chrome.downloads.download({
                        url: info.url,
                        filename: fileName
                    });
                } catch (e) { return; }
            }
            if (chrome.runtime.lastError) { return; }
        });

        // 数据发送
        if (G.send2local) {
            try { send2local("catch", { ...info, requestHeaders: data.allRequestHeaders }, info.tabId); } catch (e) { console.log(e); }
        }

        // 储存数据
        cacheData[info.tabId] ??= [];
        cacheData[info.tabId].push(info);

        // 通知视频浮窗更新
        videoFloatNotify(info.tabId);

        // 当前标签媒体数量大于100 开启防抖 等待5秒储存 或 积累10个资源储存一次。
        if (cacheData[info.tabId].length >= 100 && debounceCount <= 10) {
            debounceCount++;
            clearTimeout(debounce);
            debounce = setTimeout(function () { save(info.tabId); }, 5000);
            return;
        }
        // 时间间隔小于500毫秒 等待2秒储存
        if (Date.now() - debounceTime <= 500) {
            clearTimeout(debounce);
            debounceTime = Date.now();
            debounce = setTimeout(function () { save(info.tabId); }, 2000);
            return;
        }
        save(info.tabId);
    });
}
// cacheData数据 储存到 chrome.storage.local
function save(tabId) {
    clearTimeout(debounce);
    debounceTime = Date.now();
    debounceCount = 0;
    if (cacheData[tabId]) {
        // 单个标签数据超过99条 不再保存到storage
        if (cacheData[tabId]?.length <= 99) {
            (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData }, function () {
                chrome.runtime.lastError && console.log(chrome.runtime.lastError);
            });
        }
        SetIcon({ number: cacheData[tabId].length, tabId: tabId });
    }
}

/**
 * 监听 扩展 message 事件
 */
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (chrome.runtime.lastError) { return; }
    if (!G.initLocalComplete || !G.initSyncComplete) {
        sendResponse("error");
        return true;
    }
    // 以下检查是否有 tabId 不存在使用当前标签
    Message.tabId = Message.tabId ?? G.tabId;

    // 从缓存中保存数据到本地
    if (Message.Message == "pushData") {
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        sendResponse("ok");
        return true;
    }
    // 获取所有数据
    if (Message.Message == "getAllData") {
        sendResponse(cacheData);
        return true;
    }
    /**
     * 设置扩展图标数字
     * 提供 type 删除标签为 tabId 的数字
     * 不提供type 删除所有标签的数字
     */
    if (Message.Message == "ClearIcon") {
        Message.type ? SetIcon({ tabId: Message.tabId }) : SetIcon();
        sendResponse("ok");
        return true;
    }
    // 启用/禁用扩展
    if (Message.Message == "enable") {
        G.enable = !G.enable;
        chrome.storage.sync.set({ enable: G.enable });
        chrome.action.setIcon({ path: G.enable ? "/img/icon.png" : "/img/icon-disable.png" });
        sendResponse(G.enable);
        return true;
    }
    /**
     * 提供requestId数组 获取指定的数据
     */
    if (Message.Message == "getData" && Message.requestId) {
        // 判断Message.requestId是否数组
        if (!Array.isArray(Message.requestId)) {
            Message.requestId = [Message.requestId];
        }
        const response = [];
        if (Message.requestId.length) {
            for (let item in cacheData) {
                for (let data of cacheData[item]) {
                    if (Message.requestId.includes(data.requestId)) {
                        response.push(data);
                    }
                }
            }
        }
        sendResponse(response.length ? response : "error");
        return true;
    }
    /**
     * 提供 tabId 获取该标签数据
     */
    if (Message.Message == "getData") {
        sendResponse(cacheData[Message.tabId]);
        return true;
    }
    /**
     * 获取各按钮状态
     * 模拟手机 自动下载 启用 以及各种脚本状态
     */
    if (Message.Message == "getButtonState") {
        let state = {
            MobileUserAgent: G.featMobileTabId.has(Message.tabId),
            AutoDown: G.featAutoDownTabId.has(Message.tabId),
            enable: G.enable,
        }
        G.scriptList.forEach(function (item, key) {
            state[item.key] = item.tabId.has(Message.tabId);
        });
        sendResponse(state);
        return true;
    }
    // 对tabId的标签 进行模拟手机操作
    if (Message.Message == "mobileUserAgent") {
        mobileUserAgent(Message.tabId, !G.featMobileTabId.has(Message.tabId));
        chrome.tabs.reload(Message.tabId, { bypassCache: true });
        sendResponse("ok");
        return true;
    }
    // 对tabId的标签 开启 关闭 自动下载
    if (Message.Message == "autoDown") {
        if (G.featAutoDownTabId.has(Message.tabId)) {
            G.featAutoDownTabId.delete(Message.tabId);
        } else {
            G.featAutoDownTabId.add(Message.tabId);
        }
        (chrome.storage.session ?? chrome.storage.local).set({ featAutoDownTabId: Array.from(G.featAutoDownTabId) });
        sendResponse("ok");
        return true;
    }
    // 对tabId的标签 脚本注入或删除
    if (Message.Message == "script") {
        if (G.damn && G.damnUrlSet.has(Message.tabId)) {
            return;
        }
        if (!G.scriptList.has(Message.script)) {
            sendResponse("error no exists");
            return false;
        }
        const script = G.scriptList.get(Message.script);
        const scriptTabid = script.tabId;
        const refresh = Message.refresh ?? script.refresh;
        if (scriptTabid.has(Message.tabId)) {
            scriptTabid.delete(Message.tabId);
            if (Message.script == "search.js") {
                G.deepSearchTemporarilyClose = Message.tabId;
            }
            refresh && chrome.tabs.reload(Message.tabId, { bypassCache: true });
            sendResponse("ok");
            return true;
        }
        scriptTabid.add(Message.tabId);
        if (refresh) {
            chrome.tabs.reload(Message.tabId, { bypassCache: true });
        } else {
            const files = [`catch-script/${Message.script}`];
            script.file && files.unshift(...script.file);
            chrome.scripting.executeScript({
                target: { tabId: Message.tabId, allFrames: script.allFrames },
                files: files,
                injectImmediately: true,
                world: script.world
            });
        }
        sendResponse("ok");
        return true;
    }
    // 脚本注入 脚本申请多语言文件
    if (Message.Message == "scriptI18n") {
        chrome.scripting.executeScript({
            target: { tabId: Message.tabId, allFrames: true },
            files: ["catch-script/i18n.js"],
            injectImmediately: true,
            world: "MAIN"
        });
        sendResponse("ok");
        return true;
    }
    // Heart Beat
    if (Message.Message == "HeartBeat") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0] && tabs[0].id) {
                G.tabId = tabs[0].id;
            }
        });
        sendResponse("HeartBeat OK");
        return true;
    }
    // 清理数据
    if (Message.Message == "clearData") {
        // 当前标签
        if (Message.type) {
            delete cacheData[Message.tabId];
            (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
            clearRedundant();
            videoFloatNotify(Message.tabId);
            sendResponse("OK");
            return true;
        }
        // 其他标签
        for (let item in cacheData) {
            if (item == Message.tabId) { continue; }
            delete cacheData[item];
            videoFloatNotify(Number(item));
        }
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        clearRedundant();
        sendResponse("OK");
        return true;
    }
    // 清理冗余数据
    if (Message.Message == "clearRedundant") {
        clearRedundant();
        sendResponse("OK");
        return true;
    }
    // 从 content-script 或 catch-script 传来的媒体url
    if (Message.Message == "addMedia") {
        chrome.tabs.query({}, function (tabs) {
            for (let item of tabs) {
                if (item.url == Message.href) {
                    // 资源归属的标签就是发送者所在标签时 才记录frameId
                    const frameId = sender.tab?.id == item.id ? sender.frameId : undefined;
                    findMedia({ url: Message.url, tabId: item.id, frameId: frameId, extraExt: Message.extraExt, mime: Message.mime, requestId: Message.requestId, requestHeaders: Message.requestHeaders }, true, true);
                    return true;
                }
            }
            // tabId 为 -1 的资源归属当前激活标签 发送者不在该标签时不记录frameId
            const frameId = sender.tab?.id == G.tabId ? sender.frameId : undefined;
            findMedia({ url: Message.url, tabId: -1, frameId: frameId, extraExt: Message.extraExt, mime: Message.mime, requestId: Message.requestId, initiator: Message.href, requestHeaders: Message.requestHeaders }, true, true);
        });
        sendResponse("ok");
        return true;
    }
    // ffmpeg网页通信
    if (Message.Message == "catCatchFFmpeg") {
        const data = { ...Message, Message: "ffmpeg", tabId: Message.tabId ?? sender.tab.id, version: G.ffmpegConfig.version };
        chrome.tabs.query({ url: G.ffmpegConfig.url + "*" }, function (tabs) {
            if (chrome.runtime.lastError || !tabs.length) {
                chrome.tabs.create({ url: G.ffmpegConfig.url, active: Message.active ?? true }, function (tab) {
                    if (chrome.runtime.lastError) { return; }
                    G.ffmpegConfig.tab = tab.id;
                    G.ffmpegConfig.cacheData.push(data);
                });
                return true;
            }
            if (tabs[0].status == "complete") {
                chrome.tabs.sendMessage(tabs[0].id, data);
            } else {
                G.ffmpegConfig.tab = tabs[0].id;
                G.ffmpegConfig.cacheData.push(data);
            }
        });
        sendResponse("ok");
        return true;
    }
    // 发送数据到本地
    if (Message.Message == "send2local" && G.send2local) {
        try { send2local(Message.action, Message.data, Message.tabId); } catch (e) { console.log(e); }
        sendResponse("ok");
        return true;
    }
    if (Message.Message == "damnUrlHas") {
        sendResponse(G.damnUrlSet.has(Message.tabId));
        return true;
    }
    if (Message.Message == "closeScript") {
        if (!Message.script || !G.scriptList.has(Message.script)) {
            sendResponse("error");
            return false;
        }
        const script = G.scriptList.get(Message.script);
        const scriptTabid = script.tabId;
        if (scriptTabid.has(Message.tabId)) {
            scriptTabid.delete(Message.tabId);
        }
        sendResponse("ok");
        return true;
    }
    // 视频浮窗 获取发送者所在frame的资源列表 icons 为 true 时同时返回图标
    if (Message.Message == "videoFloatGetData") {
        const result = videoFloatGetData(sender);
        if (!Message.icons) {
            sendResponse(result);
            return true;
        }
        videoFloatGetIcons().then(function (icons) {
            result.icons = icons;
            sendResponse(result);
        });
        return true;
    }
    // 视频浮窗 预览 m3u8 需要 hls.js 注入到浮窗所在的 frame (和 content-script 同一个环境)
    if (Message.Message == "videoFloatHls") {
        if (!sender.tab || !chrome.scripting) {
            sendResponse(false);
            return true;
        }
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
            files: ["lib/hls.min.js"]
        }, function () {
            sendResponse(!chrome.runtime.lastError);
        });
        return true;
    }
    // 视频浮窗 资源的操作 复制 / 解析 / 下载 / 在线合并 / 发送 等
    if (Message.Message == "videoFloatAction") {
        videoFloatAction(Message, sender, sendResponse);
        return true;
    }
});

/**
 * 监听 外部扩展 message 事件
 */
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request.action === "getData") {
        if (request.tabId) {
            sendResponse(cacheData[request.tabId] ?? null);
            return true;
        }
        sendResponse(cacheData);
        return true;
    } else if (request.action === "getCurrentTabData") {
        const tabId = request.tabId ?? G.tabId;
        sendResponse(cacheData[tabId] ?? null);
        return true;
    }
});

// 选定标签 更新G.tabId
// chrome.tabs.onHighlighted.addListener(function (activeInfo) {
//     if (activeInfo.windowId == -1 || !activeInfo.tabIds || !activeInfo.tabIds.length) { return; }
//     G.tabId = activeInfo.tabIds[0];
// });

/**
 * 监听 切换标签
 * 更新全局变量 G.tabId 为当前标签
 */
chrome.tabs.onActivated.addListener(function (activeInfo) {
    G.tabId = activeInfo.tabId;
    if (cacheData[G.tabId] !== undefined) {
        SetIcon({ number: cacheData[G.tabId].length, tabId: G.tabId });
        return;
    }
    SetIcon({ tabId: G.tabId });
});

// 切换窗口，更新全局变量G.tabId
chrome.windows.onFocusChanged.addListener(function (activeInfo) {
    if (activeInfo == -1) { return; }
    chrome.tabs.query({ active: true, windowId: activeInfo }, function (tabs) {
        if (tabs[0] && tabs[0].id) {
            G.tabId = tabs[0].id;
        } else {
            G.tabId = -1;
        }
    });
});

/**
 * 监听 标签页面更新
 * 检查 清理数据
 * 检查 是否在屏蔽列表中
 */
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (isSpecialPage(tab.url) || tabId <= 0 || !G.initSyncComplete) { return; }
    // console.log('onUpdated', tabId, changeInfo, tab);
    if (changeInfo.status && changeInfo.status == "loading" && G.autoClearMode == 2) {
        G.urlMap.delete(tabId);
        chrome.alarms.get("save", function (alarm) {
            if (!alarm) {
                delete cacheData[tabId];
                SetIcon({ tabId: tabId });
                videoFloatNotify(tabId);
                chrome.alarms.create("save", { when: Date.now() + 1000 });
            }
        });
    }
    // 检查当前标签是否在屏蔽列表中
    if (changeInfo.url && tabId > 0) {
        if (G.blockUrl.length) {
            G.blockUrlSet.delete(tabId);
            if (isLockUrl(changeInfo.url)) {
                G.blockUrlSet.add(tabId);
            }
        }

        G.damnUrlSet.delete(tabId);
        if (isDamnUrl(changeInfo.url)) {
            G.damnUrlSet.add(tabId);
        }
    }
    chrome.sidePanel.setOptions({
        tabId,
        path: "popup.html?tabId=" + tabId
    });
});

/**
 * 监听 frame 正在载入
 * 检查 是否在屏蔽列表中 (frameId == 0 为主框架)
 * 检查 自动清理 (frameId == 0 为主框架)
 * 检查 注入脚本
 */
chrome.webNavigation.onCommitted.addListener(function (details) {
    if (isSpecialPage(details.url) || details.tabId <= 0 || !G.initSyncComplete) { return; }
    // console.log('onCommitted', details);

    // 刷新页面 检查是否在屏蔽列表中
    if (details.frameId == 0) {
        G.blockUrlSet.delete(details.tabId);
        if (isLockUrl(details.url)) {
            G.blockUrlSet.add(details.tabId);
        }

        G.damnUrlSet.delete(details.tabId);
        if (isDamnUrl(details.url)) {
            G.damnUrlSet.add(details.tabId);
        }
    }

    // 刷新清理角标数
    if (details.frameId == 0 && (!['auto_subframe', 'manual_subframe', 'form_submit'].includes(details.transitionType)) && G.autoClearMode == 1) {
        delete cacheData[details.tabId];
        G.urlMap.delete(details.tabId);
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        SetIcon({ tabId: details.tabId });
    }

    // chrome内核版本 102 以下不支持 chrome.scripting.executeScript API
    if (G.version < 102) { return; }

    if (!G.blockUrlSet.has(details.tabId) && G.deepSearch && G.deepSearchTemporarilyClose != details.tabId) {
        G.scriptList.get("search.js").tabId.add(details.tabId);
        G.deepSearchTemporarilyClose = null;
    }

    // catch-script 脚本
    G.scriptList.forEach(function (item, script) {
        if (!item.tabId.has(details.tabId) || !item.allFrames) { return true; }

        const files = [`catch-script/${script}`];
        item.file && files.unshift(...item.file);
        chrome.scripting.executeScript({
            target: { tabId: details.tabId, frameIds: [details.frameId] },
            files: files,
            injectImmediately: true,
            world: item.world
        });
    });

    // 模拟手机
    if (G.initLocalComplete && G.featMobileTabId.size > 0 && G.featMobileTabId.has(details.tabId)) {
        chrome.scripting.executeScript({
            args: [G.MobileUserAgent.toString()],
            target: { tabId: details.tabId, frameIds: [details.frameId] },
            func: function () {
                Object.defineProperty(navigator, 'userAgent', { value: arguments[0], writable: false });
            },
            injectImmediately: true,
            world: "MAIN"
        });
    }
});

/**
 * 监听 标签关闭 清理数据
 */
chrome.tabs.onRemoved.addListener(function (tabId) {
    // 清理缓存数据
    chrome.alarms.get("nowClear", function (alarm) {
        !alarm && chrome.alarms.create("nowClear", { when: Date.now() + 1000 });
    });
    if (G.initSyncComplete) {
        G.blockUrlSet.has(tabId) && G.blockUrlSet.delete(tabId);
        G.damnUrlSet.has(tabId) && G.damnUrlSet.delete(tabId);
    }
});

// 右键菜单 和 快捷键 复用函数
const runCommands = (command, data) => {
    if (command == "auto_down") {
        if (G.featAutoDownTabId.has(G.tabId)) {
            G.featAutoDownTabId.delete(G.tabId);
        } else {
            G.featAutoDownTabId.add(G.tabId);
        }
        (chrome.storage.session ?? chrome.storage.local).set({ featAutoDownTabId: Array.from(G.featAutoDownTabId) });
    } else if (command == "catch") {
        const scriptTabid = G.scriptList.get("catch.js").tabId;
        scriptTabid.has(G.tabId) ? scriptTabid.delete(G.tabId) : scriptTabid.add(G.tabId);
        chrome.tabs.reload(G.tabId, { bypassCache: true });
    } else if (command == "m3u8") {
        chrome.tabs.create({ url: "m3u8.html" });
    } else if (command == "clear") {
        delete cacheData[G.tabId];
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        clearRedundant();
        SetIcon({ tabId: G.tabId });
        videoFloatNotify(G.tabId);
    } else if (command == "enable") {
        G.enable = !G.enable;
        chrome.storage.sync.set({ enable: G.enable });
        chrome.action.setIcon({ path: G.enable ? "/img/icon.png" : "/img/icon-disable.png" });
    } else if (command == "reboot") {
        chrome.runtime.reload();
    } else if (command == "deepSearch") {
        const script = G.scriptList.get("search.js");
        const scriptTabid = script.tabId;
        if (scriptTabid.has(G.tabId)) {
            scriptTabid.delete(G.tabId);
            G.deepSearchTemporarilyClose = G.tabId;
            chrome.tabs.reload(G.tabId, { bypassCache: true });
            return;
        }
        scriptTabid.add(G.tabId);
        chrome.tabs.reload(G.tabId, { bypassCache: true });
    } else if (command == "preview") {
        chrome.tabs.create({ url: `preview.html?tabId=${G.tabId}` });
    } else if (command == "image-save") {
        chrome.downloads.download({
            url: data.srcUrl,
            saveAs: G.saveAs
        }, () => {
            chrome.runtime.lastError && console.error(chrome.runtime.lastError);
            G.downDataImageSave = data;
        });
    }
}
chrome.downloads.onChanged.addListener(function (item) {
    if (G.catDownload) { delete G.downDataImageSave; G.videoFloatDown.clear(); return; }
    const errorList = ["SERVER_BAD_CONTENT", "SERVER_UNAUTHORIZED", "SERVER_FORBIDDEN", "SERVER_UNREACHABLE", "SERVER_CROSS_ORIGIN_REDIRECT", "SERVER_FAILED", "NETWORK_FAILED"];
    if (item.error && errorList.includes(item.error.current) && G.downDataImageSave) {
        const data = { requestHeaders: { referer: G.downDataImageSave.pageUrl }, requestId: G.tabId, url: G.downDataImageSave.srcUrl };
        chrome.tabs.create({ url: `downloader.html?JSON=${JSON.stringify(data)}&autoClose=true`, active: false });
        delete G.downDataImageSave;
    }
    // 视频浮窗提交的下载 出现服务器拒绝错误 调用下载器
    const floatData = G.videoFloatDown.get(item.id);
    if (floatData) {
        if (item.error && errorList.includes(item.error.current)) {
            G.videoFloatDown.delete(item.id);
            videoFloatCatDownload(floatData);
        } else if (item.state && item.state.current != "in_progress") {
            G.videoFloatDown.delete(item.id);
        }
    }
});

/**
 * 浏览器 扩展快捷键
 */
chrome.commands.onCommand.addListener(function (command) {
    runCommands(command);
});

/**
 * 监听 右键菜单事件
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
    runCommands(info.menuItemId, info);
});

/**
 * 监听 页面完全加载完成 判断是否在线ffmpeg页面
 * 如果是在线ffmpeg 则发送数据
 */
chrome.webNavigation.onCompleted.addListener(function (details) {
    if (G.ffmpegConfig.tab && details.tabId == G.ffmpegConfig.tab) {
        setTimeout(() => {
            G.ffmpegConfig.cacheData.forEach(data => {
                chrome.tabs.sendMessage(details.tabId, data);
            });
            G.ffmpegConfig.cacheData = [];
            G.ffmpegConfig.tab = 0;
        }, 500);
    }
});

// 操作符检查
function operatorCheck(size, Obj) {
    const unitNumber = {
        "B": 1,
        "BYTE": 1,
        "KB": 1024,
        "MB": 1048576,
        "GB": 1073741824
    };
    const unit = (Obj.unit || "B");
    const targetSize = Obj.size * (unitNumber[unit] || 1);
    switch (Obj.operator) {
        case "=":
            return size == targetSize;
        case "<":
            return size < targetSize;
        case ">":
            return size > targetSize;
        case "<=":
            return size <= targetSize;
        case ">=":
            return size >= targetSize;
        case "!=":
            return size != targetSize;
        case "~":
            return (Obj.min ? size >= Obj.min * (unitNumber[unit] || 1) : true) && (Obj.max ? size <= Obj.max * (unitNumber[unit] || 1) : true);
        default:
            return size <= targetSize;
    }
}

/**
 * 检查扩展名和大小
 * @param {String} ext 
 * @param {Number} size 
 * @returns {Boolean|String}
 */
function CheckExtension(ext, size) {
    const Ext = G.Ext.get(ext);
    if (!Ext) { return false; }
    if (!Ext.state) { return "break"; }
    if (Ext.size != 0 && size != undefined && !operatorCheck(size, Ext)) {
        return "break";
    }
    return true;
}

/**
 * 检查类型和大小
 * @param {String} dataType 
 * @param {Number} dataSize 
 * @returns {Boolean|String}
 */
function CheckType(dataType, dataSize) {
    const typeInfo = G.Type.get(dataType.split("/")[0] + "/*") || G.Type.get(dataType);
    if (!typeInfo) { return false; }
    if (!typeInfo.state) { return "break"; }
    if (typeInfo.size != 0 && dataSize != undefined && !operatorCheck(dataSize, typeInfo)) {
        return "break";
    }
    return true;
}

/**
 * 获取文件名及扩展名
 * @param {String} pathname 
 * @returns {Array}
 */
function fileNameParse(pathname) {
    let fileName = decodeURI(pathname.split("/").pop());
    let ext = fileName.split(".");
    ext = ext.length == 1 ? undefined : ext.pop().toLowerCase();
    return [fileName, ext ? ext : undefined];
}

/**
 * 获取响应头信息
 * @param {Object} data 
 * @returns {Object}
 */
function getResponseHeadersValue(data) {
    const header = {};
    if (data.responseHeaders == undefined || data.responseHeaders.length == 0) { return header; }
    for (let item of data.responseHeaders) {
        item.name = item.name.toLowerCase();
        if (item.name == "content-length") {
            header.size ??= parseInt(item.value);
        } else if (item.name == "content-type") {
            header.type = item.value.split(";")[0].toLowerCase();
        } else if (item.name == "content-disposition") {
            header.attachment = item.value;
        } else if (item.name == "content-range") {
            let size = item.value.split('/')[1];
            if (size !== '*') {
                header.size = parseInt(size);
            }
        }
    }
    return header;
}

/**
 * 获取请求头
 * @param {Object} data 
 * @returns {Object|Boolean}
 */
const DIRECT_INCLUDE_HEADERS = new Set([
    "referer",
    "origin",
    "cookie",
    "authorization",
    "auth",
    "token",
    "key",
    "access-token",
    "api-key",
    "app-token",
    "authtoken",
    "session-id"
]);
const X_AUTH_KEYWORD_REG = /(auth|token|sign|key|ticket|session)/;
function getRequestHeaders(data) {
    if (!data?.allRequestHeaders?.length) {
        return false;
    }
    const header = {};
    for (let item of data.allRequestHeaders) {
        if (!item.name || !item.value) continue;
        const lowerName = item.name.toLowerCase();
        if (DIRECT_INCLUDE_HEADERS.has(lowerName)) {
            header[lowerName] = item.value;
            continue;
        }
        if (lowerName.startsWith("x-") && X_AUTH_KEYWORD_REG.test(lowerName)) {
            header[lowerName] = item.value;
        }
    }
    return Object.keys(header).length > 0 ? header : false;
}
//设置扩展图标
function SetIcon(obj) {
    if (obj?.number == 0 || obj?.number == undefined) {
        chrome.action.setBadgeText({ text: "", tabId: obj?.tabId ?? G.tabId }, function () { if (chrome.runtime.lastError) { return; } });
        // chrome.action.setTitle({ title: "还没闻到味儿~", tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
    } else if (G.badgeNumber) {
        obj.number = obj.number > 999 ? "999+" : obj.number.toString();
        chrome.action.setBadgeText({ text: obj.number, tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
        // chrome.action.setTitle({ title: "抓到 " + obj.number + " 条鱼", tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
    }
}

// 模拟手机端
function mobileUserAgent(tabId, change = false) {
    if (change) {
        G.featMobileTabId.add(tabId);
        (chrome.storage.session ?? chrome.storage.local).set({ featMobileTabId: Array.from(G.featMobileTabId) });
        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [tabId],
            addRules: [{
                "id": tabId,
                "action": {
                    "type": "modifyHeaders",
                    "requestHeaders": [{
                        "header": "User-Agent",
                        "operation": "set",
                        "value": G.MobileUserAgent
                    }]
                },
                "condition": {
                    "tabIds": [tabId],
                    "resourceTypes": Object.values(chrome.declarativeNetRequest.ResourceType)
                }
            }]
        });
        return true;
    }
    G.featMobileTabId.delete(tabId) && (chrome.storage.session ?? chrome.storage.local).set({ featMobileTabId: Array.from(G.featMobileTabId) });
    chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [tabId]
    });
}

// 判断特殊页面
function isSpecialPage(url) {
    if (!url || url == "null") { return true; }
    return !(url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:"));
}

/**
 * 清理冗余数据
 */
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

        // 清理
        G.urlMap.forEach((_, key) => {
            !allTabId.has(key) && G.urlMap.delete(key);
        });

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

        G.blockUrlSet = new Set([...G.blockUrlSet].filter(x => allTabId.has(x)));
        G.damnUrlSet = new Set([...G.damnUrlSet].filter(x => allTabId.has(x)));

        if (G.requestHeaders.size >= 10240) {
            G.requestHeaders.clear();
        }
    });
}

/**
 * 以下为 视频浮窗 (js/video-float.js) 的后台部分
 * 视频浮窗显示在页面的 video 旁边 列出和该 video 同一个 frame 嗅探到的资源
 * 浮窗里的操作和 popup 资源列表的操作保持一致
 */
const VIDEO_FLOAT_MAX = 200;    // 单个frame最多交给浮窗的资源数量 只保留最新的
// 浮窗使用的图标 页面里的 content-script 读取不到扩展文件 由后台转成 data URL 交给浮窗
const VIDEO_FLOAT_ICONS = [
    // 资源列表
    "icon.png", "copy.png", "parsing.png", "play.png", "download.svg", "aria2.png", "invoke.svg", "send.svg", "cat-down.png", "send2ffmpeg.svg", "regex.png",
    "copy-dark.png", "parsing-dark.png", "play-dark.png", "download-dark.svg", "aria2-dark.png", "invoke-dark.svg", "send-dark.svg", "cat-down-dark.png", "send2ffmpeg-dark.svg", "regex-dark.png",
    // 媒体控制
    "pause.svg", "volume.svg", "mute.svg", "loop.svg", "speed.svg", "screenshot.svg", "pip.svg", "fullscreen.svg",
    "pause-dark.svg", "volume-dark.svg", "mute-dark.svg", "loop-dark.svg", "speed-dark.svg", "screenshot-dark.svg", "pip-dark.svg", "fullscreen-dark.svg"
];
let videoFloatIcons = undefined;

/**
 * 通知标签内的浮窗 资源列表有变化
 * @param {Number} tabId 标签ID
 */
function videoFloatNotify(tabId) {
    if (!G.videoFloat || !tabId || tabId <= 0) { return; }
    chrome.tabs.sendMessage(tabId, { Message: "videoFloatUpdate" }, function () {
        if (chrome.runtime.lastError) { return; }
    });
}

/**
 * 判断资源是否需要解析器
 * @param {Object} data 资源对象
 * @returns {String|Boolean}
 */
function videoFloatParsing(data) {
    if (isM3U8(data)) { return "m3u8"; }
    if (isMPD(data)) { return "mpd"; }
    if (isJSON(data)) { return "json"; }
    return false;
}

/**
 * 字符串转 Base64 (UTF-8) 和 lib/base64.js 的 Base64.encode 相同
 * lib/base64.js 依赖 window 无法在 service worker 中加载
 * @param {String} str 字符串
 * @returns {String}
 */
function videoFloatBase64(str) {
    let binary = "";
    new TextEncoder().encode(str).forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
}

/**
 * 读取 img 目录的图标文件 转成 data URL
 * @returns {Promise<Object>} { 图标名: data URL }
 */
function videoFloatGetIcons() {
    videoFloatIcons ??= Promise.all(VIDEO_FLOAT_ICONS.map(async function (file) {
        const response = await fetch(chrome.runtime.getURL("img/" + file));
        let binary = "";
        new Uint8Array(await response.arrayBuffer()).forEach(byte => binary += String.fromCharCode(byte));
        const mime = file.endsWith(".svg") ? "image/svg+xml" : "image/png";
        return [file.split(".")[0], `data:${mime};base64,${btoa(binary)}`];
    })).then(Object.fromEntries).catch(function (error) {
        console.log(error);
        videoFloatIcons = undefined;
        return {};
    });
    return videoFloatIcons;
}

/**
 * 获取发送者所在frame的资源列表 以及和浮窗有关的设置
 * 只返回浮窗显示需要的字段 请求头 cookie 等数据不交给页面
 * @param {Object} sender 消息发送者
 * @returns {Object}
 */
function videoFloatGetData(sender) {
    // 浮窗开关由 content-script 自己读取设置判断 这里只看扩展总开关
    const result = { enable: !!G.enable, total: 0, data: [] };
    // 决定浮窗显示哪些操作图标 和 popup 一致
    result.options = {
        aria2: !!G.enableAria2Rpc,
        invoke: !!G.invoke,
        send: !!(G.send2localManual || G.send2local),
        player: !isEmpty(G.Player),
        mergeLimit: G.isFirefox ? 0 : G.chromeLimitSize
    };
    // 媒体控制的倍速 和 popup 共用
    result.playbackRate = G.playbackRate;
    const tabId = sender.tab?.id;
    if (!result.enable || !tabId || !Array.isArray(cacheData[tabId])) { return result; }
    const frameId = sender.frameId ?? 0;
    // 没有frame信息的资源 归属主框架
    const list = cacheData[tabId].filter(item => item.frameId === frameId || (frameId === 0 && !(item.frameId > 0)));
    result.total = list.length;
    result.data = list.slice(-VIDEO_FLOAT_MAX).map(function (item) {
        let name = item.name;
        if (isEmpty(name)) {
            name = (item.title ?? "NULL") + "." + item.ext;
        } else {
            try { name = decodeURIComponent(name); } catch (e) { }
        }
        return {
            requestId: item.requestId,
            url: item.url,
            name: name,
            ext: item.ext,
            type: item.type,
            size: item.size,
            title: item.title,
            isRegex: !!item.isRegex,
            getTime: item.getTime,
            parsing: videoFloatParsing(item),
            merge: videoFloatMergeable(item),
            isPlay: videoFloatIsPlay(item),
            picture: isPicture(item)
        };
    });
    return result;
}

/**
 * 是否可以预览 和 popup 的 isPlay 一致
 * @param {Object} data 资源对象
 * @returns {Boolean}
 */
function videoFloatIsPlay(data) {
    if (G.Player && !isJSON(data) && !isPicture(data)) { return true; }
    const typeArray = ['video/ogg', 'video/mp4', 'video/webm', 'audio/ogg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'video/3gp', 'video/mpeg', 'video/mov'];
    return isMediaExt(data.ext) || typeArray.includes(data.type) || isM3U8(data);
}

/**
 * 是否可以在线合并 和 popup 的 mergeDownButtonCheck 一致
 * @param {Object} data 资源对象
 * @returns {Boolean}
 */
function videoFloatMergeable(data) {
    if (!data.type) {
        return isMediaExt(data.ext);
    }
    return isMediaExt(data.ext) || data.type.startsWith("video") || data.type.startsWith("audio") || data.type.endsWith("octet-stream");
}

/**
 * 资源对象补全 文件名 解析类型 等数据 和 popup 的 AddMedia 保持一致
 * @param {Object} info 缓存中的资源对象
 * @returns {Object}
 */
function videoFloatData(info) {
    const data = { ...info };
    data._title = data.title;
    data.title = stringModify(data.title);
    if (isEmpty(data.name)) {
        data.name = data.title + '.' + data.ext;
    } else {
        try { data.name = decodeURIComponent(stringModify(data.name)); } catch (e) { data.name = stringModify(data.name); }
    }
    data._size = data.size;
    data.parsing = videoFloatParsing(data);
    Object.defineProperty(data, "downFileName", {
        get() {
            let downFileName = G.TitleName ? templates(G.downFileName, data) : data.name;
            downFileName = filterFileName(downFileName);
            if (isEmpty(downFileName)) {
                downFileName = data.name;
            }
            return downFileName;
        },
        configurable: true
    });
    return data;
}

/**
 * 打开猫抓下载器 携带请求头下载
 * @param {Object|Array} list 资源对象
 * @param {Object} extra 下载器的额外参数 例如 { ffmpeg: "merge" }
 */
function videoFloatCatDownload(list, extra = {}) {
    if (!Array.isArray(list)) { list = [list]; }
    const params = { ...extra };
    if (list.length == 1) {
        // 单个资源直接传递数据 带上下载文件名
        const data = list[0];
        params.JSON = JSON.stringify({
            url: data.url,
            requestId: data.requestId,
            requestHeaders: data.requestHeaders,
            cookie: data.cookie,
            title: data.title,
            downFileName: data.downFileName
        });
    } else {
        // 多个资源 下载器通过 requestId 向后台获取数据
        params.requestId = list.map(data => data.requestId).join(",");
    }
    const arg = {
        url: `/downloader.html?${new URLSearchParams(params)}`,
        active: !G.downActive
    };
    chrome.tabs.get(list[0].tabId, function (tab) {
        if (!chrome.runtime.lastError && tab) { arg.index = tab.index + 1; }
        chrome.tabs.create(arg);
    });
}

/**
 * 调用协议 m3u8dl / 调用程序 / 本地播放器
 * @param {String} url 协议地址
 * @param {Number} tabId 浮窗所在的标签
 * @returns {Object} 回复给浮窗的结果
 */
function videoFloatProtocol(url, tabId) {
    // firefox 交给页面跳转协议
    if (G.isFirefox) {
        return { ok: true, open: url, message: i18n.hasSent };
    }
    chrome.tabs.update(tabId, { url: url });
    return { ok: true, message: i18n.hasSent };
}

/**
 * 下载资源 和 popup 的下载按钮保持一致
 * m3u8dl 协议 / m3u8 自动下载 / 浏览器下载 (服务器拒绝时调用猫抓下载器)
 * @param {Object} data 资源对象
 * @param {Number} tabId 浮窗所在的标签
 * @param {Boolean} batch 是否批量下载
 * @returns {Object} 回复给浮窗的结果
 */
function videoFloatDownload(data, tabId, batch = false) {
    if (G.m3u8dl && (data.parsing == "m3u8" || data.parsing == "mpd") && !data.url.startsWith("blob:")) {
        const m3u8dlArg = templates(G.m3u8dlArg, data);
        const url = 'm3u8dl:' + (G.m3u8dl == 1 ? videoFloatBase64(m3u8dlArg) : m3u8dlArg);
        if (batch) {
            chrome.tabs.create({ url: url });
            return { ok: true, message: i18n.hasSent };
        }
        if (url.length >= 2046) {
            return { ok: false, copy: m3u8dlArg, message: i18n.M3U8DLparameterLong };
        }
        return videoFloatProtocol(url, tabId);
    }
    if (G.m3u8AutoDown && data.parsing == "m3u8") {
        openParser(data, batch ? { autoDown: true, autoClose: true } : { autoDown: true });
        return { ok: true, message: i18n.hasSent };
    }
    const options = { url: data.url, filename: data.downFileName };
    if (!batch) { options.saveAs = G.saveAs; }
    chrome.downloads.download(options, function (id) {
        if (chrome.runtime.lastError || id === undefined) {
            !G.catDownload && videoFloatCatDownload(data);
            return;
        }
        !G.catDownload && G.videoFloatDown.set(id, data);
    });
    return { ok: true, message: i18n.videoFloatDownloadStarted };
}

/**
 * 浮窗的操作 和 popup 资源列表的操作保持一致
 * @param {Object} Message 消息 action: 操作名 items: [{ requestId, url }]
 * @param {Object} sender 消息发送者
 * @param {Function} sendResponse 回复函数
 */
function videoFloatAction(Message, sender, sendResponse) {
    const tabId = sender.tab?.id;
    const cache = tabId && Array.isArray(cacheData[tabId]) ? cacheData[tabId] : [];
    const list = [];
    for (const item of Array.isArray(Message.items) ? Message.items : []) {
        const info = cache.find(data => data.requestId == item.requestId && data.url == item.url);
        info && list.push(videoFloatData(info));
    }
    if (!list.length) {
        sendResponse({ ok: false, message: i18n.dataFetchFailed });
        return;
    }
    // 浮窗被点击 所在标签就是当前标签 openParser 依赖 G.tabId
    G.tabId = tabId;
    const data = list[0];

    switch (Message.action) {
        // 复制
        case "copy":
            sendResponse({ ok: true, copy: list.map(item => copyLink(item)).join("\n"), message: i18n.copiedToClipboard });
            return;
        // 解析
        case "parse":
            if (!data.parsing) { break; }
            openParser(data);
            sendResponse({ ok: true });
            return;
        // 播放 调用本地播放器
        case "play":
            if (isEmpty(G.Player)) { break; }
            if (G.Player == "$shareApi$" || G.Player == "${shareApi}") {
                sendResponse({ ok: true, share: data.url });
                return;
            }
            sendResponse(videoFloatProtocol(templates(G.Player, data), tabId));
            return;
        // 下载
        case "download":
            sendResponse(videoFloatDownload(data, tabId));
            return;
        // 下载选中的资源
        case "downloadAll":
            if (G.enableAria2Rpc) {
                list.forEach(item => aria2AddUri(item));
                sendResponse({ ok: true, message: i18n.hasSent });
                return;
            }
            list.forEach(function (item, index) {
                setTimeout(function () { videoFloatDownload(item, tabId, true); }, index * 100);
            });
            sendResponse({ ok: true, message: i18n.videoFloatDownloadStarted });
            return;
        // 在线合并
        case "merge":
            if (list.length != 2) { break; }
            if (list.every(item => item.parsing == "m3u8")) {
                const taskId = Date.parse(new Date());
                list.forEach(function (item, index) {
                    openParser(item, { ffmpeg: "merge", quantity: list.length, taskId: taskId, autoDown: true, autoClose: true, isMaster: index === 0 });
                });
            } else {
                videoFloatCatDownload(list, { ffmpeg: "merge" });
            }
            sendResponse({ ok: true, message: i18n.hasSent });
            return;
        // 发送到 Aria2
        case "aria2":
            aria2AddUri(data, function (result) {
                sendResponse({ ok: true, message: i18n.hasSent + JSON.stringify(result) });
            }, function (error) {
                sendResponse({ ok: false, message: i18n.sendFailed });
            });
            return;
        // 调用程序
        case "invoke":
            sendResponse(videoFloatProtocol(templates(G.invokeText, data), tabId));
            return;
        // 数据发送
        case "send2local":
            try {
                send2local("catch", data, data.tabId).then(function (response) {
                    sendResponse(response && response.ok ? { ok: true, message: i18n.hasSent } : { ok: false, message: i18n.sendFailed });
                }).catch(function (error) {
                    sendResponse({ ok: false, message: i18n.sendFailed });
                });
            } catch (e) {
                sendResponse({ ok: false, message: i18n.sendFailed });
            }
            return;
        // 猫抓下载器 携带请求头参数下载
        case "catDown":
            videoFloatCatDownload(data);
            sendResponse({ ok: true, message: i18n.hasSent });
            return;
        // 发送到在线ffmpeg
        case "ffmpeg":
            videoFloatCatDownload(data, { ffmpeg: "addFile" });
            sendResponse({ ok: true, message: i18n.hasSent });
            return;
    }
    sendResponse({ ok: false });
}

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
    if (details.reason == "install") {
        chrome.tabs.create({ url: "install.html" });
    }
});

// 测试
// chrome.storage.local.get(function (data) { console.log("storageLocal", data.MediaData) });
// chrome.storage.session.get(function (data) { console.log("storageSession", data.MediaData) });
// chrome.declarativeNetRequest.getSessionRules(function (rules) { console.log("sessionRules", rules); });
// chrome.tabs.query({}, function (tabs) { for (let item of tabs) { console.log("tabId", item.id); } });