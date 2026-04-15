// url 参数解析
const params = new URL(location.href).searchParams;
let _m3u8Url = params.get("url");   // m3u8的url地址
const _requestHeaders = params.get("requestHeaders");   // 自定义请求头
const _initiator = params.get("initiator"); // referer 备用
const _title = params.get("title"); // 来源网页标题
const _fileName = params.get("filename");   // 自定义文件名
let tsAddArg = params.get("tsAddArg");  // 自定义 切片参数
let autoReferer = params.get("autoReferer");    // 是否已经自动调整 referer
const tabId = parseInt(params.get("tabid"));    // 资源所在的标签页ID 用来获取密钥
const key = params.get("key");  // 自定义密钥
let autoDown = params.get("autoDown");  //是否自动下载
const autoClose = params.get("autoClose");  // 下载完是否关闭页面
let retryCount = parseInt(params.get("retryCount"));  // 重试次数

const _isMaster = params.get("isMaster");   // 是否为主任务

let currentTabId = 0;   // 本页面tab Id
let currentIndex = 0;   // 本页面Index

/*
*   popup 合并多个m3u8 需要提交以下参数 ffmpeg才能判断文件是否添加完毕
*   _ffmpeg 参数为ffmpeg动作 例如: "merge"为合并
*   _quantity: m3u8数量
*   _taskId: 唯一任务ID
**/
const _ffmpeg = params.get("ffmpeg");   // 是否发送到 ffmpeg
const _quantity = params.get("quantity");   // 同时下载的总数
const _taskId = params.get("taskId");   // 任务id

let isSendFfmpeg = false;   // 是否发送到ffmpeg

// 修改当前标签下的所有xhr的Referer 修改完成 运行init函数
const requestHeaders = JSONparse(_requestHeaders);
// 当前资源数据
let _data = {
    url: _m3u8Url,
    title: _title ?? "NULL",
};
setRequestHeaders(requestHeaders, () => {
    chrome.tabs.getCurrent(function (tab) {
        currentIndex = tab.index;
        currentTabId = tab.id;
        if (tabId && tabId != -1) {
            chrome.runtime.sendMessage(chrome.runtime.id, { Message: "getData", tabId: tabId }, (data) => {
                if (chrome.runtime.lastError) {
                    awaitG(init);
                    return;
                }
                if (data) {
                    data = data.find(item => item.url == _m3u8Url);
                    _data = data ?? _data;
                }
                awaitG(init);
            });
        } else {
            awaitG(init);
        }
    });
});

// 默认设置
const allOption = {
    addParam: false,
    fold: !G.isMobile,
    m3u8dlRE: false,
};
/* m3u8 解析工具 */
const hls = new Hls({
    enableWorker: false,
    debug: false
});  // hls.js 对象
const _fragments = []; // 储存切片对象
const keyContent = new Map(); // 储存key的内容
const initData = new Map(); // 储存map的url
const decryptor = new AESDecryptor(); // 解密工具 来自hls.js 分离出来的
let skipDecrypt = false; // 是否跳过解密
let possibleKeys = new Set();   // 储存疑似 密钥
let downId = 0; // chrome下载api 回调id
let currentLevel = -1;  // 当前Level
let estimateFileSize = 0; // 估算的文件最终大小

let downDuration = 0; // 下载媒体得时长


let fileStream = undefined; // 流式下载文件输出流
const downSet = {};   // 下载时 储存设置

/* 录制相关 */
let recorder = false; // 开关
let recorderLast = "";  // 最后下载的url


/* mp4 转码工具 */
let transmuxer = undefined;

/* DOM */
const $fileSize = $("#fileSize");   // 下载文件大小 进度
const $progress = $("#progress");   // 下载进度
const $fileDuration = $("#fileDuration");   // 下载总时长
const $m3u8dlArg = $("#m3u8dlArg"); // m3u8DL 参数
const $media_file = $("#media_file");   // 切片列表

/* 框架ffmpeg */
let iframeFFmpeg = null;
let iframeFFmpegReady = false;
let iframeFFmpegReadyRetryCount = 0;

// 自动合并
let autoMergeTimer = null;

/**
 * 初始化函数，界面默认配置 loadSource载入 m3u8 url
 */
function init() {
    // 获取页面DOM
    if (tabId && tabId != -1) {
        chrome.tabs.sendMessage(parseInt(tabId), { Message: "getPage" }, { frameId: 0 }, function (result) {
            if (chrome.runtime.lastError) { return; }
            _data.pageDOM = new DOMParser().parseFromString(result, 'text/html');
        });
    }
    loadCSS();

    // 隐藏firefox 不支持的功能
    G.isFirefox && $(".firefoxHide").each(function () { $(this).hide(); });

    // 读取本地配置并装载
    chrome.storage.local.get(allOption, function (items) {
        for (let key in items) {
            if (key == "fold") {
                items[key] ? $("details").attr("open", "") : $("details").removeAttr("open");
                continue;
            }
            const $dom = $(`#${key}`);
            $dom.length && $dom.prop("checked", items[key]);
        }
    });

    // 转载默认配置
    $("#thread").val(G.M3u8Thread);
    $("#mp4").prop("checked", G.M3u8Mp4);
    $("#onlyAudio").prop("checked", G.M3u8OnlyAudio);
    $("#skipDecrypt").prop("checked", G.M3u8SkipDecrypt);
    $("#StreamSaver").prop("checked", G.M3u8StreamSaver);
    $("#ffmpeg").prop("checked", G.M3u8Ffmpeg);
    $("#autoClose").prop("checked", autoClose && autoClose == 1 ? true : G.M3u8AutoClose);

    // 发送到ffmpeg取消边下边存设置
    _ffmpeg && $("#StreamSaver").prop("checked", false);

    // 存在密钥参数 自动填写密钥
    key && $("#customKey").val(key);

    // 解码 切片URL参数
    if (tsAddArg != null) {
        tsAddArg = decodeURIComponent(tsAddArg);
        $("#tsAddArg").html(i18n.restoreGetParameters);
    }

    // 填充重试次数
    retryCount && $("#retryCount").val(retryCount);

    if (isEmpty(_m3u8Url)) {
        $("#loading").hide(); $("#m3u8Custom").show();

        $("#uploadM3U8").change(function (event) {
            const file = event.target.files[0];
            const reader = new FileReader();
            reader.onload = () => {
                $("#m3u8Text").val(reader.result)
            };
            reader.readAsText(file);
        });

        $("#parse").click(async function () {
            let m3u8Text = $("#m3u8Text").val().trim();
            let baseUrl = $("#baseUrl").val().trim();
            let referer = $("#referer").val().trim();
            if (referer) {
                if (referer.startsWith("http")) {
                    setRequestHeaders({ referer: referer });
                } else {
                    setRequestHeaders(JSONparse(referer));
                }
            }

            if (m3u8Text == "") { return; }

            // // 批量生成切片链接 解析range标签
            if (m3u8Text.includes('${range:')) {
                const rangePattern = /\$\{range:(\d+)-(\d+|\?),?(\d+)?\}/;
                const match = m3u8Text.match(rangePattern);
                if (!match) { return; }
                const start = parseInt(match[1]);
                let end = match[2];
                const padding = match[3] ? parseInt(match[3]) : 0;
                const urls = [];
                $("#m3u8Text").val(i18n.loadingData);

                if (end === "?") {
                    let i = start;
                    while (true) {
                        let number = i.toString();
                        if (padding > 0) {
                            number = number.padStart(padding, '0');
                        }
                        const url = m3u8Text.replace(rangePattern, number);
                        try {
                            const response = await fetch(url, { method: 'HEAD' });
                            if (!response.ok) {
                                break;
                            }
                            urls.push(url);
                        } catch (error) { break; }

                        i++;
                        // 防止死循环 最大9999个
                        if (urls.length >= 9999) { break; }
                    }
                } else {
                    end = parseInt(end);
                    for (let i = start; i <= end; i++) {
                        let number = i.toString();
                        if (padding > 0) {
                            number = number.padStart(padding, '0');
                        }
                        urls.push(m3u8Text.replace(rangePattern, number));
                    }
                }
                if (urls && urls.length) {
                    m3u8Text = urls.join("\n\n");
                    $("#m3u8Text").val(m3u8Text);
                } else {
                    $("#m3u8Text").val("");
                    alert(i18n.m3u8Error);
                    return;
                }
            }

            // 只有一个链接 后缀为m3u8 直接解析
            if (m3u8Text.split("\n").length == 1 && (GetExt(m3u8Text) == "m3u8" || GetExt(m3u8Text) == "txt")) {
                let url = "m3u8.html?url=" + encodeURIComponent(m3u8Text);
                if (referer) {
                    if (referer.startsWith("http")) {
                        url += "&requestHeaders=" + encodeURIComponent(JSON.stringify({ referer: referer }));
                    } else {
                        url += "&requestHeaders=" + encodeURIComponent(referer);
                    }
                }
                chrome.tabs.update({ url: url });
                return;
            }

            // 如果不是 m3u8 文件内容 转换为 m3u8 文件内容
            if (!m3u8Text.includes("#EXTM3U")) {
                // ts列表链接 转 m3u8
                const tsList = m3u8Text.split("\n");
                m3u8Text = "#EXTM3U\n";
                m3u8Text += "#EXT-X-TARGETDURATION:233\n";
                for (let ts of tsList) {
                    if (ts) {
                        m3u8Text += "#EXTINF:1\n";
                        m3u8Text += ts + "\n";
                    }
                }
                m3u8Text += "#EXT-X-ENDLIST";
            }
            if (baseUrl != "") {
                m3u8Text = addBashUrl(baseUrl, m3u8Text);
            }
            autoReferer = true; // 不自动调整referer

            _m3u8Url = URL.createObjectURL(new Blob([new TextEncoder("utf-8").encode(m3u8Text)]));
            hls.loadSource(_m3u8Url);
            $("#m3u8Custom").hide();
        });
        // 从mpd解析器读取数据
        const getId = parseInt(params.get("getId"));
        if (getId) {
            chrome.tabs.sendMessage(getId, "getM3u8", function (result) {
                $("#m3u8Text").val(result.m3u8Content);
                $("#parse").click();
                $("#info").html(result.mediaInfo);
            });
        }
    } else {
        hls.loadSource(_m3u8Url);
    }

    G.saveAs && $("#saveAs").prop("checked", true);
}

