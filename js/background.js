importScripts("/js/init.js");

// Service Worker 5分钟后会强制终止扩展
// https://bugs.chromium.org/p/chromium/issues/detail?id=1271154
// https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/70003493#70003493
chrome.webNavigation.onBeforeNavigate.addListener(function () { return; });
chrome.webNavigation.onHistoryStateUpdated.addListener(function () { return; });
chrome.runtime.onConnect.addListener(function (Port) {
    if (Port.name !== "HeartBeat") return;
    Port.postMessage("HeartBeat");
    Port.onMessage.addListener(function (message, Port) { return; });
    const interval = setInterval(function () {
        clearInterval(interval);
        Port.disconnect();
    }, 250000);
    Port.onDisconnect.addListener(function () {
        if (interval) { clearInterval(interval); }
    });
});

chrome.alarms.create("nowClear", { when: Date.now() + 3000 });  // 3秒后清理立即清理一次
chrome.alarms.create("clear", { periodInMinutes: 60 }); // 60分钟清理一次冗余数据
chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === "nowClear" || alarm.name === "clear") {
        clearRedundant();
        return;
    }
});

// onBeforeRequest 浏览器发送请求之前使用正则匹配发送请求的URL
chrome.webRequest.onBeforeRequest.addListener(
    function (data) {
        try { findMedia(data, true); } catch (e) { console.log(e); }
    }, { urls: ["<all_urls>"] }, ["requestBody"]
);
// 保存Referer
chrome.webRequest.onSendHeaders.addListener(
    function (data) {
        const referer = getReferer(data);
        referer && G.referer.set(data.requestId, referer);
    }, { urls: ["<all_urls>"] }, ['requestHeaders',
        chrome.webRequest.OnBeforeSendHeadersOptions.EXTRA_HEADERS].filter(Boolean)
);
// onResponseStarted 浏览器接收到第一个字节触发，保证有更多信息判断资源类型
chrome.webRequest.onResponseStarted.addListener(
    function (data) {
        try {
            const referer = G.referer.get(data.requestId);
            if (referer) {
                data.referer = referer;
                G.referer.delete(data.requestId);
            }
            findMedia(data);
        } catch (e) { console.log(e, data); }
    }, { urls: ["<all_urls>"] }, ["responseHeaders"]
);
// 删除失败的refererData
chrome.webRequest.onErrorOccurred.addListener(
    function (data) {
        G.referer.delete(data.requestId);
        G.blackList.delete(data.requestId);
    }, { urls: ["<all_urls>"] }
);

