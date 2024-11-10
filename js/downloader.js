// url 参数解析
const params = new URL(location.href).searchParams;
const _requestId = params.get("requestId") ? params.get("requestId").split(",") : [];
const _ffmpeg = params.get("ffmpeg");
let _downStream = params.get("downStream");
const _data = [];
const _taskId = Date.parse(new Date());
let _tabId = null;
let _index = null;

// 是否表单提交下载 表单提交 不使用自定义文件名
let _formDownload = false;

// 获取当前标签信息
chrome.tabs.getCurrent(function (tabs) {
    _tabId = tabs.id;
    _index = tabs.index;

    // 如果没有requestId 显示 提交表单
    if (!_requestId.length) {
        $("#getURL, .newDownload").toggle();
        $("#getURL_btn").click(function () {
            const data = [{
                url: $("#getURL #url").val().trim(),
                requestHeaders: { referer: $("#getURL #referer").val().trim() },
                requestId: 1,
            }];
            _downStream = $("#downStream").prop("checked");
            _formDownload = true;
            _data.push(...data);
            setHeaders(data, () => { awaitG(start); });
            $("#getURL, .newDownload").toggle();
        });
        return;
    }
    // 读取要下载的资源数据
    chrome.runtime.sendMessage({ Message: "getData", requestId: _requestId }, function (data) {
        if (data == "error") {
            chrome.tabs.highlight({ tabs: _index });
            alert(i18n.dataFetchFailed);
            return;
        }
        _data.push(...data);
        setHeaders(data, () => { awaitG(start); });
    });
});

function start() {
    $(`<style>${G.css}</style>`).appendTo("head");
    $("#autoClose").prop("checked", G.downAutoClose);
    streamSaver.mitm = G.streamSaverConfig.url;

    const $downBox = $("#downBox"); // 下载列表容器
    const down = new Downloader(_data);  // 创建下载器 
    const itemDOM = new Map();  // 下载列表dom对象

    const addHtml = (fragment) => {
        const html = $(`
            <div class="downItem">
                <div class="explain">${stringModify(fragment.name ?? getUrlFileName(fragment.url))}</div>
                <div id="downFilepProgress"></div>
                <div class="progress-container">
                    <div class="progress-wrapper">
                        <div class="progress-bar">
                            <div class="progress"></div>
                        </div>
                    </div>
                    <button class="cancel-btn">${i18n.stopDownload}</button>
                </div>
            </div>`);

        const $button = html.find("button");
        $button.data("action", "stop");

        // 操作对象放入itemDOM 提高效率
        itemDOM.set(fragment.index, {
            progressText: html.find("#downFilepProgress"),
            progress: html.find(".progress"),
            button: $button,
        });

        $button.click(function () {
            const action = $(this).data("action");
            if (action == "stop") {
                down.stop(fragment.index);
                // down.downloader();  // 停止当前下载器 重新开一个下载器保持线程数量
                $(this).html(i18n.retryDownload).data("action", "start");
                if (fragment.fileStream) {
                    fragment.fileStream.abort();
                }
            } else if (action == "start") {
                down.downloader(fragment);
                $(this).html(i18n.stopDownload).data("action", "stop");
            } else {
                sendFile("addFile", down.buffer[fragment.index], fragment);
            }
        });
        $downBox.append(html);

        // 自定义下载文件名
        fragment._filename = getUrlFileName(fragment.url);
        if (G.TitleName && !_formDownload) {
            fragment.title = stringModify(fragment.title);    // 防止标题中有路径分隔符 导致下载新建文件夹
            fragment._filename = templates(G.downFileName, fragment);
        }

        // 流式下载处理
        if ((_downStream || G.downStream || fragment?._size > 2147483648) && !_ffmpeg) {
            fragment.fileStream = streamSaver.createWriteStream(fragment._filename).getWriter();
        }
    }

    // 下载列表处理
    down.fragments.forEach((fragment) => addHtml(fragment));

    let lastEmitted = Date.now();
    down.on('itemProgress', function (fragment, state, receivedLength, contentLength, value) {
        const $dom = itemDOM.get(fragment.index);
        if (state) {
            $dom.progress.css("width", "100%");
            $dom.progressText.html(i18n.downloadComplete);
            $dom.button.html(i18n.sendFfmpeg);
            $dom.button.data("action", "sendFfmpeg");
            return;
        }
        if (fragment.fileStream) {
            fragment.fileStream.write(new Uint8Array(value));
        }

        if (Date.now() - lastEmitted >= 100) {
            if (contentLength) {
                const progress = (receivedLength / contentLength * 100).toFixed(2) + "%";
                $dom.progress.css("width", progress);
                $dom.progress.html(progress);
                $dom.progressText.html(`${byteToSize(receivedLength)} / ${byteToSize(contentLength)}`);
            } else {
                $dom.progressText.html(`${byteToSize(receivedLength)}`);
            }
            if (down.total == 1) {
                const title = contentLength ?
                    `${byteToSize(receivedLength)} / ${byteToSize(contentLength)}` :
                    `${byteToSize(receivedLength)}`;
                document.title = title;
            }
            lastEmitted = Date.now();
        }
    });
    down.on('completed', function (buffer, fragment) {
        // 流式下载
        if (fragment.fileStream) {
            fragment.fileStream.close();
            fragment.fileStream = null;
            return;
        }

        document.title = `${down.success}/${down.total}`;

        const blob = new Blob([buffer], { type: fragment.contentType });
        const blobUrl = URL.createObjectURL(blob);

        // 发送到ffmpeg
        if (_ffmpeg) {
            sendFile(_ffmpeg, blobUrl, fragment);
            return;
        }

        // 直接下载
        chrome.downloads.download({
            url: blobUrl,
            filename: filterFileName(fragment._filename),
            saveAs: G.saveAs
        }, function (downloadId) {
            fragment.downId = downloadId;
        });
    });
    down.on('allCompleted', function (buffer) {
        $("#stopDownload").hide();
    });

    // 错误处理
    down.on('downloadError', function (fragment, error) {
        if (!fragment.retry) {
            fragment.retry = 'range';
            down.downloader(fragment);
            return;
        }
        itemDOM.get(fragment.index).progressText.html(error);
        chrome.tabs.highlight({ tabs: _index });
    });

    down.on('start', function (fragment, options) {
        if (fragment.retry && fragment.retry == 'range') {
            options.headers = { "Range": "bytes=0-", "Cache-Control": "no-cache" };
        }
    });
    // 全部停止下载
    $("#stopDownload").click(function () {
        down.stop();
        $(this).hide();
    });

    // 打开目录
    $(".openDir").click(function () {
        if (down.fragments[0].downId) {
            chrome.downloads.show(down.fragments[0].downId);
            return;
        }
        chrome.downloads.showDefaultFolder();
    });

    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (!Message.Message || Message.Message != "catCatchFFmpegResult" || Message.state != "ok" || _tabId == 0 || Message.tabId != _tabId || down.success != down.total) { return; }
        setTimeout(() => {
            $("#autoClose").prop("checked") && window.close();
        }, Math.ceil(Math.random() * 999));
    });

    // 监听下载
    chrome.downloads.onChanged.addListener(function (downloadDelta) {
        if (!downloadDelta.state || downloadDelta.state.current != "complete") { return; }
        if (!down.fragments.some(item => item.downId == downloadDelta.id)) { return }
        if (down.success == down.total) {
            document.title = i18n.downloadComplete;
            if ($("#autoClose").prop("checked")) {
                setTimeout(() => {
                    window.close();
                }, Math.ceil(Math.random() * 999));
            }
        }
    });

    // 监听添加任务
    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (Message.Message == "catDownload" && !_ffmpeg) {
            setHeaders(Message.data, () => {
                Message.data.forEach((fragment) => {
                    down.push(fragment);
                    addHtml(fragment);
                    down.downloader(fragment.index);
                });
            });
            sendResponse("OK");
            return;
        }
    });

    document.title = `${down.success}/${down.total}`;

    down.start();
}

