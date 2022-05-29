importScripts("/js/init.js");

// Service Worker 5分钟后会强制终止扩展
// https://bugs.chromium.org/p/chromium/issues/detail?id=1271154
// https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/70003493#70003493
chrome.webNavigation.onBeforeNavigate.addListener(function () {
    console.log("Start Miao~");
});
chrome.alarms.create({ periodInMinutes: 4.9 })
chrome.alarms.onAlarm.addListener(() => {
    console.log('HeartBeat Miao~');
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
    if (G.Options.Ext === undefined ||
        G.Options.Debug === undefined ||
        G.Options.OtherAutoClear === undefined ||
        G.Options.Type === undefined ||
        G.Options.Regex === undefined
    ) { return; }
    //屏蔽特殊页面发起的资源
    let urlParsing = new Object();
    if (data.initiator != "null" && data.initiator !== undefined) {
        urlParsing = new URL(data.initiator);
        if (urlParsing.protocol == "chrome-extension:" ||
            urlParsing.protocol == "chrome:" ||
            urlParsing.protocol == "extension:") { return; }
    }
    //屏蔽特殊页面的资源
    urlParsing = new URL(data.url);
    if (urlParsing.protocol == "chrome-extension:" ||
        urlParsing.protocol == "chrome:" ||
        urlParsing.protocol == "extension:") { return; }
    //屏蔽Youtube
    if (
        urlParsing.host.includes("youtube.com") ||
        urlParsing.host.includes("googlevideo.com")
    ) { return; }
    //调试模式
    if (G.Options.Debug) {
        console.log(data);
    }
    //网页标题
    let title = "NULL";
    let webInfo = undefined;
    //获得文件大小
    let size = getHeaderValue("content-length", data);
    //获得文件名
    let name = GetFileName(data.url);
    //获得扩展名
    let ext = GetExt(name);
    //获得content-type
    let contentType = getHeaderValue("content-type", data);
    //获得content-disposition
    let Disposition = getHeaderValue("Content-Disposition", data);
    //获取网页标题
    if (data.tabId !== -1) {
        chrome.tabs.get(data.tabId, function (info) {
            if (info !== undefined) {
                title = info.title;
                webInfo = info;
            }
        });
    }
    //正则匹配
    if (isRegex && !filter) {
        filter = CheckRegex(data.url);
        if (filter == "break") { return; }
    }

    //检查后缀
    if (!isRegex && !filter && ext != undefined) {
        filter = CheckExtension(ext, size);
        if (filter == "break") { return; }
    }
    //检查类型
    if (!isRegex && !filter && contentType != undefined) {
        filter = CheckType(contentType, size);
        if (filter == "break") { return; }
    }
    //查找附件
    if (!isRegex && !filter && Disposition != undefined) {
        let res = Disposition.match(/filename="(.*?)"/);
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

    chrome.storage.local.get({ MediaData: {} }, function (items) {
        let tabId = "tabId" + data.tabId;
        if (items.MediaData[tabId] === undefined) {
            items.MediaData[tabId] = new Array();
        }
        for (let item of items.MediaData[tabId]) {
            if (item.url == data.url) { return; }
        }
        //幽灵数据与当前标签资源查重
        if (data.tabId == -1 && items.MediaData[G.tabIdStr] !== undefined) {
            for (let item of items.MediaData[G.tabIdStr]) {
                if (item.url == data.url) { return; }
            }
        }
        let info = {
            name: name,
            url: data.url,
            size: Math.round((100 * size) / 1024 / 1024) / 100,
            ext: ext,
            type: contentType,
            tabId: data.tabId,
            title: title,
            webInfo: webInfo,
            isRegex: isRegex
        };
        items.MediaData[tabId].push(info);
        chrome.storage.local.set({ MediaData: items.MediaData });
        if (data.tabId != -1) {
            SetIcon({ number: items.MediaData[tabId].length, tabId: data.tabId });
        }
        //自动清理幽灵数据
        if (items.MediaData["tabId-1"] !== undefined) {
            SetIcon({ tips: true });
            if (items.MediaData["tabId-1"].length > G.Options.OtherAutoClear) {
                delete items.MediaData["tabId-1"];
                chrome.storage.local.set({ MediaData: items.MediaData });
                SetIcon({ tips: false });
            }
        }
        try {
            chrome.runtime.sendMessage(info, function () {
                return chrome.runtime.lastError;
            });
        } catch (e) { }
    });
}

//监听来自popup 和 options的请求
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
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
    if (Message.Message == "getRulesTabId") {
        sendResponse(G.MobileTabId);
        return;
    }
    if (Message.Message == "OnMobileUserAgent") {
        OnMobileUserAgent(Message.tabId);
        chrome.tabs.reload(Message.tabId);
        return;
    }
    if (Message.Message == "OffMobileUserAgent") {
        OffMobileUserAgent(Message.tabId);
        chrome.tabs.reload(Message.tabId);
        return;
    }
    sendResponse("Error");
});
//切换标签，更新全局变量G.tabId 更新图标
chrome.tabs.onActivated.addListener(function (activeInfo) {
    G.tabId = activeInfo.tabId;
    G.tabIdStr = "tabId" + G.tabId;
    chrome.storage.local.get({ MediaData: {} }, function (items) {
        if (items.MediaData[G.tabIdStr] !== undefined) {
            SetIcon({ number: items.MediaData[G.tabIdStr].length, tabId: G.tabId });
        } else {
            SetIcon({ tabId: G.tabId });
        }
    });
});
//标签更新，清除该标签的记录
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
    if (changeInfo.status == "loading") {
        chrome.storage.local.get({ MediaData: {} }, function (items) {
            delete items.MediaData["tabId" + tabId];
            chrome.storage.local.set({ MediaData: items.MediaData });
            SetIcon({ tabId: tabId });
        });
    }
});
//标签关闭，清除该标签的记录
chrome.tabs.onRemoved.addListener(function (tabId) {
    let tabIdObject = "tabId" + tabId;
    chrome.storage.local.get({ MediaData: {} }, function (items) {
        delete items.MediaData[tabIdObject];
        chrome.storage.local.set({ MediaData: items.MediaData });
    });
    OffMobileUserAgent(tabId);
});

