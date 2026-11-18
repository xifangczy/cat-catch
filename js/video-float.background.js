/**
 * 视频浮窗 (js/video-float.js) 的后台部分
 * 视频浮窗显示在页面的 video 旁边 列出和该 video 同一个 frame 嗅探到的资源
 * 浮窗里的操作和 popup 资源列表的操作保持一致
 *
 * chrome 由 background.js 的 importScripts 加载 firefox 由 manifest 加载
 * background.js 只在标签的资源列表变化后调用 videoFloatNotify(tabId)
 * 浮窗发来的消息 和 浮窗提交的下载 都由本文件自己监听
 */
const VIDEO_FLOAT_MAX = 200;    // 单个frame最多交给浮窗的资源数量 优先保留清单 再保留最新的
// 浮窗使用的图标 页面里的 content-script 读取不到扩展文件 由后台转成 data URL 交给浮窗
const VIDEO_FLOAT_ICONS = [
    // 资源列表
    "icon.png", "copy.png", "parsing.png", "play.png", "download.svg", "aria2.png", "invoke.svg", "send.svg", "cat-down.png", "send2ffmpeg.svg", "regex.png",
    "copy-dark.png", "parsing-dark.png", "play-dark.png", "download-dark.svg", "aria2-dark.png", "invoke-dark.svg", "send-dark.svg", "cat-down-dark.png", "send2ffmpeg-dark.svg", "regex-dark.png",
    // 媒体控制
    "pause.svg", "volume.svg", "mute.svg", "loop.svg", "speed.svg", "screenshot.svg", "pip.svg", "fullscreen.svg",
    "pause-dark.svg", "volume-dark.svg", "mute-dark.svg", "loop-dark.svg", "speed-dark.svg", "screenshot-dark.svg", "pip-dark.svg", "fullscreen-dark.svg",
    // 二维码 MQTT
    "qrcode.png", "qrcode-dark.png", "mqtt.svg", "mqtt-dark.svg"
];
// 浮窗按需注入的库
const VIDEO_FLOAT_LIBS = {
    hls: ["lib/hls.min.js"],
    qrcode: ["lib/jquery.min.js", "lib/jquery.qrcode.min.js"]
};
let videoFloatIcons = undefined;
G.videoFloatDown = new Map();   // 视频浮窗提交的下载任务 下载失败时交给猫抓下载器

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
/**
 * 资源太多时 优先保留清单 (m3u8 mpd) 再保留最新的 保持原来的顺序
 * 信息流里分片很多 只留最新的话 前面那些视频的清单会被挤掉 浮窗就找不到它们的资源了
 */
