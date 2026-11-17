/**
 * UMP 解码 (YouTube) 的后台部分
 * UMP 的响应体只有页面能读到 解码在页面内完成 (js/ump.js + catch-script/ump.js)
 * 这里负责 注入脚本 以及 把解出的轨道登记到资源列表
 *
 * 代码内开关 G.umpSupport 在 js/init.js
 * 关闭后 background.js 不加载本文件 设置页不显示对应的开关 整个功能不存在
 * 此时 js/ump.js js/ump.background.js catch-script/ump.js 三个文件可以不放进发行包
 * firefox 的后台无法下载页面的 blob 地址 不启用 manifest.firefox.json 没有加载本文件
 */
const UMP_SCRIPT_ID = "ump";
const UMP_MATCHES = ["*://*.youtube.com/*", "*://*.youtube-nocookie.com/*", "*://*.youtubekids.com/*"];

/**
 * 按设置注册 / 注销页面内的解码脚本
 * 播放器的第一个响应里带着各轨道的头部 必须赶在它之前注入 所以注册成 document_start 的脚本
 * firefox 的后台无法下载页面的 blob 地址 不启用
 */
function umpRegister() {
    if (G.isFirefox || !chrome.scripting?.registerContentScripts) { return; }
    if (!G.initSyncComplete) {
        setTimeout(umpRegister, 500);
        return;
    }
    // 排队执行 每次都在查询结果回来之后再读取设置 避免先后两次调用交错 把已经关闭的开关又注册上
    umpRegisterQueue = umpRegisterQueue.then(async function () {
        const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [UMP_SCRIPT_ID] });
        const want = !!(G.enable && G.umpDecode);
        if (want && !scripts.length) {
            await chrome.scripting.registerContentScripts([{
                id: UMP_SCRIPT_ID,
                matches: UMP_MATCHES,
                js: ["js/ump.js", "catch-script/ump.js"],
                runAt: "document_start",
                world: "MAIN",
                allFrames: true
            }]);
        } else if (!want && scripts.length) {
            await chrome.scripting.unregisterContentScripts({ ids: [UMP_SCRIPT_ID] });
        }
    }).catch(function (error) {
        console.log(error);
    });
}
let umpRegisterQueue = Promise.resolve();
umpRegister();
chrome.storage.onChanged.addListener(function (changes, namespace) {
    // init.js 的监听先执行 G 已经是新值
    if (namespace == "sync" && (changes.umpDecode || changes.enable)) {
        setTimeout(umpRegister, 0);
    }
});

/**
 * 有视频浮窗 (js/video-float.background.js) 时 通知它资源列表有变化
 * @param {Number} tabId 标签ID
 */
function umpNotifyFloat(tabId) {
    typeof videoFloatNotify == "function" && videoFloatNotify(tabId);
}

/**
 * 登记 / 更新 / 移除 页面内解码得到的轨道
 * 轨道在资源列表里和其他资源一样 地址是页面的 blob 随着播放器请求的数据增多 轨道变完整 地址也随之更新
 * @param {Object} Message 消息 key: 轨道标识 remove: 是否移除 其余为轨道信息
 * @param {Object} sender 消息发送者
 */