//检查扩展名以及大小限制
function CheckExtension(ext, size) {
    for (let item of G.Options.Ext) {
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
    for (let item of G.Options.Type) {
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
//正则匹配
function CheckRegex(url) {
    for (let item of G.Options.Regex) {
        const regex = new RegExp(item.regex, item.type);
        const result = regex.exec(url);
        if (result == null) { continue; }
        if (!item.state) { return "break"; }
        if (result.length == 1) { return true; }
        for (let i = 1; i < result.length; i++) {
            let data = new Object();
            data.url = decodeURIComponent(result[i]);
            data.tabId = G.tabId;
            if (/^[\w]+:\/\/.+/i.test(data.url)) {
                findMedia(data, true, true);
            }
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
function getHeaderValue(name, data) {
    name = name.toLowerCase();
    if (data.responseHeaders == undefined) { return undefined; }
    for (let item of data.responseHeaders) {
        if (item.name.toLowerCase() == name) {
            if (name == "content-type") {
                return item.value.split(";")[0].toLowerCase();
            }
            return item.value.toLowerCase();
        }
    }
    return undefined;
}
//设置扩展图标
function SetIcon(obj) {
    if (obj.tips != undefined) {
        let path = obj.tips ? "/img/icon-tips.png" : "/img/icon.png";
        chrome.action.setIcon({ path: path });
    } else if (obj.number == 0 || obj.number == undefined) {
        chrome.action.setBadgeText({ text: "", tabId: obj.tabId });
        chrome.action.setTitle({ title: "还没闻到味儿~", tabId: obj.tabId });
    } else {
        obj.number = obj.number > 99 ? "99+" : obj.number.toString();
        chrome.action.setBadgeText({ text: obj.number, tabId: obj.tabId });
        chrome.action.setTitle({ title: "抓到 " + obj.number + " 条鱼", tabId: obj.tabId });
    }
}
function OnMobileUserAgent(tabId) {
    G.MobileTabId.push(tabId);
    chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [tabId],
        addRules: [{
            "id": tabId,
            "action": {
                "type": "modifyHeaders",
                "requestHeaders": [{
                    "header": "user-agent",
                    "operation": "set",
                    "value": G.Options.MobileUserAgent
                }]
            },
            "condition": {
                "tabIds": G.MobileTabId,
                "resourceTypes": ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport", "webbundle", "other"]
            }
        }]
    });
}
function OffMobileUserAgent(tabId) {
    let index = G.MobileTabId.indexOf(tabId);
    if (index > -1) {
        G.MobileTabId.splice(index, 1);
    }
    chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [tabId]
    });
}