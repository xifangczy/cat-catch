importScripts("init.js");

// 保持 Service Worker 活跃，这似乎是BUG?
// https://bugs.chromium.org/p/chromium/issues/detail?id=1271154
// https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/70003493#70003493
chrome.webNavigation.onBeforeNavigate.addListener(function () {
    console.log("Miao~");
});

//响应开始(用来检测媒体文件地址大小等信息)
chrome.webRequest.onResponseStarted.addListener(
    function (data) {
        findMedia(data);
    }, { urls: ["<all_urls>"] }, ["responseHeaders", "extraHeaders"]
);

function findMedia(data) {
    if (
        Options.Ext === undefined ||
        Options.Debug === undefined ||
        Options.OtherAutoClear === undefined ||
        Options.TitleName === undefined ||
        Options.Type === undefined
    ) { return; }
    //屏蔽特殊页面发起的资源
    var urlParsing = new Object();
    if (data.initiator !== undefined) {
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
        urlParsing.host.indexOf("youtube.com") != -1 ||
        urlParsing.host.indexOf("googlevideo.com") != -1
    ) { return; }
    //调试模式
    if (Options.Debug) {
        console.log(data);
    }
    //网页标题
    var title = "Null";
    var webInfo = undefined;
    //过滤器开关
    var filter = false;
    //获得文件大小
    var size = getHeaderValue("content-length", data);
    //获得文件名
    var name = GetFileName(data.url);
    //获得扩展名
    var ext = GetExt(name);
    //获得content-type
    var contentType = getHeaderValue("content-type", data);
    //获得content-disposition
    var Disposition = getHeaderValue("Content-Disposition", data);
    //获取网页标题
    if (data.tabId !== -1) {
        chrome.tabs.get(data.tabId, function (info) {
            if (info !== undefined) {
                title = info.title;
                webInfo = info;
            }
        });
    }

    //检查后缀
    if (ext != null) {
        filter = CheckExtension(ext, size);
        if (filter == "break") { return; }
    }

    //检查类型
    if (!filter && contentType != null) {
        filter = CheckType(contentType, size);
        if (filter == "break") { return; }
    }

    //查找附件
    if (!filter && Disposition != null) {
        var res = Disposition.match(/filename="(.*?)"/);
        if (res && res[1]) {
            name = GetFileName(decodeURIComponent(res[1]));
            ext = GetExt(name);
            filter = CheckExtension(ext, 0);
            if (filter == "break") { return; }
        }
    }
    if (filter) {
        chrome.storage.local.get({ MediaData: {} }, function (items) {
            var tabId = "tabId" + data.tabId;
            if (items.MediaData[tabId] === undefined) {
                items.MediaData[tabId] = new Array();
            }
            for (let item of items.MediaData[tabId]) {
                if (item.url == data.url) { return; }
            }
            //幽灵数据与当前标签资源查重
            if (data.tabId == -1) {
                chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                    let tabId = "tabId" + tabs[0].id;
                    for (let item of items.MediaData[tabId]) {
                        if (item.url == data.url) { return; }
                    }
                });
            }
            var info = {
                name: name,
                url: data.url,
                size: Math.round((100 * size) / 1024 / 1024) / 100,
                ext: ext,
                type: contentType,
                tabId: data.tabId,
                title: title,
                webInfo: webInfo
            };
            items.MediaData[tabId].push(info);
            chrome.storage.local.set({ MediaData: items.MediaData });
            if (data.tabId != -1) {
                SetIcon(items.MediaData[tabId].length, data.tabId);
            }
            //自动清理幽灵数据
            if (items.MediaData["tabId-1"] !== undefined) {
                chrome.action.setIcon({ path: "/img/icon-tips.png" });
                if (items.MediaData["tabId-1"].length > Options.OtherAutoClear) {
                    delete items.MediaData["tabId-1"];
                    chrome.storage.local.set({ MediaData: items.MediaData });
                    chrome.action.setIcon({ path: "/img/icon.png" });
                }
            }
            chrome.runtime.sendMessage(info, function () {
                // console.log(chrome.runtime.lastError.message);
                return chrome.runtime.lastError;
            });
        });
    }
}

//监听来自popup 和 options的请求
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (Message == "RefreshOption") {
        SetOptions();
    } else if (Message == "ClearIcon") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            SetIcon(0, tabs[0].id);
        });
        chrome.action.setIcon({ path: "/img/icon.png" });
    }
    sendResponse("OK");
});
//切换标签，更新图标
chrome.tabs.onActivated.addListener(function (info) {
    let tabId = info.tabId;
    chrome.storage.local.get({ MediaData: {} }, function (items) {
        if (items.MediaData["tabId" + tabId] !== undefined) {
            SetIcon(items.MediaData["tabId" + tabId].length, tabId);
        } else {
            SetIcon(0, tabId);
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
    var tabIdObject = "tabId" + tabId;
    chrome.storage.local.get({ MediaData: {} }, function (items) {
        delete items.MediaData[tabIdObject];
        chrome.storage.local.set({ MediaData: items.MediaData });
    });
});

//检查扩展名以及大小限制
function CheckExtension(ext, size) {
    for (let item of Options.Ext) {
        if (item.ext == ext) {
            if (item.size != 0 && size != null && size <= item.size * 1024) {
                return "break";
            } else if (item.state) {
                return true;
            } else {
                return "break";
            }
        }
    }
    return false;
}
//检查类型以及大小限制
function CheckType(dataType, dataSize) {
    for (let item of Options.Type) {
        let TypeSplit = dataType.split("/");
        let OptionSplit = item.type.split("/");
        if (OptionSplit[0] == TypeSplit[0] && (OptionSplit[1] == TypeSplit[1] || OptionSplit[1] == "*")) {
            if (item.size != 0 && dataSize != null && dataSize <= item.size * 1024) {
                return "break";
            } else if (item.state) {
                return true;
            } else {
                return "break";
            }
        }
    }
    return false;
}
//获取文件名
function GetFileName(url) {
    var str = url.split("?"); //url按？分开
    str = str[0].split("/"); //按/分开
    str = str[str.length - 1].split("#"); //按#分开
    return str[0].toLowerCase(); //得到带后缀的名字
}
//获取后缀名
function GetExt(FileName) {
    var str = FileName.split(".");
    if (str.length == 1) {
        return null;
    }
    var ext = str[str.length - 1];
    ext = ext.match(/[0-9a-zA-Z]*/);
    return ext[0].toLowerCase();
}
//获取Header属性的值
function getHeaderValue(name, data) {
    name = name.toLowerCase();
    if (data.responseHeaders == undefined) { return null; }
    for (let item of data.responseHeaders) {
        if (item.name.toLowerCase() == name) {
            if (name == "content-type") {
                return item.value.split(";")[0].toLowerCase();
            }
            return item.value.toLowerCase();
        }
    }
    return null;
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