const channel = new BroadcastChannel('m3u8Channel');
channel.onmessage = (event) => {
    const data = event.data;
    if (data.Message == "mergeData" && data.data && _isMaster == 1 && _taskId == data.data.taskId) {
        data.data.tabId = currentTabId;
        createIframeFFmpeg(data.data);
        channel.postMessage({ Message: "mergeDataReceived", taskId: data.data.taskId });
    }
    if (data.Message == "mergeDataReceived" && _isMaster == 0 && _taskId == data.taskId) {
        setTimeout(() => {
            $progress.html(i18n.sendFfmpeg);
            $("#autoClose").prop("checked") && closeTab();
        }, 1000);
    }
};


// 监听 MANIFEST_LOADED 装载解析的m3u8 URL
hls.on(Hls.Events.MANIFEST_LOADED, function (event, data) {
    $("#m3u8_url").attr("href", data.url).html(data.url);
});

// 监听 MANIFEST_PARSED m3u8解析完成
hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
    // console.log(data);
    $("#m3u8").show(); $("#loading").hide();
    const more = (data.levels.length + data.audioTracks.length + data.subtitleTracks.length >= 2);
    const dataMerge = {};

    // 多个视频
    if (more && data.levels.length) {
        $("#more_m3u8").show();
        let maxBandwidth = 0;
        for (let index in data.levels) {
            const item = data.levels[index];
            let [name, url] = getNewUrl(item);
            maxBandwidth = Math.max(maxBandwidth, item.attrs.BANDWIDTH);
            if (maxBandwidth == item.attrs.BANDWIDTH) { dataMerge.video = item; }   // 默选择码率最大的
            const html = $(`<div class="block">
                    <div><label class="more_class"><input type="radio" name="more_video" ${maxBandwidth == item.attrs.BANDWIDTH ? "checked" : ""}/>${item.attrs.RESOLUTION ? i18n.resolution + ":" + item.attrs.RESOLUTION : ""}${item.attrs.BANDWIDTH ? " | " + i18n.bitrate + ":" + (parseInt(item.attrs.BANDWIDTH / 1000) + " Kbps") : ""}</label></div>
                    <a href="${url}">${name}</a>
                    <button id="parser" type="button">${i18n.parser}</button>
                    <button class="sendFfmpeg" type="button">${i18n.sendFfmpeg}</button>
                </div>`);
            html.find(".sendFfmpeg").click(function () {
                let newUrl = url + `&autoDown=1`;
                newUrl += `&ffmpeg=addFile`;
                chrome.tabs.create({ url: newUrl, index: currentIndex + 1, active: false });
            });
            html.find("#parser").click(function () {
                chrome.tabs.update({ url: url });
            });
            html.find(".more_class").click(function (e) {
                dataMerge.video = item;
            });
            $("#next_m3u8").append(html);
        }
    }
    // 多个音频
    if (more && data.audioTracks.length) {
        $("#more_audio").show();
        for (let index in data.audioTracks) {
            const item = data.audioTracks[index];
            // 音频信息没有m3u8文件 使用groupId去寻找
            if (item.url == "") {
                let groupId = item.groupId;
                for (let item2 of data.levels) {
                    if (item2.audioGroupIds.includes(groupId)) {
                        item.url = item2.uri;
                        break;
                    }
                }
            }
            let [name, url] = getNewUrl(item);
            if (index == 0) { dataMerge.audio = item; }     // 默选择第一个
            const html = $(`<div class="block">
                    <div><label><input type="radio" name="more_audio" ${index == 0 ? "checked" : ""}/>${item.name ? item.name : ""} | ${item.lang ? item.lang : ""} | ${item.groupId ? item.groupId : ""}</label></div>
                    <a href="${url}">${name}</a>
                    <button id="parser" type="button">${i18n.parser}</button>
                    <button class="sendFfmpeg" type="button">${i18n.sendFfmpeg}</button>
                </div>`);
            html.find(".sendFfmpeg").click(function () {
                let newUrl = url + `&autoDown=1`;
                newUrl += `&ffmpeg=addFile`;
                chrome.tabs.create({ url: newUrl, index: currentIndex + 1, active: false });
            });
            html.find("#parser").click(function () {
                chrome.tabs.update({ url: url });
            });
            html.find("label").click(function () {
                dataMerge.video = item;
            });
            $("#next_audio").append(html);
        }
    }
    // 多个字幕
    if (more && data.subtitleTracks.length) {
        $("#more_subtitle").show();
        for (let item of data.subtitleTracks) {
            const [name, url] = getNewUrl(item);
            const html = `<div class="block">
                    <div>${item.name ? item.name : ""} | ${item.lang ? item.lang : ""}</div>
                    <a href="${url}">${name}</a>
                </div>`;
            $("#next_subtitle").append(html);
        }
    }

    // 合并按钮
    if (dataMerge.audio && dataMerge.video) {
        $("#more_options").show();
        $("#more_options_merge").click(function () {
            const taskId = Date.parse(new Date());
            if (dataMerge.audio && dataMerge.video) {
                const data = {
                    title: _title,
                    downFileName: _fileName,
                    tabId: tabId,
                    initiator: _initiator,
                    requestHeaders: requestHeaders,
                }
                const options = { ffmpeg: "merge", quantity: 2, taskId: taskId, autoDown: true, autoClose: true };
                openParser({ ...data, url: dataMerge.audio.url }, { ...options, isMaster: true });
                openParser({ ...data, url: dataMerge.video.url }, { ...options, isMaster: false });
            }
        });
    } else {
        $("#more_m3u8 input").hide();
        $("#more_audio input").hide();
    }


    // 有下一级m3u8 停止解析
    if (more) {
        autoDown && highlight();
        $("#m3u8").hide();
        // $("button").hide();
        return;
    }
    function getNewUrl(item) {
        const rawUrl = item.uri ?? item.url;
        const name = GetFile(rawUrl);
        const params = new URLSearchParams(window.location.search);
        params.set('url', rawUrl);
        params.delete('autoDown');
        params.delete('ffmpeg');
        const newUrl = `/m3u8.html?${params.toString()}`;
        return [name, newUrl];
    }
});

// 监听 LEVEL_LOADED 所有切片载入完成
hls.on(Hls.Events.LEVEL_LOADED, function (event, data) {
    // console.log(data);
    parseTs(data.details);  // 提取Ts链接
    // 获取视频信息
    if ($(".videoInfo #info").html() == "") {
        let video = document.createElement("video");
        video.muted = true;
        video.autoplay = false;
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
            video && video.play();
        });
        video.oncanplay = function () {
            hls.detachMedia(video);
            video.remove();
            video = null;
        }
        video.onerror = function () {
            hls.stopLoad();
            hls.detachMedia(video);
            video.remove();
            video = null;
        }
    }
    currentLevel = data.level;
});

// 监听 ERROR m3u8解析错误
hls.on(Hls.Events.ERROR, function (event, data) {
    autoDown && highlight();
    console.log(data);
    if (data.details == "bufferStalledError") {
        hls.stopLoad();
    }
    if (data.type == "mediaError" && data.details == "fragParsingError") {
        if (data.error.message == "No ADTS header found in AAC PES" && !hls.adtsTips) {
            $("#tips").append("<b>" + i18n.ADTSerror + "</b>");
            hls.stopLoad();
            hls.destroy();
            hls.adtsTips = true; // 标记已经提示过
        }
        $("#play").hide();
        return;
    }
    if (data.type == "otherError" && data.error.message.includes("remux") && hls.skipTheError) {
        return;
    }
    $("#loading").show();
    $("#loading .optionBox").html(`${i18n.m3u8Error}<button id="setRequestHeadersError">${i18n.setRequestHeaders}</button>`);

    /**
     * 下载出错 如果在录制中 停止下载 保存文件
     * 检查重试次数 重新下载
     */
    if (retryCount) {
        recorder && stopRecorder();
        const recorderRetryCount = parseInt($("#retryCount").val());
        const url = new URL(location.href);
        const params = new URLSearchParams(url.search);
        params.set("retryCount", recorderRetryCount ? recorderRetryCount - 1 : 0);
        params.set("autoDown", 1);
        $progress.html(i18n.retryCount + ": " + recorderRetryCount);
        setTimeout(() => {
            window.location.href = window.location.origin + window.location.pathname + "?" + params.toString();
        }, 3000);
        return;
    }
    if (recorder) {
        stopRecorder();
        autoReferer = true;
        return;
    }

    // 尝试添加 / 删除请求头
    if (data.type == "networkError" && data.details != "keyLoadError") {
        if (requestHeaders.referer) {
            params.delete("requestHeaders");
        } else if (_initiator) {
            params.delete("requestHeaders");
            let origin = null;
            try { origin = new URL(_initiator).origin; } catch (e) { }
            params.append("requestHeaders", JSON.stringify({ "referer": _initiator, "origin": origin ?? _initiator }));
        }
        const href = window.location.origin + window.location.pathname + "?" + params.toString();
        if (!autoReferer && window.location.href != href) {
            window.location.href = href + "&autoReferer=1";
        }
    }
});