function findMedia(data, isRegex = false, filter = false, timer = false) {
    if (timer) { return; }
    // Service Worker被强行杀死之后重新自我唤醒，等待全局变量初始化完成。
    if (!G || !G.initSyncComplete || !G.initLocalComplete || G.tabId == undefined || cacheData.init) {
        setTimeout(() => {
            findMedia(data, isRegex, filter, true);
        }, 233);
        return;
    }
    if (!G.enable) { return; }
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
            const result = G.Regex[key].regex.exec(data.url);
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
            for (let i = 1; i < result.length; i++) {
                data.url = decodeURIComponent(result[i]);
                if (!reProtocol.test(data.url)) {
                    data.url = urlParsing.protocol + "//" + data.url;
                }
                findMedia(data, true, true);
            }
            return;
        }
        return;
    }

    let header = {};
    if (!isRegex) {
        header = getResponseHeadersValue(data);
        // 通过视频范围计算完整视频大小
        if (header["range"]) {
            const size = header["range"].match(reRange);
            if (size) {
                header["size"] = parseInt(header["size"] * (size[3] / (size[2] - size[1])));
            }
        }
    }

    //检查后缀
    if (!isRegex && !filter && ext != undefined) {
        filter = CheckExtension(ext, header["size"]);
        if (filter == "break") { return; }
    }

    //检查类型
    if (!isRegex && !filter && header["type"] != undefined) {
        filter = CheckType(header["type"], header["size"]);
        if (filter == "break") { return; }
    }

    //查找附件
    if (!isRegex && !filter && header["attachment"] != undefined) {
        const res = header["attachment"].match(reFilename);
        if (res && res[1]) {
            [name, ext] = fileNameParse(decodeURIComponent(res[1]));
            filter = CheckExtension(ext, 0);
            if (filter == "break") { return; }
        }
    }

    //放过类型为media的资源
    if (!isRegex && data.type == "media") {
        filter = true;
    }

    if (!filter) { return; }

    data.tabId = data.tabId == -1 ? G.tabId : data.tabId;

    cacheData[data.tabId] ??= [];
    cacheData[G.tabId] ??= [];

    // 查重 避免CPU占用 大于500 强制关闭查重
    if (G.checkDuplicates && cacheData[data.tabId].length <= 500) {
        for (let item of cacheData[data.tabId]) {
            if (item.url.length == data.url.length &&
                item.cacheURL.pathname == urlParsing.pathname &&
                item.cacheURL.host == urlParsing.host &&
                item.cacheURL.search == urlParsing.search) { return; }
        }
    }
    chrome.tabs.get(data.tabId, async function (webInfo) {
        if (chrome.runtime.lastError) { return; }
        const info = {
            name: name,
            url: data.url,
            size: header["size"],
            ext: ext,
            type: data.mime ?? header["type"],
            tabId: data.tabId,
            isRegex: isRegex,
            requestId: data.requestId ?? Date.now().toString(),
            extraExt: data.extraExt,
            initiator: data.initiator,
            referer: data.referer,
            cacheURL: { host: urlParsing.host, search: urlParsing.search, pathname: urlParsing.pathname }
        };
        // 不存在 initiator 和 referer 使用web url代替initiator
        if (info.initiator == undefined || info.initiator == "null") {
            info.initiator = info.referer ?? webInfo?.url;
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
        chrome.runtime.sendMessage(info, function () {
            if (G.featAutoDownTabId.size > 0 && G.featAutoDownTabId.has(info.tabId)) {
                const downDir = info.title == "NULL" ? "CatCatch/" : stringModify(info.title) + "/";
                chrome.downloads.download({
                    url: info.url,
                    filename: downDir + info.name
                });
            }
            if (chrome.runtime.lastError) { return; }
        });
        // 储存数据
        cacheData[info.tabId] ??= [];
        cacheData[info.tabId].push(info);

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
    chrome.storage.local.set({ MediaData: cacheData }, function () {
        chrome.runtime.lastError && console.log(chrome.runtime.lastError);
    });
    cacheData[tabId] && SetIcon({ number: cacheData[tabId].length, tabId: tabId });
}

// 监听来自popup 和 options的请求
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (!G.initLocalComplete) {
        sendResponse("error");
        return true;
    }
    if (Message.Message == "pushData") {
        chrome.storage.local.set({ MediaData: cacheData });
        sendResponse("ok");
        return true;
    }
    if (Message.Message == "getAllData") {
        sendResponse(cacheData);
        return true;
    }
    // 图标设置
    if (Message.Message == "ClearIcon") {
        if (Message.type) {
            G.tabId && SetIcon({ tabId: G.tabId });
        } else {
            SetIcon({ tips: false });
        }
        sendResponse("ok");
        return true;
    }
    Message.tabId = Message.tabId ?? G.tabId;
    if (Message.Message == "getData") {
        sendResponse(cacheData[Message.tabId]);
        return true;
    }
    if (Message.Message == "getButtonState") {
        let state = {
            MobileUserAgent: G.featMobileTabId.has(Message.tabId),
            AutoDown: G.featAutoDownTabId.has(Message.tabId)
        }
        G.scriptList.forEach(function (item, key) {
            state[item.key] = item.tabId.has(Message.tabId);
        });
        sendResponse(state);
        return true;
    }
    // 模拟手机
    if (Message.Message == "mobileUserAgent") {
        mobileUserAgent(Message.tabId, !G.featMobileTabId.has(Message.tabId));
        chrome.tabs.reload(Message.tabId, { bypassCache: true });
        sendResponse("ok");
        return true;
    }
    // 自动下载
    if (Message.Message == "autoDown") {
        if (G.featAutoDownTabId.has(Message.tabId)) {
            G.featAutoDownTabId.delete(Message.tabId);
        } else {
            G.featAutoDownTabId.add(Message.tabId);
        }
        chrome.storage.local.set({ featAutoDownTabId: Array.from(G.featAutoDownTabId) });
        sendResponse("ok");
        return true;
    }
    // 脚本
    if (Message.Message == "script") {
        if (!G.scriptList.has(Message.script)) {
            sendResponse("error no exists");
            return false;
        }
        const script = G.scriptList.get(Message.script);
        const scriptTabid = script.tabId;
        const refresh = Message.refresh ?? script.refresh;
        if (scriptTabid.has(Message.tabId)) {
            scriptTabid.delete(Message.tabId);
            refresh && chrome.tabs.reload(Message.tabId, { bypassCache: true });
            sendResponse("ok");
            return true;
        }
        scriptTabid.add(Message.tabId);
        if (refresh) {
            chrome.tabs.reload(Message.tabId, { bypassCache: true });
        } else {
            chrome.scripting.executeScript({
                target: { tabId: Message.tabId, allFrames: script.allFrames },
                files: ["catch-script/" + Message.script],
                injectImmediately: true,
                world: script.world
            });
        }
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
            chrome.storage.local.set({ MediaData: cacheData });
            clearRedundant();
            sendResponse("OK");
            return true;
        }
        // 其他标签
        for (let item in cacheData) {
            if (item == Message.tabId) { continue; }
            delete cacheData[item];
        }
        chrome.storage.local.set({ MediaData: cacheData });
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
                    findMedia({ url: Message.url, tabId: item.id, extraExt: Message.extraExt, mime: Message.mime, requestId: Message.requestId }, true, true);
                    return true;
                }
            }
            findMedia({ url: Message.url, tabId: -1, extraExt: Message.extraExt, mime: Message.mime, requestId: Message.requestId, initiator: Message.href }, true, true);
        });
        sendResponse("ok");
        return true;
    }
    // ffmpeg在线转码
    if (Message.Message == "catCatchFFmpeg") {
        const data = { Message: "ffmpeg", action: Message.action, media: Message.media, title: Message.title, url: Message.url, extra: Message.extra, tabId: Message.tabId };
        chrome.tabs.query({ url: ffmpeg.url }, function (tabs) {
            if (chrome.runtime.lastError || !tabs.length) {
                chrome.tabs.create({ url: ffmpeg.url }, function (tab) {
                    ffmpeg.tab = tab.id;
                    ffmpeg.data = data;
                });
                return true;
            }
            chrome.tabs.sendMessage(tabs[0].id, data);
        });
        sendResponse("ok");
        return true;
    }
    sendResponse("Error");
    return true;
});

