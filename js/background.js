importScripts("/js/init.js");
clearRedundant();

// Service Worker 5分钟后会强制终止扩展
// https://bugs.chromium.org/p/chromium/issues/detail?id=1271154
// https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/70003493#70003493
chrome.webNavigation.onBeforeNavigate.addListener(function () { return; });
chrome.webNavigation.onHistoryStateUpdated.addListener(function () { return; });
chrome.alarms.create("heartbeat1", { periodInMinutes: 1 });
chrome.alarms.create("heartbeat4.9", { periodInMinutes: 4.9 });
chrome.alarms.onAlarm.addListener(function (alarm) {
    chrome.tabs.query({}, function (tabs) {
        for (let item of tabs) {
            if (isSpecialPage(item.url) || item.id == -1 || item.id == 0) { return; }
            try {
                chrome.scripting.executeScript({
                    args: [chrome.runtime.id],
                    target: { tabId: item.id },
                    func: (cid) => chrome.runtime.sendMessage(cid, { Message: "HeartBeat", type: "alarm" }),
                });
            } catch (e) { }
        }
    });
});
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

// onResponseStarted 浏览器接收到第一个字节触发，保证有更多信息判断资源类型
chrome.webRequest.onResponseStarted.addListener(
    function (data) {
        try { findMedia(data); } catch (e) { console.log(e); }
    }, { urls: ["<all_urls>"] }, ["responseHeaders"]
);
// onBeforeRequest 浏览器发送请求之前使用正则匹配发送请求的URL
chrome.webRequest.onBeforeRequest.addListener(
    function (data) {
        try { findMedia(data, true); } catch (e) { console.log(e); }
    }, { urls: ["<all_urls>"] }, ["requestBody"]
);