// 监听 BUFFER_CREATED 获得第一个切片数据
hls.on(Hls.Events.BUFFER_CREATED, function (event, data) {
    // console.log(data);
    const info = $(".videoInfo #info");
    if (data.tracks && info.html() == "") {
        if (data.tracks.audiovideo) {
            if (data.tracks.audiovideo?.metadata) {
                info.append(` ${i18n.resolution}:${data.tracks.audiovideo.metadata.width} x ${data.tracks.audiovideo.metadata.height}`);
            }
            if (data.tracks.audiovideo.codec && data.tracks.audiovideo.codec.startsWith("hvc1")) {
                info.append(` <b>${i18n.hevcTip}</b>`);
            }
            return;
        }
        !data.tracks.audio && info.append(` (${i18n.noAudio})`);
        !data.tracks.video && info.append(` (${i18n.noVideo})`);
        if (data.tracks.video?.metadata) {
            info.append(` ${i18n.resolution}:${data.tracks.video.metadata.width} x ${data.tracks.video.metadata.height}`);
        }
        if (hls.levels[currentLevel]?.bitrate) {
            info.append(` ${i18n.bitrate}:${parseInt(hls.levels[currentLevel].bitrate / 1000)} Kbps`);
        }
        if (data.tracks?.video?.codec && data.tracks.video.codec.startsWith("hvc1")) {
            info.append(` <b>${i18n.hevcTip}</b>`);
        }
    }
});

/* 来自 监听 LEVEL_LOADED 提取所有ts链接 进一步处理 */
function parseTs(data) {
    // console.log(data);
    let isEncrypted = false;
    _fragments.splice(0);   // 清空 防止直播HLS无限添加
    /* 获取 m3u8文件原始内容 MANIFEST_PARSED也能获取但偶尔会为空(BUG?) 放在LEVEL_LOADED获取更安全*/
    document.querySelector("#m3u8Content").value = data.m3u8;

    // #EXT-X-DISCONTINUITY
    let discontinuity = { start: 0, cc: 0 };
    data.endCC && $("#cc").show();

    for (let i in data.fragments) {
        i = parseInt(i);
        /*
        * 少部分网站下载ts必须带有参数才能正常下载
        * 添加m3u8地址的参数
        */
        if (tsAddArg != null) {
            const arg = new RegExp("([^?]*)").exec(data.fragments[i].url);
            if (arg && arg[0]) {
                data.fragments[i].url = arg[0] + (tsAddArg ? "?" + tsAddArg : "");
            }
        }
        /* 
        * 查看是否加密 下载key
        * firefox CSP政策不允许在script-src 使用blob 不能直接调用hls.js下载好的密钥
        */
        if (data.fragments[i].encrypted && data.fragments[i].decryptdata) {
            isEncrypted = true;
            // 填入key内容
            Object.defineProperty(data.fragments[i].decryptdata, "keyContent", {
                get: function () { return keyContent.get(this.uri); },
                configurable: true
            });
            // 如果不存在key 开始下载
            if (!keyContent.get(data.fragments[i].decryptdata.uri)) {
                // 占位 等待fetch获取key
                keyContent.set(data.fragments[i].decryptdata.uri, true);
                // 下载key
                fetch(data.fragments[i].decryptdata.uri)
                    .then(response => response.arrayBuffer())
                    .then(function (buffer) {
                        if (buffer.byteLength == 16) {
                            keyContent.set(data.fragments[i].decryptdata.uri, buffer); // 储存密钥
                            showKeyInfo(buffer, data.fragments[i].decryptdata, i);
                            autoMerge();
                            return;
                        }
                        showKeyInfo(false, data.fragments[i].decryptdata, i);
                    })
                    .catch(function (error) {
                        console.log(error);
                        showKeyInfo(false, data.fragments[i].decryptdata, i);
                    });
            }
        }
        // 处理 #EXT-X-MAP 标签
        let initSegment = null;
        if (data.fragments[i].initSegment && !initData.get(data.fragments[i].initSegment.url)) {
            initSegment = data.fragments[i].initSegment;
            initData.set(data.fragments[i].initSegment.url, true);

            const options = {};
            if (data.fragments[i].initSegment.byteRange && data.fragments[i].initSegment.byteRange.length == 2) {
                const [start, end] = data.fragments[i].initSegment.byteRange;
                options.headers = {
                    'Range': `bytes=${start}-${end - 1}`
                };
            }
            fetch(data.fragments[i].initSegment.url, options)
                .then(response => response.arrayBuffer())
                .then(function (buffer) {
                    initData.set(data.fragments[i].initSegment.url, buffer);
                    autoMerge();
                }).catch(function (error) { console.log(error); });
            $("#tips").append('EXT-X-MAP: <input type="text" class="keyUrl" value="' + data.fragments[i].initSegment.url + '" spellcheck="false" readonly="readonly">');
        }

        if (data.live && data.fragments[i].initSegment) {
            initSegment = data.fragments[i].initSegment;
        }

        // #EXT-X-DISCONTINUITY
        if (i === data.fragments.length - 1 || data.fragments[i].cc !== data.fragments[i + 1].cc) {
            if (discontinuity.start == 0) {
                $('#cc').append(`<option value="0">${i18n.selectAll}</option>`);
            }
            $('#cc').append(`<option value="${+discontinuity.start + 1}-${i + 1}">playlist: ${data.fragments[i].cc}</option>`);
            discontinuity.start = i + 1;
        }
        _fragments.push({
            url: data.fragments[i].url,
            decryptdata: data.fragments[i].decryptdata,
            encrypted: data.fragments[i].encrypted,
            duration: data.fragments[i].duration,
            initSegment: initSegment,
            sn: data.fragments[i].sn,
            cc: data.fragments[i].cc,
            live: data.live,
            byteRange: data.fragments[i].byteRange,
            selected: true,
        });
    }
    writeText(_fragments);   // 写入ts链接到列表

    /* 
    * 录制直播
    * 直播是持续更新的m3u8 
    * recorderLast保存下载的最后一个sn 以便下次更新时判断从哪个切片开始继续下载
    */
    if (recorder) {
        let indexLast = _fragments.findIndex((fragment) => {
            return fragment.sn == recorderLast;
        });
        recorderLast = _fragments[_fragments.length - 1].sn;
        downloadNew(indexLast + 1);
    }


    // 提示加密
    isEncrypted && $("#count").append(` (${i18n.encryptedHLS})`);

    // SAMPLE 加密算法
    if (data.m3u8.includes("#EXT-X-KEY:METHOD=SAMPLE-AES-CTR")) {
        $("#count").append(' <b>' + i18n.encryptedSAMPLE + '</b>');
    }

    // 范围下载所需数据
    $("#rangeStart").attr("max", _fragments.length);
    $("#rangeEnd").attr("max", _fragments.length).val(_fragments.length);
    $m3u8dlArg.val(getM3u8DlArg());

    if (data.live) {
        autoDown && highlight();
        $("#recorder").show();
        $(".videoInfo #info").html(i18n.liveHLS);
    } else {
        estimateSize(_fragments); // 估算文件大小
        $("#count").append(i18n("m3u8Info", [_fragments.length, secToTime(data.totalduration)]));
        $("#sendFfmpeg").show();
        $("#retryCount").parent().hide();
    }
    if (!_fragments.some(fragment => fragment.initSegment) && autoDown) {
        autoMerge();
    }

    if (tabId && tabId != -1) {
        chrome.webNavigation.getAllFrames({ tabId: tabId }, function (frames) {
            if (!frames) { return; }
            frames.forEach(function (frame) {
                chrome.tabs.sendMessage(tabId, { Message: "getKey" }, { frameId: frame.frameId }, function (result) {
                    if (chrome.runtime.lastError || !result || result.length == 0) { return; }
                    const maybeKey = $("#maybeKey select");
                    for (let item of result) {
                        if (possibleKeys.has(item)) { continue; }
                        possibleKeys.add(item);
                        maybeKey.append(`<option value="${item}">${item}</option>`);
                    }
                    $("#maybeKey").show();
                    maybeKey.change(function () {
                        $("#customKey").val(this.value != "tips" ? this.value : "");
                        $m3u8dlArg.val(getM3u8DlArg());
                    });
                });
            });
        });
    }
    function showKeyInfo(buffer, decryptdata, i) {
        $("#tips").append(i18n.keyAddress + ': <input type="text" value="' + decryptdata.uri + '" spellcheck="false" readonly="readonly" class="keyUrl">');
        if (buffer) {
            $("#tips").append(`
                <div class="key flex">
                    <div class="method">${i18n.encryptionAlgorithm}: <input type="text" value="${decryptdata.method ? decryptdata.method : "NONE"}" spellcheck="false" readonly="readonly"></div>
                    <div>${i18n.key}(Hex): <input type="text" value="${ArrayBufferToHexString(buffer)}" spellcheck="false" readonly="readonly"></div>
                    <div>${i18n.key}(Base64): <input type="text" value="${ArrayBufferToBase64(buffer)}" spellcheck="false" readonly="readonly"></div>
                </div>`);
        } else {
            $("#tips").append(`
                <div class="key flex">
                    <div class="method">${i18n.encryptionAlgorithm}: <input type="text" value="${decryptdata.method ? decryptdata.method : "NONE"}" spellcheck="false" readonly="readonly"></div>
                    <div>${i18n.key}(Hex): <input type="text" value="${i18n.keyDownloadFailed}" spellcheck="false" readonly="readonly"></div>
                </div>`);
        }
        // 如果是默认iv 则不显示
        let iv = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, i + 1]).toString();
        let iv2 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, i]).toString();
        let _iv = decryptdata.iv.toString();
        if (_iv != iv && _iv != iv2) {
            iv = "0x" + ArrayBufferToHexString(decryptdata.iv.buffer);
            $("#tips").append('<div class="key flex"><div>Offset(IV): <input type="text" value="' + iv + '" spellcheck="false" readonly="readonly" class="offset"></div></div>');
        }
    }
}
/**
 * 估算整个视频大小
 * 获取3个切片大小 取平均值 * 切片数量
 * @param {Array} url ts对象数组
 */