// 选定标签 更新G.tabId
chrome.tabs.onHighlighted.addListener(function (activeInfo) {
    if (!activeInfo.tabId || activeInfo.tabId == -1) { return; }
    G.tabId = activeInfo.tabId;
});

// 切换标签，更新全局变量G.tabId 更新图标
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
    if (!activeInfo.tabId || activeInfo.tabId == -1) { return; }
    G.tabId = activeInfo.tabId;
}, { filters: ["normal"] });

// chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
//     console.log(tabId, changeInfo, tab);
// });

// 载入frame时
chrome.webNavigation.onCommitted.addListener(function (details) {
    // console.log(details)
    if (isSpecialPage(details.url) || details.tabId == 0 || details.tabId == -1 || !G.initSyncComplete) { return; }
    // 刷新清理角标数
    // if (details.frameId == 0 && G.refreshClear && cacheData[details.tabId] && details.transitionType == "reload") {
    if (details.frameId == 0 && G.refreshClear && cacheData[details.tabId] && (details.transitionType == "reload" || details.transitionType == "link")) {
        delete cacheData[details.tabId];
        chrome.storage.local.set({ MediaData: cacheData });
        SetIcon({ tabId: details.tabId });
    }

    // chrome内核版本 102 以下不支持 chrome.scripting.executeScript API
    if (G.version < 102) { return; }

    // catch-script 脚本
    G.scriptList.forEach(function (item, script) {
        if (!item.tabId.has(details.tabId) || !item.allFrames) { return true; }
        chrome.scripting.executeScript({
            target: { tabId: details.tabId, frameIds: [details.frameId] },
            files: [`catch-script/${script}`],
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

// 标签关闭 清除数据
chrome.tabs.onRemoved.addListener(function (tabId) {
    // 清理缓存数据
    chrome.alarms.get("nowClear", function (alarm) {
        !alarm && chrome.alarms.create("nowClear", { when: Date.now() + 1000 });
    });
});

// 快捷键
chrome.commands.onCommand.addListener(function (command) {
    if (command == "auto_down") {
        if (G.featAutoDownTabId.has(G.tabId)) {
            G.featAutoDownTabId.delete(G.tabId);
        } else {
            G.featAutoDownTabId.add(G.tabId);
        }
        chrome.storage.local.set({ featAutoDownTabId: Array.from(G.featAutoDownTabId) });
    } else if (command == "catch") {
        const scriptTabid = G.scriptList.get("catch.js").tabId;
        scriptTabid.has(G.tabId) ? scriptTabid.delete(G.tabId) : scriptTabid.add(G.tabId);
        chrome.tabs.reload(G.tabId, { bypassCache: true });
    } else if (command == "m3u8") {
        chrome.tabs.create({ url: "m3u8.html" });
    } else if (command == "clear") {
        delete cacheData[G.tabId];
        chrome.storage.local.set({ MediaData: cacheData });
        clearRedundant();
        SetIcon({ tabId: G.tabId });
    } else if (command == "enable") {
        chrome.storage.sync.set({ enable: !G.enable });
        chrome.action.setIcon({ path: G.enable ? "/img/icon.png" : "/img/icon-disable.png" });
    }
});

chrome.webNavigation.onCompleted.addListener(function (details) {
    if (ffmpeg.tab && details.tabId == ffmpeg.tab) {
        setTimeout(() => {
            chrome.tabs.sendMessage(details.tabId, ffmpeg.data);
            ffmpeg.data = undefined;
            ffmpeg.tab = 0;
        }, 500);
    }
});

//检查扩展名以及大小限制
function CheckExtension(ext, size) {
    const Ext = G.Ext.get(ext);
    if (!Ext) { return false; }
    if (!Ext.state) { return "break"; }
    if (Ext.size != 0 && size != undefined && size <= Ext.size * 1024) { return "break"; }
    return true;
}
//检查类型以及大小限制
function CheckType(dataType, dataSize) {
    const typeInfo = G.Type.get(dataType.split("/")[0] + "/*") || G.Type.get(dataType);
    if (!typeInfo) { return false; }
    if (!typeInfo.state) { return "break"; }
    if (typeInfo.size != 0 && dataSize != undefined && dataSize <= typeInfo.size * 1024) { return "break"; }
    return true;
}

// 获取文件名 后缀
function fileNameParse(pathname) {
    let fileName = decodeURI(pathname.split("/").pop());
    let ext = fileName.split(".");
    ext = ext.length == 1 ? undefined : ext.pop().toLowerCase();
    return [fileName, ext ? ext : undefined];
}
//获取Header属性的值
function getResponseHeadersValue(data) {
    const header = new Array();
    if (data.responseHeaders == undefined || data.responseHeaders.length == 0) { return header; }
    for (let item of data.responseHeaders) {
        switch (item.name.toLowerCase()) {
            case "content-length": header["size"] = item.value; break;
            case "content-type": header["type"] = item.value.split(";")[0].toLowerCase(); break;
            case "content-disposition": header["attachment"] = item.value; break;
            case "content-range": header["range"] = item.value; break;
        }
    }
    return header;
}
function getReferer(data) {
    if (data.requestHeaders == undefined || data.requestHeaders.length == 0) { return false; }
    for (let item of data.requestHeaders) {
        if (item.name.toLowerCase() == "referer") {
            return item.value.toLowerCase();
        }
    }
    return false;
}
//设置扩展图标
function SetIcon(obj) {
    if (obj.tips != undefined) {
        obj.tips = obj.tips ? "/img/icon-tips.png" : "/img/icon.png";
        chrome.action.setIcon({ path: obj.tips });
    } else if (obj.number == 0 || obj.number == undefined) {
        chrome.action.setBadgeText({ text: "", tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
        chrome.action.setTitle({ title: "还没闻到味儿~", tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
    } else {
        obj.number = obj.number > 99 ? "99+" : obj.number.toString();
        chrome.action.setBadgeText({ text: obj.number, tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
        chrome.action.setTitle({ title: "抓到 " + obj.number + " 条鱼", tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
    }
}

// 模拟手机端
function mobileUserAgent(tabId, change = false) {
    if (change) {
        G.featMobileTabId.add(tabId);
        chrome.storage.local.set({ featMobileTabId: Array.from(G.featMobileTabId) });
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
                    "resourceTypes": ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport", "webbundle", "other"]
                }
            }]
        });
        return true;
    }
    G.featMobileTabId.delete(tabId) && chrome.storage.local.set({ featMobileTabId: Array.from(G.featMobileTabId) });
    chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [tabId]
    });
}

// 判断特殊页面
function isSpecialPage(url) {
    if (!url || url == "null") { return true; }
    return !(url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:"));
}

// 测试
// chrome.storage.local.get(function (data) { console.log(data.MediaData) });
// chrome.declarativeNetRequest.getSessionRules(function (rules) { console.log(rules); });
// chrome.tabs.query({}, function (tabs) { for (let item of tabs) { console.log(item.id); } });