// url 参数解析
const params = new URL(location.href).searchParams;
const _url = params.get("url");
// const _referer = params.get("referer");
const _initiator = params.get("initiator");
const _requestHeaders = params.get("requestHeaders");
// const _fileName = params.get("filename");
// const autosend = params.get("autosend");
// const autoClose = params.get("autoClose");
const downStream = params.get("downStream");
const title = params.get("title");
// const fileFlag = params.get("fileFlag");
const _ffmpeg = params.get("ffmpeg");
const _quantity = params.get("quantity");
const _taskId = params.get("taskId");
const _requestId = params.get("requestId");

let _data = {};

// 修改当前标签下的所有xhr的Referer
let requestHeaders = {};
if (_requestId) {
    chrome.runtime.sendMessage({ Message: "getData", requestId: _requestId }, function (data) {
        if (data == "error") {
            awaitG(start);
            return;
        }
        _data = data;
        requestHeaders = data.requestHeaders;
        if (data.cookie) {
            requestHeaders.cookie = data.cookie;
        }
        if (_requestHeaders) {
            const parsedHeaders = JSON.parse(_requestHeaders);
            Object.assign(requestHeaders, parsedHeaders);
        }
        if (!requestHeaders.referer && _initiator) {
            requestHeaders.referer = _initiator;
        }
        setRequestHeaders(requestHeaders, () => { awaitG(start); });
    });
} else if (_requestHeaders) {
    requestHeaders = JSON.parse(_requestHeaders);
    if (!requestHeaders.referer && _initiator) {
        requestHeaders.referer = _initiator;
    }
    setRequestHeaders(requestHeaders, () => { awaitG(start); });
} else {
    awaitG(start);
}

function start() {
    $("#autoClose").prop("checked", G.downAutoClose);
    // $("#downActive").prop("checked", G.downActive);
    $("#downStream").prop("checked", G.downStream);
    $(`<style>${G.css}</style>`).appendTo("head");
    // 流式下载服务端
    streamSaver.mitm = G.streamSaverConfig.url;

    chrome.tabs.getCurrent(function (tab) {
        startDownload(tab.id);
    });
}