async function estimateSize(fragments) {
    if (!fragments || fragments.length === 0) return;

    const samplesToCheck = Math.min(5, fragments.length);
    let totalSize = 0;
    let successfulFetches = 0;

    const promises = [];

    for (let i = 0; i < samplesToCheck; i++) {
        promises.push(
            fetch(fragments[i].url, {
                method: "HEAD",
                headers: requestHeaders,
            }).then(function (response) {
                if (response.ok) {
                    const contentLength = response.headers.get("Content-Length");
                    if (contentLength) {
                        totalSize += parseInt(contentLength);
                        successfulFetches++;
                    }
                }
            }).catch(function (error) {
                console.log(`Error estimating file size for sample ${i}:`, error);
            })
        );
    }

    await Promise.all(promises);

    if (successfulFetches > 0) {
        estimateFileSize = totalSize / successfulFetches * fragments.length;
        $("#estimateFileSize").append(` ${i18n.estimateSize}: ${byteToSize(estimateFileSize)}`);
    }
}
/**************************** 监听 / 按钮绑定 ****************************/
// 标题
let progressTimer = setInterval(() => {
    if ($progress.html()) {
        document.title = $progress.html();
    }
}, 1000);
// 监听下载事件 修改提示
chrome.downloads.onChanged.addListener(function (downloadDelta) {
    if (!downloadDelta.state) { return; }
    if (downloadDelta.state.current == "complete" && downId == downloadDelta.id) {
        $progress.html(i18n.SavePrompt);
        $("#autoClose").prop("checked") && closeTab();
    }
});
// 打开目录
$(".openDir").click(function () {
    downId ? chrome.downloads.show(downId) : chrome.downloads.showDefaultFolder();
});
// 下载ts列表
$("#downText").click(function () {
    const filename = GetFileName(_m3u8Url) + '.txt';
    let text = "data:text/plain,";
    _fragments.forEach(function (item) {
        text += item.url + "\n";
    });
    if (G.isFirefox) {
        downloadDataURL(text, filename);
        return;
    }
    chrome.downloads.download({
        url: text,
        filename: filename
    });
});

// 原始m3u8
$("#originalM3U8").click(function () {
    showTab("#m3u8Content");
});
// 切片列表
$("#getTs").click(function () {
    showTab("#mediaList");
});
// 在线ffmpeg
$("#onlineFFmpeg").click(function () {
    !iframeFFmpeg && createIframeFFmpeg();
    showTab("#iframeBox");
});


// 播放m3u8
$("#play").click(function () {
    if ($(this).data("switch") == "on") {
        showTab("#video");
        hls.attachMedia($("#video")[0]);
        $(this).html(i18n.close).data("switch", "off");
        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
            video.play();
        });
        return;
    }
    hls.detachMedia($("#video")[0]);
    $(this).html(i18n.play).data("switch", "on");
    showTab("#mediaList");
});

// 调用m3u8DL下载
$("#m3u8DL").click(function () {
    if (_m3u8Url.startsWith("blob:")) {
        alert(i18n.blobM3u8DLError);
        return;
    }
    const m3u8dlArg = getM3u8DlArg();
    $m3u8dlArg.val(m3u8dlArg);
    navigator.clipboard.writeText(m3u8dlArg);
    const m3u8dl = 'm3u8dl:' + (G.m3u8dl == 1 ? Base64.encode(m3u8dlArg) : m3u8dlArg);
    if (m3u8dl.length >= 2046) {
        alert(i18n.M3U8DLparameterLong);
    }
    chrome.tabs.update({ url: m3u8dl });
});

// 折叠按钮
const $popupBox = $("#openM3U8DLBox, #openKeyBox, #moreFeaturesBox");
$("#openM3U8DL, #openKey, #moreFeatures").click(function (e) {
    e.stopPropagation();
    const $box = $(`#${e.target.id}Box`);
    if ($box.is(":visible")) {
        $box.hide();
        return;
    }
    $popupBox.hide();
    $box.show();

    // 点击其他区域关闭窗口
    $(document).off("click.closeBox").on("click.closeBox", function () {
        hideAllBoxes();
    });
});
$popupBox.click(function (e) {
    e.target.id != "setRequestHeaders" && e.stopPropagation();
});
function hideAllBoxes() {
    $popupBox.hide();
    $(document).off("click.closeBox");
}

// 调用自定义协议
$("#invoke").click(function () {
    const url = getTemplates(G.invokeText);
    chrome.tabs.update({ url: url });
});
// 显示m3u8DL命令
$("#setM3u8dl").click(function () {
    $m3u8dlArg.val(getM3u8DlArg());
    $m3u8dlArg.slideToggle();
});
// 设置载入参数
$("#addParam").click(function () {
    $m3u8dlArg.val(getM3u8DlArg());
});
$("input").click(function () {
    $m3u8dlArg.val(getM3u8DlArg());
});
$("input").keyup(function () {
    $m3u8dlArg.val(getM3u8DlArg());
});
// 只要音频
$("#onlyAudio").on("change", function () {
    if (transmuxer) {
        $(this).prop("checked", !$(this).prop("checked"));
        alert(i18n.runningCannotChangeSettings);
        return;
    }
    if ($(this).prop("checked") && !$("#mp4").prop("checked") && !$("#ffmpeg").prop("checked")) {
        $("#mp4").click();
    }
});
$("#mp4").on("change", function () {
    if (transmuxer) {
        $(this).prop("checked", !$(this).prop("checked"));
        alert(i18n.runningCannotChangeSettings);
        return;
    }
    $("#ffmpeg").prop("checked") && $("#ffmpeg").click();
    if (!$(this).prop("checked") && !$("#ffmpeg").prop("checked") && $("#onlyAudio").prop("checked")) {
        $("#onlyAudio").click();
    }
});
$("#StreamSaver").on("change", function () {
    if (transmuxer) {
        $(this).prop("checked", !$(this).prop("checked"));
        alert(i18n.runningCannotChangeSettings);
        return;
    }
    if ($(this).prop("checked")) {
        $progress.html(`<b>${i18n.streamSaverTip}</b>`);
        $("#ffmpeg").prop("checked") && $("#ffmpeg").click();
        $("#saveAs").prop("checked", false);
    }
});
$("#ffmpeg").on("change", function () {
    if (transmuxer) {
        $(this).prop("checked", !$(this).prop("checked"));
        alert(i18n.runningCannotChangeSettings);
        return;
    }
    if ($(this).prop("checked")) {
        $("#mp4").prop("checked", false);
        $("#StreamSaver").prop("checked", false);
        $("#saveAs").prop("checked", false);
    }
});
// 范围 线程数 滚轮调节
let debounce2 = undefined;
$("#rangeStart, #rangeEnd, #thread").on("wheel", function (event) {
    $(this).blur();
    let number = $(this).val();
    number = parseInt(number ? number : 1);
    number = event.originalEvent.wheelDelta < 0 ? number - 1 : number + 1;
    if (number < 1 || number > $(this).attr("max")) {
        return false;
    }
    $(this).val(number);
    $m3u8dlArg.val(getM3u8DlArg());
    if (this.id == "thread") {
        clearTimeout(debounce2);
        debounce2 = setTimeout(() => {
            chrome.storage.local.set({ thread: number });
        }, 500);
    }
    return false;
});
$("#rangeStart, #rangeEnd, #thread").keyup(function () {
    if ($(this).val() == '') {
        switch (this.id) {
            case 'rangeStart':
                $(this).val(1);
                break;
            case 'rangeEnd':
                $(this).val(_fragments.length);
                break;
            case 'thread':
                $(this).val(6);
                break;
        }
        return;
    }
});



