importScripts("init.js");

// 保持 Service Worker 活跃，这似乎是BUG?
// https://bugs.chromium.org/p/chromium/issues/detail?id=1271154
// https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/70003493#70003493
chrome.webNavigation.onBeforeNavigate.addListener(function () {
    console.log('Miao~');
});

//响应开始(用来检测媒体文件地址大小等信息)
chrome.webRequest.onResponseStarted.addListener(
    function (data) {
        findMedia(data);
    }, { urls: ["<all_urls>"] }, ["responseHeaders"]
);

function findMedia(data) {
    if (Options.Ext === undefined ||
        Options.Debug === undefined ||
        Options.AutoClear === undefined ||
        Options.TitleName === undefined ||
        Options.MoreType === undefined
    ) { return; }
    //网页标题
    var title = 'Null';
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
    var Disposition = getHeaderValue('Content-Disposition', data);
    //获取网页标题
    if (data.tabId !== -1) {
        chrome.tabs.get(data.tabId, function (info) {
            if (info !== undefined) {
                title = info.title;
                webInfo = info;
            }
        });
    }
    //调试模式
    if (Options.Debug) {
        console.log(data);
    }
    //屏蔽Youtube
    if (data.url.indexOf(".youtube.com/") !== -1 || data.url.indexOf(".googlevideo.com/") !== -1) {
        return;
    }

    if (ext == null) {
        //判断MIME类型
        if (Options.MoreType && contentType != null && contentType.toLowerCase() == 'application/octet-stream') {
            filter = true;
        }
        if (!filter && contentType != null) {
            var contentType = contentType.split("/")[0].toLowerCase();
            if (contentType == "audio" || contentType == "video") {
                filter = true;
            }
        }
    } else {
        filter = CheckExtension(ext, size);
    }

    //查找附件
    if (!filter && Disposition) {
        var res = Disposition.match(/filename="(.*?)"/);
        if (res && res[1]) {
            name = decodeURIComponent(res[1]);  //编码
            name = GetFileName(name);
            ext = GetExt(name);
            filter = CheckExtension(ext, 0);
        }
    }

    if (filter) {
        chrome.storage.local.get('MediaData', function (items) {
            if (items.MediaData === undefined) {
                items.MediaData = new Array();
            }
            //大于500条 清空 避免卡死
            if (items.MediaData.length > Options.AutoClear) {
                chrome.storage.local.clear("MediaData");
                return;
            }
            //查重
            for (var i = 0; i < items.MediaData.length; i++) {
                if (items.MediaData[i].url == data.url) {
                    return;
                }
            }
            //添加数据
            var info = {
                name: name,
                url: data.url,
                size: Math.round(100 * size / 1024 / 1024) / 100,
                ext: ext,
                type: contentType,
                tabid: data.tabId,
                title: title,
                webInfo: webInfo
            };
            items.MediaData.push(info);
            chrome.storage.local.set({ "MediaData": items.MediaData });
            chrome.action.setBadgeText({ text: items.MediaData.length.toString() });
            chrome.action.setTitle({ title: "抓到 " + items.MediaData.length.toString() + " 条资源" });
            chrome.runtime.sendMessage(info);
        });
    }
}

chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if(Message == 'RefreshOption'){
        SetOptions();
    }
});

//检查扩展名以及大小限制
function CheckExtension(ext, size) {
    var result = false;
    Options.Ext.forEach(function (item) {
        if (item.ext.toLowerCase() == ext) {
            if (item.size != 0 && size != null && size <= item.size * 1024) {
                return;
            } else {
                result = true;
                return;
            }
        }
    });
    return result;
}

//获取文件名
function GetFileName(url) {
    var str = url.split("?");//url按？分开
    str = str[0].split("/");//按/分开
    str = str[str.length - 1].split("#");//按#分开
    return str[0].toLowerCase();//得到带后缀的名字
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
    for (var i = 0; i < data.responseHeaders.length; i++) {
        if (data.responseHeaders[i].name.toLowerCase() == name) {
            return data.responseHeaders[i].value.toLowerCase();
        }
    }
    return null;
}