function startDownload(tabId) {
    // 没有url 打开输入框
    if (!_url) {
        $("#getURL").show();
        $("#getURL_btn").click(function () {
            const url = $("#getURL #url").val().trim();
            const referer = $("#getURL #referer").val().trim();
            let href = `?url=${encodeURIComponent(url)}&requestHeaders=${encodeURIComponent(JSON.stringify({ referer: referer }))}`;
            if ($("#downStream").prop("checked")) {
                href += "&downStream=true";
            }
            window.location.href = href;
        });
        return;
    }
    $("#downfile").show();

    const $downFilepProgress = $("#downFilepProgress");
    const $progress = $(".progress");
    let blobUrl = "";   // 储存blob
    let downId = 0; // 下载的文件ID

    // 标题 显示 进度
    let timer = null;
    let lastUpdate = 0;
    const setProgressText = (progress, html) => {
        const now = Date.now();
        html && $downFilepProgress.html(progress);
        if (now - lastUpdate >= 500) {
            document.title = progress;
            lastUpdate = now;
        }
        timer && clearInterval(timer);
        timer = setInterval(() => {
            document.title = progress;
            lastUpdate = Date.now();
        }, 500);
    }


    // 是否边下边存
    let fileStream = null;
    let filename = getUrlFileName(_url);
    if (Object.keys(_data).length > 0 && G.TitleName) {
        filename = templates(G.downFileName, _data);
    }
    if ((downStream || G.downStream) && !_ffmpeg) {
        fileStream = streamSaver.createWriteStream(filename).getWriter();
    }
    // 开始下载
    let receivedLength = 0; // 已下载大小
    $("#stopDownload").show();
    const controller = new AbortController();
    fetch(_url, {
        signal: controller.signal,
        headers: new Headers({
            'Cache-Control': 'no-cache'
        })
    }).then(response => {
        if (!response.ok) {
            // 某些网站需要传输 range
            if (!requestHeaders.range) {
                requestHeaders.range = "bytes=0-";
                params.set("requestHeaders", JSON.stringify(requestHeaders));
                const href = window.location.origin + window.location.pathname + "?" + params.toString();
                window.location.href = href;
                return;
            }
            $downFilepProgress.html(response.status);
            console.error(response);
            throw new Error(response.statusText + " " + response.status);
        }
        const reader = response.body.getReader();
        const contentLength = parseInt(response.headers.get('content-length')) || 0;
        const contentLengthFormat = byteToSize(contentLength);
        const contentType = response.headers.get('content-type') ?? 'video/mp4';
        const chunks = [];
        const pump = async () => {
            while (true) {
                const { value, done } = await reader.read();
                if (done) { break; }
                fileStream ? fileStream.write(new Uint8Array(value)) : chunks.push(value);
                receivedLength += value.length;
                const receivedLengthFormat = byteToSize(receivedLength);
                if (contentLength) {
                    const progress = (receivedLength / contentLength * 100).toFixed(2) + "%";
                    setProgressText(progress);
                    $downFilepProgress.html(receivedLengthFormat + " / " + contentLengthFormat + " " + progress);
                    $progress.css("width", progress);
                } else {
                    setProgressText(receivedLengthFormat, true);
                }
            }
            setProgressText(i18n.downloadComplete, true);
            if (!fileStream) {
                let position = 0;
                const allChunks = new Uint8Array(receivedLength);
                for (const chunk of chunks) {
                    allChunks.set(chunk, position);
                    position += chunk.length;
                }
                return new Blob([allChunks], { type: contentType });
            }
            fileStream.close();
        }
        return pump();
    }).then(blob => {
        $("#stopDownload").hide();
        if (fileStream) {
            setProgressText(i18n.downloadComplete, true);
            fileStream = null;
            setTimeout(() => {
                $("#autoClose").prop("checked") && window.close();
            }, Math.ceil(Math.random() * 999));
            return;
        }
        try {
            blobUrl = URL.createObjectURL(blob);
            $("#ffmpeg").show();
            // 自动发送到ffmpeg
            if (_ffmpeg) {
                setProgressText(i18n.sendFfmpeg, true);
                sendFile("merge");
                return;
            }
            setProgressText(i18n.saving, true);
            chrome.downloads.download({
                url: blobUrl,
                filename: filename,
                saveAs: G.saveAs
            }, function (downloadId) {
                setProgressText(i18n.downloadComplete, true);
                downId = downloadId;
            });
        } catch (e) {
            $downFilepProgress.html(i18n.saveFailed + e);
            setProgressText(i18n.saveFailed);
        }
    }).catch(error => {
        highlight();
        if (fileStream) {
            receivedLength ? fileStream.close() : fileStream.abort();
            fileStream = null;
        }
        $("#stopDownload").hide();
        if (error.name === 'AbortError') {
            setProgressText(i18n.stopDownload);
            $downFilepProgress.html(i18n.stopDownload);
        } else {
            setProgressText(i18n.downloadFailed);
            $downFilepProgress.html(i18n.downloadFailed + " " + error);
            console.error(error);
        }
    });

    // 监听下载事件 修改提示
    chrome.downloads.onChanged.addListener(function (downloadDelta) {
        if (!downloadDelta.state) { return; }
        if (downloadDelta.state.current == "complete" && downId == downloadDelta.id) {
            document.title = i18n.downloadComplete;
            $downFilepProgress.html(i18n.savePrompt);
            if ($("#autoClose").prop("checked")) {
                setTimeout(() => {
                    window.close();
                }, Math.ceil(Math.random() * 999));
            }
        }
    });

    // 返回上一页
    $("#historyBack").click(function () {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        window.location.href = "/download.html";
    });

    // 打开目录
    $(".openDir").click(function () {
        if (downId) {
            chrome.downloads.show(downId);
            return;
        }
        chrome.downloads.showDefaultFolder();
    });

    // 发送到在线ffmpeg
    $("#ffmpeg").click(function () {
        sendFile();
    });

    // 停止下载
    $("#stopDownload").click(function () {
        if (fileStream) {
            fileStream.close();
            fileStream = null;
        }
        controller.abort();
        $("#stopDownload").hide();
    });

    function highlight() {
        chrome.tabs.getCurrent(function name(params) {
            chrome.tabs.highlight({ tabs: params.index });
        });
    }
    function sendFile(action = "addFile") {
        chrome.tabs.query({ url: G.ffmpegConfig.url }, function (tabs) {
            if (tabs.length && tabs[0].status != "complete") {
                setTimeout(() => {
                    sendFile(action);
                }, 500);
                return;
            }
            const data = {
                Message: "catCatchFFmpeg",
                action: action,
                files: [{ data: blobUrl, name: getUrlFileName(_url) }],
                title: title,
                tabId: tabId,
                taskId: _taskId ?? tabId
            };
            if (_quantity) {
                data.quantity = parseInt(_quantity);
            }
            if (_taskId) {
                data.taskId = _taskId;
            }
            chrome.runtime.sendMessage(data);
        });
    }
    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (!Message.Message || Message.Message != "catCatchFFmpegResult" || Message.state != "ok" || tabId == 0 || Message.tabId != tabId) { return; }
        $downFilepProgress.html(i18n.sendFfmpeg);
        setTimeout(() => {
            $("#autoClose").prop("checked") && window.close();
        }, Math.ceil(Math.random() * 999));
    });
    function getUrlFileName() {
        try {
            const pathname = new URL(_url).pathname;
            const fileName = pathname.substring(pathname.lastIndexOf('/') + 1);
            return fileName ? fileName : 'NULL';
        } catch (error) {
            return "NULL";
        }
    }
    // 刷新/关闭页面 检查边下边存
    window.addEventListener('beforeunload', function (e) {
        if (fileStream) {
            e.preventDefault();
            e.returnValue = i18n.streamOnbeforeunload;
            fileStream.close();
        }
    });
}