// 储存设置
$("#addParam").on("change", function () {
    allOption.addParam = $("#addParam").prop("checked");
    chrome.storage.local.set(allOption);
});
// 上传key
$("#uploadKeyFile").change(function () {
    let fileReader = new FileReader();
    fileReader.onload = function () {
        if (this.result.byteLength != 16) {
            $progress.html(`<b>${i18n.incorrectKey}</b>`);
            return;
        }
        $("#customKey").val(ArrayBufferToBase64(this.result));
        $m3u8dlArg.val(getM3u8DlArg());
    };
    let file = $("#uploadKeyFile").prop('files')[0];
    fileReader.readAsArrayBuffer(file);
});
$("#uploadKey").click(function () {
    $("#uploadKeyFile").click();
});
function stopRecorder() {
    $("#recorder").html(i18n.recordLive).data("switch", "on");
    recorder = false;
    fileStream.close();
    buttonState("#mergeTs", true);
    $progress.html(i18n.stopRecording);
    initDownload();
}
// 录制直播
$("#recorder").click(function () {
    if ($(this).data("switch") == "on") {
        initDownload(); // 初始化下载变量
        recorder = true;

        // 只允许流式下载
        $("#StreamSaver").prop("checked", true);
        $("#ffmpeg").prop("checked", false);
        fileStream = createStreamSaver(_fragments[0].url);

        $(this).html(fileStream ? i18n.stopDownload : i18n.download).data("switch", "off");
        $progress.html(i18n.waitingForLiveData);
        retryCount = parseInt($("#retryCount").val());
        return;
    }
    stopRecorder();
});
// 在线下载合并ts
$("#mergeTs").click(async function () {
    initDownload(); // 初始化下载变量
    // 设定起始序号
    let start = $("#rangeStart").val();
    if (start.includes(":")) {
        start = timeToIndex(start);
    } else {
        start = parseInt(start);
        start = start ? start - 1 : 0;
    }
    // 设定结束序号
    let end = $("#rangeEnd").val();
    if (end.includes(":")) {
        end = timeToIndex(end);
    } else {
        end = parseInt(end);
        end = end ? end - 1 : _fragments.length - 1;
    }
    // 检查序号
    if (start == -1 || end == -1) {
        $progress.html(`<b>${i18n.sNumError}</b>`);
        return;
    }
    if (start > end) {
        $progress.html(`<b>${i18n.startGTend}</b>`);
        return;
    }
    if (start > _fragments.length - 1 || end > _fragments.length - 1) {
        $progress.html(`<b>${i18n("sNumMax", [_fragments.length])}</b>`);
        return;
    }
    /* 设定自定义密钥和IV */
    let customKey = $("#customKey").val().trim();
    if (customKey) {
        if (isHexKey(customKey)) {
            customKey = HexStringToArrayBuffer(customKey);
        } else if (customKey.length == 24 && customKey.slice(-2) == "==") {
            customKey = Base64ToArrayBuffer(customKey);
            // console.log(customKey);
        } else if (/^http[s]*:\/\/.+/i.test(customKey)) {
            let flag = false;
            await $.ajax({
                url: customKey,
                xhrFields: { responseType: "arraybuffer" }
            }).fail(function () {
                flag = true;
            }).done(function (responseData) {
                customKey = responseData;
                $("#customKey").val(ArrayBufferToBase64(customKey));
                $m3u8dlArg.val(getM3u8DlArg());
            });
            if (flag) {
                $progress.html(`<b>${i18n.keyDownloadFailed}</b>`);
                return;
            }
        } else {
            $progress.html(`<b>${i18n.incorrectKey}</b>`);
            return;
        }
        for (let i in _fragments) {
            _fragments[i].encrypted = true;
            _fragments[i].decryptdata = {};
            if (!keyContent.get("customKey")) {
                keyContent.set("customKey", true);
            }
            Object.defineProperty(_fragments[i].decryptdata, "keyContent", {
                get: function () { return keyContent.get("customKey"); },
                configurable: true
            });
        }
        keyContent.forEach(function (value, key) {
            keyContent.set(key, customKey);
        });
    }
    // 自定义IV
    let customIV = $("#customIV").val().trim();
    if (customIV) {
        customIV = StringToUint8Array(customIV);
        for (let i in _fragments) {
            _fragments[i].decryptdata.iv = customIV;
        }
    }
    skipDecrypt = $("#skipDecrypt").prop("checked");    // 是否跳过解密

    // 估算检查文件大小
    if (!$("#StreamSaver").prop("checked") && estimateFileSize > G.chromeLimitSize && confirm(i18n("fileTooLargeStream", ["2G"]))) {
        $("#StreamSaver").prop("checked", true);
    }

    // 流式下载
    if ($("#StreamSaver").prop("checked")) {
        fileStream = createStreamSaver(_fragments[0].url);
        downloadNew();
        $("#ffmpeg").prop("checked", false);
        $("#saveAs").prop("checked", false);
        $("#stopDownload").show();
        return;
    }
    $("#stopDownload").show();

    // 提前打开ffmpeg
    // _ffmpeg && createIframeFFmpeg();
    if (_ffmpeg || $("#ffmpeg").prop("checked")) {
        _isMaster == 1 && createIframeFFmpeg();
    }

    downloadNew();
});

// 添加ts 参数
$("#tsAddArg").click(function () {
    if (tsAddArg != null) {
        window.location.href = window.location.href.replace(/&tsAddArg=[^&]*/g, "");
        return;
    }
    //获取m3u8参数
    let m3u8Arg = new RegExp("\\.m3u8\\?([^\n]*)").exec(_m3u8Url);
    if (m3u8Arg) {
        m3u8Arg = m3u8Arg[1];
    }
    const arg = window.prompt(i18n.addParameters, m3u8Arg ?? "");
    if (arg != null) {
        window.location.href += "&tsAddArg=" + encodeURIComponent(arg);
    }
});


// 确认范围
$("#rangeConfirm").click(function () {
    let rangeStart = $("#rangeStart").val();
    let rangeEnd = $("#rangeEnd").val();
    if (rangeStart.includes(":")) {
        rangeStart = timeToIndex(rangeStart);
    } else {
        rangeStart = parseInt(rangeStart);
        rangeStart = rangeStart ? rangeStart - 1 : 0;
    }
    if (rangeEnd.includes(":")) {
        rangeEnd = timeToIndex(rangeEnd);
    } else {
        rangeEnd = parseInt(rangeEnd);
        rangeEnd = rangeEnd ? rangeEnd - 1 : _fragments.length - 1;
    }
    if (rangeStart == -1 || rangeEnd == -1) {
        $progress.html(`<b>${i18n.sNumError}</b>`);
        return;
    }
    if (rangeStart > rangeEnd) {
        $progress.html(`<b>${i18n.startGTend}</b>`);
        return;
    }
    if (rangeStart > _fragments.length - 1 || rangeEnd > _fragments.length - 1) {
        $progress.html(`<b>${i18n("sNumMax", [_fragments.length])}</b>`);
        return;
    }
    $m3u8dlArg.val(getM3u8DlArg());

    // 便利ts列表 在不再范围的切片上取消选中状态
    const list = document.querySelector("#mediaList");
    list.querySelectorAll(".media-item").forEach((item, index) => {
        if (index >= rangeStart && index <= rangeEnd) {
            item.classList.add("selected");
            _fragments[index].selected = true;
        } else {
            item.classList.remove("selected");
            _fragments[index].selected = false;
        }
    });
});

// 设置请求头
$(document).on("click", "#setRequestHeaders, #setRequestHeadersError", function () {
    const arg = window.prompt(i18n.addParameters, JSON.stringify(requestHeaders));
    if (arg != null) {
        params.delete("requestHeaders");
        params.append("requestHeaders", arg);
        window.location.href = window.location.origin + window.location.pathname + "?" + params.toString();
    }
});

// #EXT-X-DISCONTINUITY 范围选择
$('#cc').change(function () {
    if (this.value == "0") {
        $("#rangeStart").val(1);
        $("#rangeEnd").val(_fragments.length);
        return;
    }
    const range = this.value.split("-");
    $("#rangeStart").val(+range[0]);
    $("#rangeEnd").val(+range[1]);
});

// 折叠
$("details summary").click(function () {
    allOption.fold = !$("details")[0].open;
    chrome.storage.local.set(allOption);
});

// 发送到在线ffmpeg
$("#sendFfmpeg").click(function () {
    isSendFfmpeg = true;
    $("#StreamSaver").prop("checked", false);
    $("#mergeTs").click();
});

// 监听 正则过滤 回车
$("#regular").keyup(function (event) {
    if (event.key === "Enter") {
        const list = document.querySelector("#mediaList");
        const reg = new RegExp($("#regular").val());
        list.querySelectorAll(".media-item").forEach((item, index) => {
            if (reg.test(_fragments[index].url)) {
                item.classList.add("selected");
                _fragments[index].selected = true;
            } else {
                item.classList.remove("selected");
                _fragments[index].selected = false;
            }
        });
    }
});

// 反选
$("#invertSelection").click(function () {
    const list = document.querySelector("#mediaList");
    list.querySelectorAll(".media-item").forEach((item, index) => {
        if (item.classList.contains("selected")) {
            item.classList.remove("selected");
            _fragments[index].selected = false;
        } else {
            item.classList.add("selected");
            _fragments[index].selected = true;
        }
    });
});


// 找到真密钥
$("#searchingForRealKey").click(function () {
    const keys = $('#maybeKey option').map(function () {
        return $(this).val();
    }).get();
    keys.shift();   // 删除提示

    let iv = _fragments[0].decryptdata?.iv;
    if (!iv) {
        iv = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, _fragments[0].sn]);
    }

    const customIV = $("#customIV").val().trim();
    if (customIV) {
        iv = StringToUint8Array(customIV);
    }
    $("#searchingForRealKey").html(i18n.verifying);

    const check = (buffer) => {
        const uint8Array = new Uint8Array(buffer);
        // fmp4
        if ((uint8Array[4] === 0x73 || uint8Array[4] === 0x66) && uint8Array[5] === 0x74 && uint8Array[6] === 0x79 && uint8Array[7] === 0x70) {
            return true;
        }
        // moof
        if (uint8Array[4] === 0x6d && uint8Array[5] === 0x6f && uint8Array[6] === 0x6f && uint8Array[7] === 0x66) {
            return true;
        }
        // webm
        if (uint8Array[0] === 0x1a && uint8Array[1] === 0x45 && uint8Array[2] === 0xdf && uint8Array[3] === 0xa3) {
            return true;
        }
        // mp3 ID3
        if (uint8Array[0] === 0x49 && uint8Array[1] === 0x44 && uint8Array[2] === 0x33) {
            return true;
        }
        // mp3 (MPEG audio frame header)
        if (uint8Array[0] === 0xff && (uint8Array[1] & 0xe0) === 0xe0) {
            return true;
        }
        // aac (ADTS header)
        if (uint8Array[0] === 0xff && (uint8Array[1] & 0xf0) === 0xf0) {
            return true;
        }
        // ts
        const maxCheckLength = Math.min(512, uint8Array.length);
        for (let i = 0; i < maxCheckLength; i++) {
            if (uint8Array[i] === 0x47 && (i + 188) < uint8Array.length && uint8Array[i + 188] === 0x47) {
                return true;
            }
        }
    }
    const decryptor = new AESDecryptor();
    fetch(_fragments[0].url)
        .then(response => response.arrayBuffer())
        .then(function (buffer) {
            if (check(buffer)) {
                $("#searchingForRealKey").html(i18n.searchingForRealKey);
                alert(i18n.noKeyIsRequired);
                return;
            }
            for (let key of keys) {
                try {
                    decryptor.expandKey(Base64ToArrayBuffer(key));
                    const testBuffer = decryptor.decrypt(buffer, 0, iv.buffer, true);
                    // 检查是否解密成功
                    if (check(testBuffer)) {
                        if (!prompt(i18n.searchingForRealKey, key)) { continue; }
                        $("#searchingForRealKey").html(i18n.searchingForRealKey);
                        $("#customKey").val(key);
                        $('#maybeKey select').val(key);
                        $m3u8dlArg.val(getM3u8DlArg());
                        return;
                    }
                } catch (error) {
                    console.log(error);
                }
            };
            $("#searchingForRealKey").html(i18n.realKeyNotFound);
        }).catch(function (error) {
            $("#searchingForRealKey").html(i18n.dataFetchFailed);
            console.log(error);
        });
});