function umpMedia(Message, sender) {
    const tabId = sender.tab?.id;
    if (!tabId || tabId <= 0 || !G.enable || !G.umpDecode || cacheData.init) { return; }
    const blockUrlFlag = G.blockUrlSet.has(tabId);
    if (G.blockUrlWhite ? !blockUrlFlag : blockUrlFlag) { return; }

    const requestId = "ump:" + String(Message.key).slice(0, 300);
    const find = () => Array.isArray(cacheData[tabId]) ? cacheData[tabId].findIndex(item => item.requestId == requestId) : -1;
    if (Message.remove) {
        const index = find();
        if (index == -1) { return; }
        cacheData[tabId].splice(index, 1);
        save(tabId);
        umpNotifyFloat(tabId);
        chrome.runtime.sendMessage({ Message: "popupRemoveData", data: { requestId: requestId, tabId: tabId } }, function () {
            if (chrome.runtime.lastError) { return; }
        });
        return;
    }
    // 只接受发送者页面自己的 blob 地址
    let origin = sender.origin;
    if (!origin) {
        try { origin = new URL(sender.url).origin; } catch (e) { return; }
    }
    if (typeof Message.url != "string" || !Message.url.startsWith(`blob:${origin}/`)) { return; }

    chrome.tabs.get(tabId, function (webInfo) {
        if (chrome.runtime.lastError) { return; }
        cacheData[tabId] ??= [];
        const index = find();
        const old = cacheData[tabId][index];
        // 资源数量已经到上限时不再登记新的轨道
        if (!old && cacheData[tabId].length > G.maxLength) { return; }
        const mime = String(Message.mime ?? "").slice(0, 120);
        const info = {
            name: String(Message.name ?? "").slice(0, 200),
            url: Message.url,
            size: Number(Message.size) || 0,
            ext: String(Message.ext ?? "").replace(/\W/g, "").slice(0, 8) || "mp4",
            type: mime.split(";")[0].trim() || undefined,
            tabId: tabId,
            frameId: sender.frameId ?? 0,
            isRegex: false,
            requestId: requestId,
            initiator: sender.url ?? webInfo?.url,
            requestHeaders: {},
            getTime: old?.getTime ?? Date.now(),
            title: webInfo?.title ?? "NULL",
            favIconUrl: webInfo?.favIconUrl,
            webUrl: webInfo?.url,
            ump: {
                videoId: String(Message.videoId ?? "").slice(0, 32),
                itag: Number(Message.itag) || 0,
                mime: mime,
                received: Number(Message.received) || 0,
                total: Number(Message.total) || 0,
                complete: !!Message.complete
            }
        };
        // 通知 popup 新轨道添加一行 已有的轨道更新大小 / 进度 / 地址
        if (old) {
            cacheData[tabId][index] = info;
        } else {
            cacheData[tabId].push(info);
        }
        chrome.runtime.sendMessage({ Message: old ? "popupUpdateData" : "popupAddData", data: info }, function () {
            if (chrome.runtime.lastError) { return; }
        });
        umpNotifyFloat(tabId);
        save(tabId);
    });
}

/**
 * frame 重新载入后 它之前登记的轨道已经失效 从资源列表移除
 * @param {Number} tabId 标签ID
 * @param {Number} frameId 重新载入的frame 主框架重新载入时整个标签的轨道都失效
 */
function umpClear(tabId, frameId) {
    const list = cacheData[tabId];
    if (!Array.isArray(list)) { return; }
    const keep = list.filter(item => !item.ump || (frameId != 0 && (item.frameId ?? 0) != frameId));
    if (keep.length == list.length) { return; }
    // 通知 popup 移除对应的行
    for (const item of list) {
        if (keep.includes(item)) { continue; }
        chrome.runtime.sendMessage({ Message: "popupRemoveData", data: { requestId: item.requestId, tabId: tabId } }, function () {
            if (chrome.runtime.lastError) { return; }
        });
    }
    cacheData[tabId] = keep;
    save(tabId);
    umpNotifyFloat(tabId);
}

/**
 * 监听 页面内的解码脚本 (catch-script/ump.js) 经 content-script 转发的消息
 */
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (chrome.runtime.lastError) { return; }
    if (Message.Message != "umpMedia" || !G.initLocalComplete || !G.initSyncComplete) { return; }
    umpMedia(Message, sender);
    sendResponse("ok");
    return true;
});

/**
 * frame 重新载入 清理它之前登记的轨道
 * 本文件在 background.js 的开头加载 这个监听先于 background.js 的自动清理执行
 * 资源列表被自动清理之后就找不到轨道了 无法通知 popup 移除对应的行 所以顺序不能反
 */
chrome.webNavigation.onCommitted.addListener(function (details) {
    if (details.tabId <= 0) { return; }
    umpClear(details.tabId, details.frameId);
});