/**
 * 发送数据到在线FFmpeg
 * @param {String} action 发送类型
 * @param {Array} buffer 数据内容
 * @param {Object} fragment 数据对象
 */
function sendFile(action, blobUrl, fragment) {
    chrome.tabs.query({ url: G.ffmpegConfig.url }, function (tabs) {
        if (tabs.length && tabs[0].status != "complete") {
            setTimeout(() => {
                sendFile(action, blobUrl, fragment);
            }, 500);
            return;
        }
        let data = {};
        if (action == "merge") {
            data = {
                Message: "catCatchFFmpeg",
                action: action,
                files: [{ data: blobUrl, name: getUrlFileName(fragment.url) }],
                title: stringModify(fragment.title),
                tabId: _tabId,
                taskId: _taskId,
                quantity: _data.length
            };
        }
        if (action == "addFile") {
            data = {
                Message: "catCatchFFmpeg",
                action: action,
                files: [{ data: blobUrl, name: getUrlFileName(fragment.url) }],
                title: stringModify(fragment.title),
                tabId: _tabId,
            };
        }
        chrome.runtime.sendMessage(data);
    });
}

/**
 * 获取url中的文件名
 * @param {String} url 
 * @returns {String} 返回文件命 为空则返回"NULL"
 */
function getUrlFileName(url) {
    try {
        const pathname = new URL(url).pathname;
        const fileName = pathname.substring(pathname.lastIndexOf('/') + 1);
        return fileName ? fileName : 'NULL';
    } catch (error) {
        return "NULL";
    }
}

/**
 * 设置请求头
 * @param {Array} data 请求头数据
 * @param {Function} callBack 回调函数
 */
function setHeaders(data, callBack) {
    const rules = { removeRuleIds: [], addRules: [] };
    for (let item of data) {
        const rule = {
            "id": parseInt(item.requestId),
            "action": {
                "type": "modifyHeaders",
                "requestHeaders": Object.keys(item.requestHeaders).map(key => ({ header: key, operation: "set", value: item.requestHeaders[key] }))
            },
            "condition": {
                "resourceTypes": ["xmlhttprequest", "media", "image"],
                "tabIds": [_tabId],
                "urlFilter": item.url
            }
        }
        if (item.cookie) {
            rule.action.requestHeaders.push({ header: "Cookie", operation: "set", value: item.cookie });
        }
        rules.removeRuleIds.push(parseInt(item.requestId));
        rules.addRules.push(rule);
    }
    chrome.declarativeNetRequest.updateSessionRules(rules, () => {
        callBack && callBack();
    });
}