/**
 * 调用新下载器的方法
 * @param {number} start 下载范围 开始索引
 * @param {number} end 下载范围 结束索引
 */
function downloadNew(start = 0, end = _fragments.length) {

    $("#video").hide();
    hls.detachMedia($("#video")[0]);

    // 避免重复下载
    buttonState("#mergeTs", false);

    // 切片下载器
    // 过滤掉未选择的 _fragments
    const selectedFragments = recorder ? _fragments.slice(start) : _fragments.filter(fragment => fragment.selected);
    const down = new Downloader(selectedFragments, parseInt($("#thread").val()));
    $progress.html(`${down.success}/${down.total}`);

    // 储存切片所需 DOM 提高性能
    const itemDOM = new Map();

    // 解密函数
    down.setDecrypt(function (buffer, fragment) {
        return new Promise(function (resolve, reject) {
            // 跳过解密 录制模式 切片不存在加密 跳过解密 直接返回
            if (skipDecrypt || recorder || !fragment.encrypted || !fragment.decryptdata) {
                /**
                 * (!fragment.live || fragment.index == 0)
                 * 如果是直接下载直播流 只有第一个切片才会添加MAP 否则每个切片都添加MAP视频无法播放。
                 */
                if (fragment.initSegment && (!fragment.live || fragment.index == 0)) {
                    buffer = addInitSegmentData(buffer, fragment.initSegment);
                }
                resolve(buffer);
                return;
            }
            // 载入密钥 开始解密
            try {
                decryptor.expandKey(fragment.decryptdata.keyContent);
                const iv = fragment.decryptdata.iv ?? new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, fragment.sn]);
                buffer = decryptor.decrypt(buffer, 0, iv.buffer, true);
            } catch (e) {
                $progress.html(i18n.decryptionError + e);
                down.stop();
                buttonState("#mergeTs", true);
                console.log(e);
                reject(e);
                return;
            }
            // 如果存在MAP切片 把MAP整合进buffer
            // MAP切片不需要解密
            if (fragment.initSegment) {
                buffer = addInitSegmentData(buffer, fragment.initSegment);
            }
            resolve(buffer);
        });
    });
    // 转码函数 如果存在down.mapTag 跳过转码
    if (downSet.mp4 && !down.mapTag) {
        let tempBuffer = null;
        let head = true;
        transmuxer = new muxjs.mp4.Transmuxer({ keepOriginalTimestamps: false, remux: !downSet.onlyAudio });    // mux.js 对象
        transmuxer.on('data', function (segment) {
            if (downSet.onlyAudio && segment.type != "audio") { return; }
            if (head) {
                let data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
                data.set(segment.initSegment, 0);
                data.set(segment.data, segment.initSegment.byteLength);
                tempBuffer = fixFileDuration(data, down.totalDuration);
                return;
            }
            tempBuffer = segment.data;
        });
        down.setTranscode(async function (buffer, fragment) {
            head = fragment.index == 0;
            transmuxer.push(new Uint8Array(buffer));
            transmuxer.flush();
            return tempBuffer ? tempBuffer.buffer : buffer;
        });
    }
    // 下载错误
    down.on('downloadError', function (fragment, error) {
        $("#ForceDownload").show(); // 强制下载
        $("#errorDownload").show(); // 重下所有失败项

        const item = itemDOM.get(fragment.index);
        item.root.classList.add("error");
        item.retryBtn.style.display = "inline";
        item.stopBtn.style.display = "none";
        item.root.scrollIntoView({ behavior: "smooth", block: "center" });

    });
    // 切片下载完成
    down.on('completed', function (buffer, fragment) {
        if (recorder) {
            $progress.html(i18n.waitingForLiveData);
            downDuration += fragment.duration;
            $fileDuration.html(i18n.recordingDuration + ":" + secToTime(downDuration));
            return;
        }

        const item = itemDOM.get(fragment.index);
        item.root.style.setProperty("--progress", "100%");
        item.stopBtn.style.display = "none";
        item.retryBtn.style.display = "none";
        item.copyBtn.style.display = "inline";

        $progress.html(`${down.success}/${down.total}`);
        $fileSize.html(i18n.downloaded + ":" + byteToSize(down.buffersize));
        $fileDuration.html(i18n.downloadedVideoLength + ":" + secToTime(down.duration));
    });
    // 全部下载完成
    down.on('allCompleted', async function (buffer) {
        if (recorder) { return; }
        $("#stopDownload").hide();
        if (fileStream) {
            fileStream.close();
            fileStream = undefined;
            $progress.html(i18n.downloadComplete);
        } else {
            mergeTsNew(down);
        }
        transmuxer?.off && transmuxer.off('data');
        transmuxer = undefined;

        $("#ForceDownload").hide(); // 强制下载
        $("#errorDownload").hide(); // 重下所有失败项

        buttonState("#mergeTs", true);
    });
    // 单个项目下载进度
    let lastEmitted = Date.now();
    down.on('itemProgress', function (fragment, state, receivedLength, contentLength) {
        if (Date.now() - lastEmitted >= 233) {
            itemDOM.get(fragment.index).root.style.setProperty("--progress", (receivedLength / contentLength * 100).toFixed(2) + "%");
            lastEmitted = Date.now();
        }
    });
    if (fileStream) {
        down.on('sequentialPush', function (buffer) {
            fileStream && fileStream.write(new Uint8Array(buffer));
        });
    }
    down.on('error', function (error) {
        console.log(error);
    });
    down.on('stop', function (fragment, error) {
        console.log(error);
    });

    // 缓存操作DOM
    down.fragments.forEach((fragment) => {
        const root = document.querySelector(`#media-item-${fragment.sn}`);
        if (!root) { return; }

        // 停止按钮
        const stopBtn = document.createElement("img");
        stopBtn.classList.add("icon", "stop");
        stopBtn.src = "img/stop.svg";
        stopBtn.title = i18n.stopDownload;
        stopBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            root.classList.remove("error");
            down.stop(fragment.index);
            down.downloader();
            stopBtn.style.display = "none";
            retryBtn.style.display = "inline";
        });
        root.appendChild(stopBtn);

        // 重下按钮
        const retryBtn = document.createElement("img");
        retryBtn.classList.add("icon", "retry", "hide");
        retryBtn.src = "img/retry.svg";
        retryBtn.title = i18n.retryDownload;
        retryBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            root.classList.remove("error");
            down.downloader(fragment);
            stopBtn.style.display = "inline";
            retryBtn.style.display = "none";
        });
        root.appendChild(retryBtn);

        // 隐藏复制按钮
        const copyBtn = root.querySelector(".copy");
        copyBtn.style.display = "none";

        itemDOM.set(fragment.index, {
            root: document.querySelector(`#media-item-${fragment.sn}`),
            stopBtn: stopBtn,
            retryBtn: retryBtn,
            copyBtn: copyBtn
        });
    });

    // 开始下载
    down.start();

    // 强制下载
    $("#ForceDownload").off("click").click(function () {
        mergeTsNew(down);
    });

    // 重新下载
    $("#errorDownload").off("click").click(function () {
        down.errorItem.forEach(function (fragment, index) {
            setTimeout(() => {
                itemDOM.get(fragment.index)?.retryBtn.click();
            }, index * 233);
        });
    });

    // 停止下载
    $("#stopDownload").off("click").click(function () {
        down.stop();
        setTimeout(() => {
            fileStream && fileStream.close();
            $progress.html(i18n.stopDownload);
            $("#stopDownload").hide();
            buttonState("#mergeTs", true);
            $fileSize.html("");
            $fileDuration.html("");
            initDownload();
        }, 1000);
    });
}
function addInitSegmentData(buffer, initSegment) {
    let initSegmentData = initData.get(initSegment.url);
    if (!initSegmentData && initSegment.data) {
        initSegmentData = initSegment.data.buffer;
    }
    const initLength = initSegmentData.byteLength;
    const newData = new Uint8Array(initLength + buffer.byteLength);
    newData.set(new Uint8Array(initSegmentData), 0);
    newData.set(new Uint8Array(buffer), initLength);
    return newData.buffer;
}

