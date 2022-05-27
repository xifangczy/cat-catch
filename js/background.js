importScripts("init.js");

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

//onResponseStarted 浏览器接收到第一个字节触发，保证有更多信息判断资源类型
chrome.webRequest.onResponseStarted.addListener(
    function (data) {
        try { findMedia(data, false); } catch (e) { console.log(e); }
    }, { urls: ["<all_urls>"] }, ["responseHeaders", "extraHeaders"]
);
//onBeforeRequest 浏览器发送请求之前使用正则匹配发送请求的URL
chrome.webRequest.onBeforeRequest.addListener(
    function (data) {
        try { findMedia(data, true); } catch (e) { console.log(e); }
    }, { urls: ["<all_urls>"] }, ["requestBody", "extraHeaders"]
);

function findMedia(data, isRegex = false) {
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
    //过滤器开关
    let filter = false;
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
    if (isRegex) {
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
            SetIcon(items.MediaData[tabId].length, data.tabId);
        }
        //自动清理幽灵数据
        if (items.MediaData["tabId-1"] !== undefined) {
            chrome.action.setIcon({ path: "/img/icon-tips.png" });
            if (items.MediaData["tabId-1"].length > G.Options.OtherAutoClear) {
                delete items.MediaData["tabId-1"];
                chrome.storage.local.set({ MediaData: items.MediaData });
                chrome.action.setIcon({ path: "/img/icon.png" });
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
        if (Message.tab == undefined || Message.tab == "-1") {
            chrome.action.setIcon({ path: "/img/icon.png" });
        }
        if (Message.tab == undefined) {
            SetIcon(0, G.tabId);
        } else if (Message.tab != "-1") {
            SetIcon(0, Message.tab);
        }
    }
    sendResponse("OK");
});
//切换标签，更新全局变量G.tabId 更新图标
chrome.tabs.onActivated.addListener(function (activeInfo) {
    G.tabId = activeInfo.tabsId;
    G.tabIdStr = "tabId" + G.tabId;
    chrome.storage.local.get({ MediaData: {} }, function (items) {
        if (items.MediaData[G.tabIdStr] !== undefined) {
            SetIcon(items.MediaData[G.tabIdStr].length, G.tabId);
        } else {
            SetIcon(0, G.tabId);
        }
    });
});
//标签更新，清除该标签的记录
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
    if (changeInfo.status == "loading") {
        chrome.storage.local.get({ MediaData: {} }, function (items) {
            delete items.MediaData["tabId" + tabId];
            chrome.storage.local.set({ MediaData: items.MediaData });
            SetIcon(0, tabId);
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
        const reg = new RegExp(item.regex, item.type);
        if (reg.test(url)) {
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
function SetIcon(Num, tabId) {
    if (Num == 0) {
        chrome.action.setBadgeText({ text: "", tabId: tabId });
        chrome.action.setTitle({ title: "还没闻到味儿~", tabId: tabId });
    } else {
        chrome.action.setBadgeText({ text: Num.toString(), tabId: tabId });
        chrome.action.setTitle({ title: "抓到 " + Num.toString() + " 条鱼", tabId: tabId });
    }
}