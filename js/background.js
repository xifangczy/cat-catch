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
    let interval = setInterval(function () {
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
    alarm.name == "clear" && clearRedundant();
    alarm.name == "nowClear" && clearRedundant();
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
        let referer = getReferer(data);
        if (referer) {
            refererData["requestId" + data.requestId] = referer;
        }
    }, { urls: ["<all_urls>"] }, ['requestHeaders',
        chrome.webRequest.OnBeforeSendHeadersOptions.EXTRA_HEADERS].filter(Boolean)
);
// onResponseStarted 浏览器接收到第一个字节触发，保证有更多信息判断资源类型
chrome.webRequest.onResponseStarted.addListener(
    function (data) {
        try {
            if (refererData["requestId" + data.requestId]) {
                data.referer = refererData["requestId" + data.requestId];
                delete refererData["requestId" + data.requestId];
            }
            findMedia(data);
        } catch (e) { console.log(e, data); }
    }, { urls: ["<all_urls>"] }, ["responseHeaders"]
);
// 删除失败的refererData
chrome.webRequest.onErrorOccurred.addListener(
    function (data) {
        delete refererData["requestId" + data.requestId];
    }, { urls: ["<all_urls>"] }
);

function findMedia(data, isRegex = false, filter = false) {
    // Service Worker被强行杀死之后重新自我唤醒，等待全局变量初始化完成。
    if (!G || G.Ext === undefined ||
        G.Debug === undefined ||
        G.OtherAutoClear === undefined ||
        G.Type === undefined ||
        G.Regex === undefined ||
        G.featAutoDownTabId === undefined ||
        G.tabId === undefined ||
        cacheData.init
    ) {
        setTimeout(() => {
            findMedia(data, isRegex, filter);
        }, 100);
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
    // 屏蔽Youtube
    if (urlParsing.host.includes("googlevideo.com")) {
        // Chrome商店版本 跳过youtube
        if (chrome.runtime.id == "jfedfbgedapdagkghmgibemcoggfppbb" && !G.youtube) { return; }
        // 完整视频/音频 &range=[^&]*
        // 去掉不必要的参数 防止重复
        data.url = data.url.replace(reYoutube, "");
    }
    // 调试模式
    if (G.Debug) {
        console.log({ data, G, isRegex });
    }

    const header = getResponseHeadersValue(data);
    let [name, ext] = fileNameParse(urlParsing.pathname);

    //正则匹配
    if (isRegex && !filter) {
        for (let key in G.Regex) {
            if (!G.Regex[key].state) { continue; }
            const result = new RegExp(G.Regex[key].regex, G.Regex[key].type).exec(data.url);
            if (result == null) { continue; }
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

    // 通过视频范围计算完整视频大小
    if (header["range"]) {
        const size = header["range"].match(reRange);
        if (size) {
            header["size"] = parseInt(header["size"] * (size[3] / (size[2] - size[1])));
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

    if (cacheData[data.tabId] == undefined) {
        cacheData[data.tabId] = [];
    }
    // 查重
    for (let key in cacheData[data.tabId]) {
        if (cacheData[data.tabId][key].url == data.url) { return; }
    }
    //幽灵数据与当前标签资源查重
    if (data.tabId == -1 && cacheData[G.tabId] !== undefined) {
        for (let key in cacheData[G.tabId]) {
            if (cacheData[G.tabId][key].url == data.url) { return; }
        }
    }
    const info = {
        name: name,
        url: data.url,
        size: header["size"],
        ext: ext,
        type: data.mime ?? header["type"],
        tabId: data.tabId,
        isRegex: isRegex,
        requestId: data.requestId ?? Date.now(),
        extraExt: data.extraExt,
        initiator: data.initiator,
        referer: data.referer
    };
    const getTabId = data.tabId == -1 ? G.tabId : data.tabId;
    chrome.tabs.get(getTabId, function (webInfo) {
        if (chrome.runtime.lastError) { return; }
        // 不存在 initiator 和 referer 使用web url代替initiator
        if (info.initiator == undefined || info.initiator == "null") {
            info.initiator = data.referer ?? webInfo?.url;
        }
        // 装载页面信息
        info.title = webInfo?.title ?? "NULL";
        info.favIconUrl = webInfo?.favIconUrl;
        info.webUrl = webInfo?.url;
        // 发送到popup 并检查自动下载
        chrome.runtime.sendMessage(info, function () {
            if (data.tabId != -1 && G.featAutoDownTabId && G.featAutoDownTabId.includes(data.tabId)) {
                const downDir = info.title == "NULL" ? "CatCatch/" : info.title + "/";
                chrome.downloads.download({
                    url: data.url,
                    filename: downDir + info.name
                });
            }
            if (chrome.runtime.lastError) { return; }
        });
        // 储存数据
        if (cacheData[data.tabId] == undefined) {
            cacheData[data.tabId] = [];
        }
        cacheData[data.tabId].push(info);
        // 视频切片太多 频繁储存 严重影响性能
        // 当前标签媒体数量大于1000 开启防抖 等待5秒储存 或 积累10个资源储存一次。
        if (cacheData[data.tabId].length >= 1000 && debounceCount <= 10) {
            debounceCount++;
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                chrome.storage.local.set({ MediaData: cacheData }, function () {
                    chrome.runtime.lastError && console.log(chrome.runtime.lastError);
                });
            }, 5000);
        } else {
            clearTimeout(debounce);
            debounceCount = 0;
            chrome.storage.local.set({ MediaData: cacheData }, function () {
                chrome.runtime.lastError && console.log(chrome.runtime.lastError);
            });
        }

        if (data.tabId != -1) {
            SetIcon({ number: cacheData[data.tabId].length, tabId: data.tabId });
        } else {
            SetIcon({ tips: true });
            //自动清理幽灵数据
            if (cacheData[-1].length > G.OtherAutoClear) {
                delete cacheData[-1];
                chrome.storage.local.set({ MediaData: cacheData });
                SetIcon({ tips: false });
            }
        }
    });
}

//监听来自popup 和 options的请求
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (G.featMobileTabId === undefined || 
        G.featAutoDownTabId === undefined
    ) {
        sendResponse("error");
        return true;
    }
    if (Message.Message == "pushData") {
        chrome.storage.local.set({ MediaData: cacheData });
        sendResponse("ok");
        return true;
    }
    if (Message.Message == "getData") {
        sendResponse(cacheData);
        return true;
    }
    // 图标设置
    if (Message.Message == "ClearIcon") {
        if (Message.tabId == undefined || Message.tabId == "-1") {
            SetIcon({ tips: false });
        }
        if (Message.tabId == undefined) {
            SetIcon({ tabId: G.tabId });
        } else if (Message.tabId != "-1") {
            SetIcon({ tabId: Message.tabId });
        }
        sendResponse("ok");
        return true;
    }
    Message.tabId = Message.tabId ?? G.tabId;
    if (Message.Message == "getButtonState") {
        let state = {
            MobileUserAgent: G.featMobileTabId.includes(Message.tabId),
            AutoDown: G.featAutoDownTabId.includes(Message.tabId)
        }
        G.scriptList.forEach(function (item, key) {
            state[item.key] = item.tabId.has(Message.tabId);
        });
        sendResponse(state);
        return true;
    }
    // 模拟手机
    if (Message.Message == "mobileUserAgent") {
        if (G.featMobileTabId.includes(Message.tabId)) {
            mobileUserAgent(Message.tabId, false);
        } else {
            G.featMobileTabId.push(Message.tabId);
            chrome.storage.local.set({ featMobileTabId: G.featMobileTabId });
            mobileUserAgent(Message.tabId, true);
        }
        chrome.tabs.reload(Message.tabId, { bypassCache: true });
        sendResponse("ok");
        return true;
    }
    // 自动下载
    if (Message.Message == "autoDown") {
        if (G.featAutoDownTabId.includes(Message.tabId)) {
            tabIdListRemove("featAutoDownTabId", Message.tabId);
        } else {
            G.featAutoDownTabId.push(Message.tabId);
            chrome.storage.local.set({ featAutoDownTabId: G.featAutoDownTabId });
        }
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
        if (scriptTabid.has(Message.tabId)) {
            scriptTabid.delete(Message.tabId);
            script.refresh && chrome.tabs.reload(Message.tabId, { bypassCache: true });
            sendResponse("ok");
            return true;
        }
        scriptTabid.add(Message.tabId);
        if(script.refresh){
            chrome.tabs.reload(Message.tabId, { bypassCache: true });
        }else{
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
                    findMedia({ url: Message.url, tabId: item.id, extraExt: Message.extraExt, mime: Message.mime }, true, true);
                    sendResponse("ok");
                    return true;
                }
            }
            findMedia({ url: Message.url, tabId: -1, extraExt: Message.extraExt, mime: Message.mime }, true, true);
        });
        sendResponse("ok");
        return true;
    }
    // ffmpeg在线转码
    if (Message.Message == "catCatchFFmpeg") {
        const data = { Message: "ffmpeg", action: Message.action, media: Message.media, title: Message.title };
        chrome.tabs.query({ url: ffmpeg.url }, function (tabs) {
            if (chrome.runtime.lastError || !tabs.length) {
                chrome.tabs.create({ url: ffmpeg.url }, function (tab) {
                    ffmpeg.tab = tab.id;
                    ffmpeg.data = data;
                });
                sendResponse("ok");
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
//切换标签，更新全局变量G.tabId 更新图标
chrome.tabs.onActivated.addListener(function (activeInfo) {
    G.tabId = activeInfo.tabId;
    if (cacheData[G.tabId] !== undefined) {
        SetIcon({ number: cacheData[G.tabId].length, tabId: G.tabId });
        return;
    }
    SetIcon({ tabId: G.tabId });
});

// 标签更新 清除数据
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status == "loading") {
        // 刷新页面 清理数据
        if (G.refreshClear) {
            delete cacheData[tabId];
            chrome.storage.local.set({ MediaData: cacheData });
            SetIcon({ tabId: tabId });
        } else if (cacheData[G.tabId] !== undefined) {
            SetIcon({ number: cacheData[G.tabId].length, tabId: tabId });
        }

        // 跳过特殊页面
        if (isSpecialPage(tab.url) || tabId == 0 || tabId == -1) { return; }

        // 开启捕获
        if (G.version >= 102) {
            G.scriptList.forEach(function (item, key) {
                if (item.tabId.has(tabId)) {
                    chrome.scripting.executeScript({
                        target: { tabId: tabId, allFrames: item.allFrames },
                        files: [`catch-script/${key}`],
                        injectImmediately: true,
                        world: item.world
                    });
                }
            });
        }
        // 模拟手机端 修改 navigator 变量
        if (G.version >= 102 && G.featMobileTabId && G.featMobileTabId.includes(tabId)) {
            chrome.scripting.executeScript({
                args: [G.MobileUserAgent.toString()],
                target: { tabId: tabId, allFrames: true },
                func: function () {
                    Object.defineProperty(navigator, 'userAgent', { value: arguments[0], writable: false });
                },
                injectImmediately: true,
                world: "MAIN"
            });
        }
    }
    if (changeInfo.status == "complete") {
        if (ffmpeg.tab && tabId == ffmpeg.tab) {
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, ffmpeg.data);
                ffmpeg.tab = 0;
            }, 500);
        }
    }
});
// 标签关闭 清除数据
chrome.tabs.onRemoved.addListener(function (tabId) {
    // 清理缓存数据
    delete cacheData[tabId];
    chrome.storage.local.set({ MediaData: cacheData });
    refererData = [];
    // 清理 模拟手机
    mobileUserAgent(tabId, false);
    // 清理 自动下载
    tabIdListRemove("featAutoDownTabId", tabId);
    // 清理 捕获
    if (G.version >= 102) {
        G.scriptList.forEach(function(item){
            if (item.tabId.has(tabId)) {
                item.tabId.delete(tabId);
            }
        });
    }
    chrome.alarms.create("nowClear", { when: Date.now() + 3000 });
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
    for (let key in G.Type) {
        let TypeSplit = dataType.split("/");
        let OptionSplit = G.Type[key].type.split("/");
        if (OptionSplit[0] == TypeSplit[0] && (OptionSplit[1] == TypeSplit[1] || OptionSplit[1] == "*")) {
            if (G.Type[key].size != 0 && dataSize != undefined && dataSize <= G.Type[key].size * 1024) {
                return "break";
            }
            return G.Type[key].state ? true : "break";
        }
    }
    return false;
}

// 获取文件名 后缀
function fileNameParse(pathname) {
    let fileName = pathname.split("/").pop();
    let ext = fileName.split(".");
    ext = ext.length == 1 ? undefined : ext.pop().toLowerCase();
    return [fileName, ext ? ext : undefined];
}
//获取Header属性的值
function getResponseHeadersValue(data) {
    let header = new Array();
    if (data.responseHeaders == undefined) { return header; }
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
    if (data.requestHeaders == undefined) { return false; }
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
                    "tabIds": G.featMobileTabId,
                    "resourceTypes": ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport", "webbundle", "other"]
                }
            }]
        });
        return true;
    }
    tabIdListRemove("featMobileTabId", tabId);
    chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [tabId]
    });
}
function tabIdListRemove(str, tabId) {
    if (!G[str] || G[str].length == 0) { return false; }
    const index = G[str].indexOf(tabId);
    if (index > -1) {
        G[str].splice(index, 1);
        chrome.storage.local.set({ [str]: G[str] });
        return true;
    }
    return false;
}

// 判断特殊页面
function isSpecialPage(url) {
    if (url == "" || url == undefined || url == "null") { return true; }
    let urlParsing = {};
    try { urlParsing = new URL(url); } catch (e) { return true; }
    return !(urlParsing.protocol == "https:" ||
        urlParsing.protocol == "http:" ||
        urlParsing.protocol == "blob:")
}

// 测试
// chrome.storage.local.get(function (data) { console.log(data.MediaData) });
// chrome.declarativeNetRequest.getSessionRules(function (rules) { console.log(rules); });
// chrome.tabs.query({}, function (tabs) { for (let item of tabs) { console.log(item.id); } });