// 合并下载
function mergeTsNew(down) {
    $progress.html(i18n.merging);

    // 创建Blob
    const fileBlob = new Blob(down.buffer, { type: down.transcode ? "video/mp4" : "video/MP2T" });

    // 默认后缀
    let ext = (down.mapTag && !down.mapTag.startsWith("data:") ? down.mapTag : down.fragments[0].url).split("/").pop();
    ext = ext.split("?").shift();
    ext = ext.split(".").pop();
    ext = ext ? ext : "ts";
    ext = down.transcode ? "mp4" : ext;

    let fileName = "";
    const customFilename = $('#customFilename').val().trim();
    if (customFilename) {
        fileName = customFilename;
    } else if (_fileName) {
        fileName = _fileName;
    } else {
        fileName = GetFileName(_m3u8Url);
    }
    // 删除目录
    // fileName = fileName.split("/");
    // fileName = fileName.length > 1 ? fileName.pop() : fileName.join("");
    // 删除后缀
    let originalExt = null;
    if (/\.[a-zA-Z0-9]{1,4}$/.test(fileName)) {
        fileName = fileName.split(".");
        originalExt = fileName.pop();
        fileName = fileName.join(".");
    }
    // 发送到ffmpeg
    if ($("#ffmpeg").prop("checked") || _ffmpeg || isSendFfmpeg) {
        /**
         * 大于1.8G 不使用ffmpeg直接下载
         * chrome每个进程限制2G内存 处理2G视频可能导致超过限制。1.8G是安全值。
         * firefox 不受影响
         */
        if (!G.isFirefox && fileBlob.size > G.chromeLimitSize) {
            $progress.html(i18n("fileTooLarge", ["2G"]));
            apiDownload(fileBlob, fileName, ext);
            down.destroy();
            return;
        }
        if (customFilename && originalExt) {
            fileName += "." + originalExt;
        } else if (ext != "mp4" && ext != "mp3") {
            fileName = fileName + ".mp4";
        } else {
            fileName = fileName + "." + ext;
        }
        let action = $("#onlyAudio").prop("checked") ? "onlyAudio" : "transcode";
        if (_ffmpeg) {
            action = _ffmpeg;
        }
        if (isSendFfmpeg) {
            action = "addFile";
            isSendFfmpeg = false;
        }
        const data = {
            Message: "catCatchFFmpeg",
            action: action,
            files: [{ data: G.isFirefox ? fileBlob : URL.createObjectURL(fileBlob), name: `memory${new Date().getTime()}.${ext}` }],
            title: fileName,
            output: fileName,
            name: "memory" + new Date().getTime() + "." + ext,
            active: G.isMobile || !autoDown,
            tabId: currentTabId,
        };
        if (_quantity) {
            data.quantity = parseInt(_quantity);
        }
        if (_taskId) {
            data.taskId = _taskId;
        }

        // 使用iframe传输
        if (G.iframeFFmpeg) {

            // 转数据结构
            const fileData = {
                ...data,
                data: fileBlob,
                version: G.ffmpegConfig.version
            };

            if (_ffmpeg == "merge" && _isMaster != 1) {
                channel.postMessage({
                    Message: "mergeData",
                    data: fileData
                });
                return;
            }

            document.querySelector("#onlineFFmpeg").style.display = "block";
            createIframeFFmpeg(fileData);
            showTab("#iframeBox");
            return;
        }
        chrome.runtime.sendMessage(data, function (response) {
            if (!chrome.runtime?.lastError && response && response == "ok") {
                $progress.html(i18n.sendFfmpeg);
                buttonState("#mergeTs", true);
                return;
            }
            apiDownload(fileBlob, fileName, ext);
            down.destroy();
            return;
        });
    } else {
        apiDownload(fileBlob, fileName, ext);
        down.destroy();
    }
}
function apiDownload(fileBlob, fileName, ext) {
    chrome.downloads.download({
        url: URL.createObjectURL(fileBlob),
        filename: fileName + "." + ext,
        saveAs: $("#saveAs").prop("checked")
    }, function (downloadId) {
        if (downloadId) {
            downId = downloadId;
            $(".openDir").show();
            buttonState("#mergeTs", true);
        } else if (chrome.runtime?.lastError?.message && chrome.runtime.lastError.message == 'Invalid filename') {
            apiDownload(fileBlob, stringModify(fileName), ext);
            return;
        }
    });
}

// 初始化下载变量
function initDownload() {
    $fileSize.html("");
    downDuration = 0;   // 初始化时长
    $fileDuration.html("");
    recorderLast = "";  // 录制最后下载的url
    fileStream = undefined; // 流式下载 文件流
    // 转码工具初始化
    transmuxer = undefined;
    // 避免下载中途 更改设置 暂时储存下载配置
    downSet.mp4 = $("#mp4").prop("checked");
    downSet.onlyAudio = $("#onlyAudio").prop("checked");

    // 恢复切片UI状态
    const list = document.querySelector("#mediaList");
    list.querySelectorAll(".media-item").forEach((item, index) => {
        item.style.setProperty("--progress", "0%");
        item.classList.remove("error");
        item.querySelector(".copy").style.display = "inline";
        item.querySelector(".stop")?.remove();
        item.querySelector(".retry")?.remove();
    });
}

// 流式下载
function createStreamSaver(url) {
    streamSaver.mitm = G.streamSaverConfig.url;
    const ext = $("#mp4").prop("checked") ? "mp4" : GetExt(url);
    return streamSaver.createWriteStream(`${GetFileName(url)}.${ext}`).getWriter();
}
window.addEventListener('beforeunload', function () {
    fileStream && fileStream.abort();
});
window.onbeforeunload = function (event) {
    if (fileStream) {
        event.returnValue = i18n.streamOnbeforeunload;
    }
}
function getTemplates(text) {
    // 也许请求头被更改
    if (Object.keys(requestHeaders).length) {
        _data.requestHeaders = { ...requestHeaders };
        _data.initiator = requestHeaders?.referer ?? _initiator;
    }
    return templates(text, _data);
}
function getM3u8DlREArg() {
    let m3u8dlArg = G.m3u8dlArg;
    const addParam = $("#addParam").prop("checked");    // 是否添加参数
    const customFilename = $("#customFilename").val().trim();   // 自定义文件名
    if (customFilename && addParam) {
        m3u8dlArg = m3u8dlArg.replace(/--save-name "[^"]+"/g, `--save-name "${customFilename}"`);
    }
    m3u8dlArg = getTemplates(m3u8dlArg);
    if (!addParam) { return m3u8dlArg; }

    // 线程处理
    const tsThread = $("#thread").val();  // 线程数量
    const threadCountRegex = /(--thread-count\s+)\d+/;
    if (m3u8dlArg.match(threadCountRegex)) {
        m3u8dlArg = m3u8dlArg.replace(threadCountRegex, `\$1${tsThread}`);
    } else {
        m3u8dlArg += ` --thread-count ${tsThread}`;
    }

    // 范围处理
    let rangeStart = $("#rangeStart").val();
    rangeStart = rangeStart.includes(":") ? rangeStart : rangeStart - 1;
    let rangeEnd = $("#rangeEnd").val();
    rangeEnd = rangeEnd.includes(":") ? rangeEnd : rangeEnd - 1;
    if (rangeStart != 0 || rangeEnd != _fragments.length - 1) {
        m3u8dlArg += ` --custom-range "${rangeStart}-${rangeEnd}"`
    }

    // 自定义密钥
    let customKey = $("#customKey").val().trim();  // 自定义密钥
    if (customKey) {
        m3u8dlArg += ` --custom-hls-key "${customKey}"`;
    }

    // 自定义IV
    const customIV = $("#customIV").val();  // 自定义IV
    m3u8dlArg += customIV ? ` --custom-hls-iv "${customIV}"` : "";

    // 只要音频
    // const onlyAudio = $("#onlyAudio").prop("checked");
    // m3u8dlArg += onlyAudio ? ` --drop-video all` : "";

    return m3u8dlArg;
}
function getM3u8DlArg() {
    if (G.m3u8dl == 2) { return getM3u8DlREArg(); }

    let m3u8dlArg = G.m3u8dlArg;
    const addParam = $("#addParam").prop("checked");
    // 自定义文件名
    const customFilename = $("#customFilename").val().trim();
    if (customFilename && addParam) {
        m3u8dlArg = m3u8dlArg.replace(/--saveName "[^"]+"/g, `--saveName "${customFilename}"`);
    }
    m3u8dlArg = getTemplates(m3u8dlArg);

    if (!addParam) { return m3u8dlArg; }

    if (m3u8dlArg.includes("--maxThreads")) {
        m3u8dlArg = m3u8dlArg.replace(/--maxThreads "?[0-9]+"?/g, "");
    }
    const tsThread = $("#thread").val();  // 线程数量
    m3u8dlArg += ` --maxThreads "${tsThread}"`

    let rangeStart = $("#rangeStart").val();
    rangeStart = rangeStart.includes(":") ? rangeStart : rangeStart - 1;
    let rangeEnd = $("#rangeEnd").val();
    rangeEnd = rangeEnd.includes(":") ? rangeEnd : rangeEnd - 1;
    m3u8dlArg += ` --downloadRange "${rangeStart}-${rangeEnd}"`

    let customKey = $("#customKey").val().trim();  // 自定义密钥
    if (customKey) {
        if (isHexKey(customKey)) {
            customKey = HexStringToArrayBuffer(customKey);
            customKey = ArrayBufferToBase64(customKey);
            m3u8dlArg += ` --useKeyBase64 "${customKey}"`;
        } else if (customKey.length == 24 && customKey.slice(-2) == "==") {
            m3u8dlArg += ` --useKeyBase64 "${customKey}"`;
        }
    }
    const customIV = $("#customIV").val();  // 自定义IV
    m3u8dlArg += customIV ? ` --useKeyIV "${customIV}"` : "";
    // 只要音频
    const onlyAudio = $("#onlyAudio").prop("checked");
    m3u8dlArg += onlyAudio ? ` --enableAudioOnly` : "";

    return m3u8dlArg;
}

/**
 * 时间格式转为切片序号
 * @param {string} time
 * @returns {number}
 */
function timeToIndex(time) {
    let totalSeconds = time.split(":").reduce((acc, time) => 60 * acc + +time);
    return _fragments.findIndex(fragment => (totalSeconds -= fragment.duration) < 0);
}

/**
 * 把所有切片地址写入页面
 * @param {Array} text 所有切片地址的对象数组
 */