function findMedia(data, isRegex = false, filter = false) {
    // Service Worker被强行杀死之后重新自我唤醒，等待全局变量初始化完成。
    if (G.Ext === undefined ||
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
    // 屏蔽特殊页面的资源
    if (isSpecialPage(data.url)) { return; }
    // 屏蔽Youtube
    let urlParsing = new URL(data.url);
    if (
        urlParsing.host.includes("youtube.com") ||
        urlParsing.host.includes("googlevideo.com")
    ) { return; }
    // 调试模式
    if (G.Debug) {
        console.log({ data, G, isRegex });
    }

    const header = getHeaderValue(data);
    let name = GetFileName(data.url);
    let ext = GetExt(name);

    //正则匹配
    if (isRegex && !filter) {
        for (let item of G.Regex) {
            if (!item.state) { continue; }
            const result = new RegExp(item.regex, item.type).exec(data.url);
            if (result == null) { continue; }
            data.extraExt = item.ext ? item.ext : undefined;
            if (result.length == 1) {
                findMedia(data, true, true);
                return;
            }
            for (let i = 1; i < result.length; i++) {
                data.url = decodeURIComponent(result[i]);
                if (/^[\w]+:\/\/.+/i.test(data.url)) {
                    findMedia(data, true, true);
                    return;
                }
            }
        }
        return;
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
        const res = header["attachment"].match(/filename="(.*?)"/);
        if (res && res[1]) {
            name = GetFileName(decodeURIComponent(res[1]));
            ext = GetExt(name);
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
    for (let item of cacheData[data.tabId]) {
        if (item.url == data.url) { return; }
    }
    //幽灵数据与当前标签资源查重
    if (data.tabId == -1 && cacheData[G.tabId] !== undefined) {
        for (let item of cacheData[G.tabId]) {
            if (item.url == data.url) { return; }
        }
    }
    const info = {
        name: name,
        url: data.url,
        size: header["size"],
        ext: ext,
        type: header["type"],
        tabId: data.tabId,
        isRegex: isRegex,
    };
    let getTabId = data.tabId == -1 ? G.tabId : data.tabId;
    chrome.tabs.get(getTabId, function (webInfo) {
        // initiator 不存在 使用当前网页的url
        if (data.initiator == undefined || data.initiator == "null") {
            data.initiator = webInfo?.url;
        }
        // 装载页面信息
        info.initiator = data.initiator;
        info.title = webInfo?.title ? stringModify(webInfo.title) : "NULL";
        info.webInfo = webInfo;
        info.extraExt = data.extraExt ? data.extraExt : undefined;
        // 发送到popup 并检查自动下载
        chrome.runtime.sendMessage(info, function () {
            if (data.tabId != -1 && G.featAutoDownTabId && G.featAutoDownTabId.includes(data.tabId)) {
                let downFileName = G.TitleName ? info.title + '.' + info.ext : info.name;
                chrome.downloads.download({
                    url: data.url,
                    filename: "CatCatch-" + data.tabId + "/" + downFileName
                });
            }
            if (chrome.runtime.lastError) { return; }
        });
        // 储存数据
        cacheData[data.tabId].push(info);
        chrome.storage.local.set({ MediaData: cacheData });
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
        return;
    }
    if (Message.Message == "getButtonState") {
        let state = {
            mobile: G.featMobileTabId.includes(Message.tabId),
            autodown: tabIdListRemove("featAutoDownTabId", Message.tabId), // 点击图标 立刻停止下载
            catch: G.featCatchTabId.includes(Message.tabId)
        }
        sendResponse(state);
        return;
    }
    // 模拟手机
    if (Message.Message == "mobileUserAgent") {
        if (G.featMobileTabId.includes(Message.tabId)) {
            mobileUserAgent(Message.tabId);
        } else {
            G.featMobileTabId.push(Message.tabId);
            chrome.storage.local.set({ featMobileTabId: G.featMobileTabId });
            mobileUserAgent(Message.tabId, true);
        }
        chrome.tabs.reload(Message.tabId, { bypassCache: true });
        return;
    }
    // 自动下载
    if (Message.Message == "autoDown") {
        if (G.featAutoDownTabId.includes(Message.tabId)) {
            tabIdListRemove("featAutoDownTabId", Message.tabId);
        } else {
            G.featAutoDownTabId.push(Message.tabId);
            chrome.storage.local.set({ featAutoDownTabId: G.featAutoDownTabId });
        }
        return;
    }
    // 捕获
    if (Message.Message == "catch") {
        if (G.featCatchTabId.includes(Message.tabId)) {
            tabIdListRemove("featCatchTabId", Message.tabId);
        } else {
            G.featCatchTabId.push(Message.tabId);
            chrome.storage.local.set({ featCatchTabId: G.featCatchTabId });
        }
        chrome.tabs.reload(Message.tabId, { bypassCache: true });
        return;
    }
    // Heart Beat
    if (Message.Message == "HeartBeat") {
        sendResponse("HeartBeat OK");
        return;
    }
    // 清理冗余数据
    if (Message.Message == "clearRedundant") {
        clearRedundant();
        return;
    }
    // 清理数据
    if (Message.Message == "clearData") {
        delete cacheData[Message.tabId];
        delete cacheData[-1];
        chrome.storage.local.set({ MediaData: cacheData });
        return;
    }
    sendResponse("Error");
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
    // 刷新页面 清理数据
    if (changeInfo.status == "loading") {
        // 清理缓存数据
        delete cacheData[tabId];
        chrome.storage.local.set({ MediaData: cacheData });
        SetIcon({ tabId: tabId });
    }
    // 跳过特殊页面
    if (isSpecialPage(tab.url) || tabId == 0 || tabId == -1) { return; }

    if (changeInfo.status == "loading") {
        // 开启捕获
        if (G.featCatchTabId && G.featCatchTabId.includes(tabId)) {
            let injectScript = G.injectScript ? "js/" + G.injectScript : "js/catch.js";
            chrome.scripting.executeScript(
                {
                    target: { tabId: tabId, allFrames: true },
                    files: [injectScript],
                    injectImmediately: true,
                    world: "MAIN"
                }
            );
        }
        // 模拟手机端 修改 navigator 变量
        if (G.featMobileTabId && G.featMobileTabId.includes(tabId)) {
            chrome.scripting.executeScript(
                {
                    args: [G.MobileUserAgent.toString()],
                    target: { tabId: tabId, allFrames: true },
                    func: function () {
                        Object.defineProperty(navigator, 'userAgent', { value: arguments[0], writable: false });
                    },
                    injectImmediately: true,
                    world: "MAIN"
                }
            );
        }
    }
    if (changeInfo.status == "complete") {
        // HeartBeat
        chrome.scripting.executeScript({
            args: [chrome.runtime.id],
            target: { tabId: tabId },
            func: function (cid) {
                let Port
                function connect() {
                    Port = chrome.runtime.connect(cid, { name: "HeartBeat" });
                    Port.postMessage("HeartBeat");
                    Port.onMessage.addListener(function (message, Port) { return; });
                    Port.onDisconnect.addListener(connect);
                }
                connect();
            }
        });
    }
});
// 标签关闭 清除数据
chrome.tabs.onRemoved.addListener(function (tabId) {
    // 清理缓存数据
    delete cacheData[tabId];
    chrome.storage.local.set({ MediaData: cacheData });
    // 清理 模拟手机
    mobileUserAgent(tabId, false);
    // 清理 自动下载
    tabIdListRemove("featAutoDownTabId", tabId);
    // 清理 捕获
    tabIdListRemove("featCatchTabId", tabId);
});

//检查扩展名以及大小限制
function CheckExtension(ext, size) {
    for (let item of G.Ext) {
        if (item.ext == ext) {
            if (item.size != 0 && size != undefined && size <= item.size * 1024) {
                return "break";
            }
            return item.state ? true : "break";
        }
    }
    return false;
}
//检查类型以及大小限制
function CheckType(dataType, dataSize) {
    for (let item of G.Type) {
        let TypeSplit = dataType.split("/");
        let OptionSplit = item.type.split("/");
        if (OptionSplit[0] == TypeSplit[0] && (OptionSplit[1] == TypeSplit[1] || OptionSplit[1] == "*")) {
            if (item.size != 0 && dataSize != undefined && dataSize <= item.size * 1024) {
                return "break";
            }
            return item.state ? true : "break";
        }
    }
    return false;
}

//获取文件名
function GetFileName(url) {
    let str = url.split("?"); //url按？分开
    str = str[0].split("/"); //按/分开
    str = str[str.length - 1].split("#"); //按#分开
    return str[0].toLowerCase(); //得到带后缀的名字
}
//获取后缀名
function GetExt(FileName) {
    let str = FileName.split(".");
    if (str.length == 1) {
        return undefined;
    }
    let ext = str[str.length - 1];
    ext = ext.match(/[0-9a-zA-Z]*/);
    return ext[0].toLowerCase();
}
//获取Header属性的值
function getHeaderValue(data) {
    let header = new Array();
    if (data.responseHeaders == undefined) { return header; }
    for (let item of data.responseHeaders) {
        item.name = item.name.toLowerCase();
        if (item.name == "content-length") {
            header["size"] = item.value;
        } else if (item.name == "content-type") {
            header["type"] = item.value.split(";")[0].toLowerCase();
        } else if (item.name == "content-disposition") {
            header["attachment"] = item.value.toLowerCase();
        }
    }
    return header;
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
                        "header": "user-agent",
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
    chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [tabId]
    });
    return tabIdListRemove("featMobileTabId", tabId);
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
    try {
        urlParsing = new URL(url);
    } catch (e) { return true; }
    if (urlParsing.protocol == "chrome-extension:" ||
        urlParsing.protocol == "chrome:" ||
        urlParsing.protocol == "about:" ||
        urlParsing.protocol == "extension:") { return true; }
    return false;
}

// 清理冗余数据
function clearRedundant() {
    chrome.tabs.query({}, function (tabs) {
        let allTabId = [];
        for (let item of tabs) {
            allTabId.push(item.id);
        }
        if (!cacheData.init) {
            // 清理 缓存数据
            for (let key in cacheData) {
                if (!allTabId.includes(parseInt(key))) {
                    delete cacheData[key];
                }
            }
            chrome.storage.local.set({ MediaData: cacheData });
        }

        // 清理 declarativeNetRequest
        chrome.declarativeNetRequest.getSessionRules(function (rules) {
            for (let item of rules) {
                if (!allTabId.includes(item.id)) {
                    chrome.declarativeNetRequest.updateSessionRules({
                        removeRuleIds: [item.id]
                    });
                }
            }
        });
    });
}
function stringModify(str) {
    return str.replace(/['\\:\*\?"<\/>\|]/g, function (m) {
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
            '|': '&#124;'
        }[m];
    });
}

// 测试
// chrome.storage.local.get(function (data) { console.log(data.MediaData) });
// chrome.declarativeNetRequest.getSessionRules(function (rules) { console.log(rules); });