function videoFloatLimit(list) {
    if (list.length <= VIDEO_FLOAT_MAX) { return list; }
    const keep = new Set(list.filter(item => isM3U8(item) || isMPD(item)).slice(-VIDEO_FLOAT_MAX / 2));
    for (let i = list.length - 1; i >= 0 && keep.size < VIDEO_FLOAT_MAX; i--) {
        keep.add(list[i]);
    }
    return list.filter(item => keep.has(item));
}
function videoFloatGetData(sender) {
    // 浮窗开关由 content-script 自己读取设置判断 这里只看扩展总开关
    const result = { enable: !!G.enable, total: 0, data: [] };
    // 决定浮窗显示哪些操作图标 和 popup 一致
    result.options = {
        aria2: !!G.enableAria2Rpc,
        invoke: !!G.invoke,
        send: !!(G.send2localManual || G.send2local),
        player: !isEmpty(G.Player),
        mqtt: !!G.mqttEnable,
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
    result.data = videoFloatLimit(list).map(function (item) {
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
            picture: isPicture(item),
            // 页面内解码得到的轨道 地址会随接收进度更新
            capture: item.ump ? { videoId: item.ump.videoId, received: item.ump.received, total: item.ump.total, complete: item.ump.complete, mime: item.ump.mime } : undefined
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
        // 下载前确认参数 交给浮窗显示 确认后再调用
        if (G.m3u8dlConfirm) {
            return { ok: true, confirm: m3u8dlArg, kind: "m3u8dl" };
        }
        return videoFloatProtocol(url, tabId);
    }
    if (G.m3u8AutoDown && data.parsing == "m3u8") {
        openParser(data, batch ? { autoDown: true, autoClose: true } : { autoDown: true });
        return { ok: true, message: i18n.hasSent };
    }
    const options = { url: data.url, filename: data.downFileName };
    if (!batch) { options.saveAs = G.saveAs; }
    if (data.method == "POST") { options.method = "POST"; }
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
        // 页面内解码得到的轨道 地址随接收进度更新 只按 requestId 匹配 使用最新的地址
        const info = cache.find(data => data.requestId == item.requestId && (data.url == item.url || data.ump));
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
        case "invoke": {
            const url = templates(G.invokeText, data);
            // 调用前确认参数 交给浮窗显示 确认后再调用
            if (G.invokeConfirm) {
                sendResponse({ ok: true, confirm: url, kind: "invoke" });
                return;
            }
            sendResponse(videoFloatProtocol(url, tabId));
            return;
        }
        // 浮窗里确认过参数后的调用 m3u8dl / 调用程序
        case "protocol": {
            const text = String(Message.text ?? "");
            if (!text) { break; }
            if (Message.kind == "m3u8dl") {
                sendResponse(videoFloatProtocol('m3u8dl:' + (G.m3u8dl == 1 ? videoFloatBase64(text) : text), tabId));
                return;
            }
            // 只允许调用设置里的协议 页面无法借此跳转到其他地址
            if (Message.kind == "invoke" && text.split(":")[0] == String(G.invokeText).split(":")[0]) {
                sendResponse(videoFloatProtocol(text, tabId));
                return;
            }
            break;
        }
        // 发送到 MQTT
        case "mqtt":
            videoFloatMQTT(data).then(function () {
                sendResponse({ ok: true, message: i18n.messageSentToMQTT });
            }).catch(function (error) {
                sendResponse({ ok: false, message: error?.message ? "MQTT: " + error.message : i18n.sendFailed });
            });
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

/**
 * 发送资源到 MQTT 服务器 配置和消息内容与 popup 的 MQTT 发送一致
 * popup 使用 lib/mqtt.min.js 该库无法在 service worker 中按需加载
 * 这里只需要 连接 + 发布一条消息 直接按 MQTT 3.1.1 (over WebSocket) 实现
 * @param {Object} data 资源对象
 * @returns {Promise}
 */
function videoFloatMQTT(data) {
    return new Promise(function (resolve, reject) {
        if (!G.mqttEnable) {
            reject(new Error("MQTT is not enabled"));
            return;
        }
        if (!G.mqttProtocol || !G.mqttBroker || !G.mqttPort || !G.mqttPath) {
            reject(new Error("MQTT connection parameters are missing"));
            return;
        }
        // 消息内容
        data.title = (data.title ?? "").slice(0, G.mqttTitleLength || 100);
        data.action = "media_found";
        const message = G.mqttDataFormat?.trim() ? templates(G.mqttDataFormat, data) : JSON.stringify(data);
        const topic = G.mqttTopic || "cat-catch/media";
        const qos = [0, 1, 2].includes(parseInt(G.mqttQos)) ? parseInt(G.mqttQos) : 0;

        // 报文 = 类型 + 剩余长度(变长) + 内容
        const encoder = new TextEncoder();
        const text = function (value) {
            const bytes = encoder.encode(value);
            return [bytes.length >> 8, bytes.length & 0xff, ...bytes];
        };
        const packet = function (type, body) {
            const length = [];
            let size = body.length;
            do {
                let byte = size % 128;
                size = Math.floor(size / 128);
                if (size > 0) { byte |= 0x80; }
                length.push(byte);
            } while (size > 0);
            return new Uint8Array([type, ...length, ...body]);
        };
        // CONNECT 协议名 MQTT 版本 4 清理会话 保持连接 60 秒 客户端ID 用户名 密码
        let flags = 0x02;
        const payload = text(`${G.mqttClientId || "cat-catch-client"}-${Math.random().toString(16).slice(2)}`);
        if (G.mqttUser) {
            flags |= 0x80;
            payload.push(...text(G.mqttUser));
            if (G.mqttPassword) {
                flags |= 0x40;
                payload.push(...text(G.mqttPassword));
            }
        }
        const connect = packet(0x10, [...text("MQTT"), 0x04, flags, 0x00, 0x3c, ...payload]);
        // PUBLISH QoS 大于 0 时带报文标识
        const publish = packet(0x30 | (qos << 1), [...text(topic), ...(qos ? [0x00, 0x01] : []), ...encoder.encode(message)]);

        let socket;
        let done = false;
        const finish = function (error) {
            if (done) { return; }
            done = true;
            clearTimeout(timer);
            try {
                // DISCONNECT
                !error && socket.send(new Uint8Array([0xe0, 0x00]));
                socket.close();
            } catch (e) { }
            error ? reject(error) : resolve();
        };
        const timer = setTimeout(function () { finish(new Error("connection timeout")); }, 10000);
        try {
            socket = new WebSocket(`${G.mqttProtocol}://${G.mqttBroker}:${G.mqttPort}${G.mqttPath}`, ["mqtt"]);
        } catch (e) {
            finish(e);
            return;
        }
        socket.binaryType = "arraybuffer";
        socket.onopen = function () { socket.send(connect); };
        socket.onerror = function () { finish(new Error("connection error")); };
        socket.onclose = function () { finish(new Error("connection closed")); };
        socket.onmessage = function (event) {
            const bytes = new Uint8Array(event.data);
            // 控制报文都很短 一帧里可能有多个
            for (let i = 0; i + 1 < bytes.length; i += 2 + bytes[i + 1]) {
                const type = bytes[i] >> 4;
                if (type == 2) {
                    // CONNACK 返回码不为 0 是服务器拒绝连接
                    if (bytes[i + 3] !== 0) {
                        finish(new Error("connection refused: " + bytes[i + 3]));
                        return;
                    }
                    socket.send(publish);
                    qos == 0 && finish();
                } else if (type == 4 && qos == 1) {
                    // PUBACK
                    finish();
                } else if (type == 5 && qos == 2) {
                    // PUBREC 回复 PUBREL
                    socket.send(new Uint8Array([0x62, 0x02, 0x00, 0x01]));
                } else if (type == 7 && qos == 2) {
                    // PUBCOMP
                    finish();
                }
            }
        };
    });
}

/**
 * 监听 视频浮窗 的消息
 */
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (chrome.runtime.lastError) { return; }
    // 初始化完成之前 由 background.js 的监听统一回复
    if (!G.initLocalComplete || !G.initSyncComplete) { return; }
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
    // 视频浮窗 按需把库注入到浮窗所在的 frame (和 content-script 同一个环境) 预览 m3u8 需要 hls.js 二维码需要 jquery.qrcode
    if (Message.Message == "videoFloatLib") {
        const files = VIDEO_FLOAT_LIBS[Message.lib];
        if (!files || !sender.tab || !chrome.scripting) {
            sendResponse(false);
            return true;
        }
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
            files: files
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
 * 视频浮窗提交的下载 出现服务器拒绝错误 调用猫抓下载器
 */
chrome.downloads.onChanged.addListener(function (item) {
    if (G.catDownload) { G.videoFloatDown.clear(); return; }
    const errorList = ["SERVER_BAD_CONTENT", "SERVER_UNAUTHORIZED", "SERVER_FORBIDDEN", "SERVER_UNREACHABLE", "SERVER_CROSS_ORIGIN_REDIRECT", "SERVER_FAILED", "NETWORK_FAILED"];
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