function writeText(text) {
    if (!Array.isArray(text)) return;
    document.querySelector("#mediaList").innerHTML = text.map((data, index) => `
        <div class="media-item selected" data-index="${index}" id="media-item-${data.sn}">
            <span class="url-text" title="${data.url}">${data.url}</span>
            <span class="media-tip"></span>
            <img class="icon copy" src="img/copy.png"/>
        </div>`).join('');
}
document.querySelector("#mediaList").addEventListener("click", (e) => {
    const mediaItem = e.target.closest(".media-item");
    if (!mediaItem) return;
    const copyBtn = e.target.closest(".copy");
    const urlText = mediaItem.querySelector(".url-text");
    if (copyBtn) {
        navigator.clipboard.writeText(urlText.textContent);
        return;
    }
    // 双击展开/隐藏 多行url
    if (e.detail === 2) {
        document.querySelector("#mediaList").classList.toggle("expand-all");
    }
    const idx = mediaItem.dataset.index;
    _fragments[idx].selected = !_fragments[idx].selected;
    mediaItem.classList.toggle("selected");
});

// 获取文件名
function GetFile(str) {
    str = str.split("?")[0];
    if (str.substr(0, 5) != "data:" && str.substr(0, 4) != "skd:") {
        return str.split("/").pop();
    }
    return str;
}
// 获得不带扩展的文件名
function GetFileName(url) {
    //hiaming 增加自定义名字功能
    if ($('#customFilename').val()) {
        return $('#customFilename').val().trim();
    }
    if (G.TitleName && _title) {
        if (_title.length >= 150) {
            return _title.substring(_title.length - 150);
        }
        return _title;
    }
    url = GetFile(url);
    url = url.split(".");
    url.length > 1 && url.pop();
    url = url.join(".");
    if (url.length >= 150) {
        url = url.substring(url.length - 150);
    }
    if (url.length == 0) {
        url = "NULL";
    }
    return stringModify(url);
}
// 获取扩展名
function GetExt(url) {
    let fileName = GetFile(url);
    let str = fileName.split(".");
    if (str.length == 1) {
        return undefined;
    }
    let ext = str[str.length - 1];
    ext = ext.match(/[0-9a-zA-Z]*/);
    return ext[0].toLowerCase();
}
// 按钮状态
function buttonState(obj = "#mergeTs", state = true) {
    if (state) {
        $(obj).prop("disabled", false).removeClass("no-drop");
        return;
    }
    $(obj).prop("disabled", true).addClass("no-drop");
}
// ArrayBuffer 转 16进制字符串
function ArrayBufferToHexString(buffer) {
    let binary = "";
    let bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += ('00' + bytes[i].toString(16)).slice(-2);
    }
    return binary;
}
// ArrayBuffer 转 Base64
function ArrayBufferToBase64(buffer) {
    let binary = "";
    let bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
// Base64 转 ArrayBuffer
function Base64ToArrayBuffer(base64) {
    let binary_string = atob(base64);
    let len = binary_string.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}
// 字符串 转 ArrayBuffer
function StringToArrayBuffer(str) {
    let bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i);
    }
    return bytes.buffer;
}
// 16进制字符串 转 ArrayBuffer
function HexStringToArrayBuffer(hex) {
    let typedArray = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function (h) {
        return parseInt(h, 16)
    }));
    return typedArray.buffer
}
// 字符串 转 Uint8Array
function StringToUint8Array(str) {
    str = str.replace("0x", "");
    return new Uint8Array(HexStringToArrayBuffer(str));
}
/* 修正mp4文件显示时长 */
function fixFileDuration(data, duration) {
    // duration = parseInt(duration);
    let mvhdBoxDuration = duration * 90000;
    function getBoxDuration(data, duration, index) {
        let boxDuration = "";
        index += 16;    // 偏移量 16 为timescale
        boxDuration += data[index].toString(16);
        boxDuration += data[++index].toString(16);
        boxDuration += data[++index].toString(16);
        boxDuration += data[++index].toString(16);
        boxDuration = parseInt(boxDuration, 16);
        boxDuration *= duration;
        return boxDuration;
    }
    for (let i = 0; i < data.length; i++) {
        // mvhd
        if (data[i] == 0x6D && data[i + 1] == 0x76 && data[i + 2] == 0x68 && data[i + 3] == 0x64) {
            mvhdBoxDuration = getBoxDuration(data, duration, i);   // 获得 timescale
            data[i + 11] = 0;   //删除创建日期
            i += 20;    // mvhd 偏移20 为duration
            data[i] = (mvhdBoxDuration & 0xFF000000) >> 24;
            data[++i] = (mvhdBoxDuration & 0xFF0000) >> 16;
            data[++i] = (mvhdBoxDuration & 0xFF00) >> 8;
            data[++i] = mvhdBoxDuration & 0xFF;
            continue;
        }
        // tkhd
        if (data[i] == 0x74 && data[i + 1] == 0x6B && data[i + 2] == 0x68 && data[i + 3] == 0x64) {
            i += 24;    // tkhd 偏移24 为duration
            data[i] = (mvhdBoxDuration & 0xFF000000) >> 24;
            data[++i] = (mvhdBoxDuration & 0xFF0000) >> 16;
            data[++i] = (mvhdBoxDuration & 0xFF00) >> 8;
            data[++i] = mvhdBoxDuration & 0xFF;
            continue;
        }
        // mdhd
        if (data[i] == 0x6D && data[i + 1] == 0x64 && data[i + 2] == 0x68 && data[i + 3] == 0x64) {
            let mdhdBoxDuration = getBoxDuration(data, duration, i);   // 获得 timescale
            i += 20;    // mdhd 偏移20 为duration
            data[i] = (mdhdBoxDuration & 0xFF000000) >> 24;
            data[++i] = (mdhdBoxDuration & 0xFF0000) >> 16;
            data[++i] = (mdhdBoxDuration & 0xFF00) >> 8;
            data[++i] = mdhdBoxDuration & 0xFF;
            continue;
        }
        //  mdat 之后是媒体数据 结束头部修改
        if (data[i] == 0x6D && data[i + 1] == 0x64 && data[i + 2] == 0x61 && data[i + 3] == 0x74) {
            return data;
        }
    }
    return data;
}
function isHexKey(str) {
    return /^[0-9a-fA-F]{32}$/.test(str);
}
// m3u8文件内容加入bashUrl
function addBashUrl(baseUrl, m3u8Text) {
    let m3u8_split = m3u8Text.split("\n");
    m3u8Text = "";
    for (let key in m3u8_split) {
        if (isEmpty(m3u8_split[key])) { continue; }
        if (m3u8_split[key].includes("URI=")) {
            let KeyURL = /URI="(.*)"/.exec(m3u8_split[key]);
            if (KeyURL && KeyURL[1] && !/^[\w]+:.+/i.test(KeyURL[1])) {
                m3u8_split[key] = m3u8_split[key].replace(/URI="(.*)"/, 'URI="' + baseUrl + KeyURL[1] + '"');
            }
        }
        if (!m3u8_split[key].includes("#") && !/^[\w]+:.+/i.test(m3u8_split[key])) {
            m3u8_split[key] = baseUrl + m3u8_split[key];
        }
        m3u8Text += m3u8_split[key] + "\n";
    }
    return m3u8Text;
}

function highlight() {
    autoDown = false;
    chrome.tabs.getCurrent(function name(params) {
        chrome.tabs.highlight({ tabs: params.index });
    });
}

// 显示面板
function showTab(Obj) {
    const panels = ["#iframeBox", "#m3u8Content", "#video", "#mediaList"];
    panels.forEach(sel => {
        sel === Obj ? $(sel).show() : $(sel).hide();
    });
}

function autoMerge() {
    if (!autoDown) { return; }
    clearTimeout(autoMergeTimer);
    autoMergeTimer = setTimeout(() => {
        autoDown = false;   // 避免重复调用
        $("#mergeTs").click();
    }, 1000);
}

function createIframeFFmpeg(fileData) {
    if (!iframeFFmpeg) {
        iframeFFmpeg = document.createElement('iframe');
        document.querySelector("#iframeBox").appendChild(iframeFFmpeg);
        iframeFFmpeg.onload = function () {
            iframeFFmpegReady = true;
            fileData && iframeFFmpeg.contentWindow.postMessage(fileData, '*');
            $progress.html(i18n.sendFfmpeg);
        };
        iframeFFmpeg.src = G.ffmpegConfig.url + '?_=' + new Date().getTime();
    } else if (iframeFFmpegReady) {
        fileData && iframeFFmpeg.contentWindow.postMessage(fileData, '*');
        $progress.html(i18n.sendFfmpeg);
    } else {
        const timer = setInterval(() => {
            if (iframeFFmpegReady) {
                fileData && iframeFFmpeg.contentWindow.postMessage(fileData, '*');
                $progress.html(i18n.sendFfmpeg);
                clearInterval(timer);
            } else {
                iframeFFmpegReadyRetryCount++;
                if (iframeFFmpegReadyRetryCount > 10) {
                    clearInterval(timer);
                    $progress.html(i18n.ffmpegIsNotReady);
                }
            }
        }, 2000);
    }
}

// 接收 catCatchFFmpegResult
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    // if (!Message.Message || Message.Message != "catCatchFFmpegResult" || Message.state != "ok" || currentTabId == 0 || Message.tabId != currentTabId || G.iframeFFmpeg) { return; }
    if (!Message.Message || Message.Message != "catCatchFFmpegResult" || Message.state != "done" || currentTabId == 0 || Message.tabId != currentTabId) { return; }
    setTimeout(() => {
        $progress.html(i18n.downloadComplete);
        $("#autoClose").prop("checked") && closeTab();
    }, 1000);
});