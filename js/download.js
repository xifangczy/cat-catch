$(function () {
    const params = new URL(location.href).searchParams;
    const _url = params.get("url");
    const _referer = params.get("referer");
    const _fileName = params.get("filename");

    // 下载的文件ID
    var downId = 0;

    // 获取当前tabId 如果存在Referer修改当前标签下的所有xhr的Referer
    chrome.tabs.getCurrent(function (tabs) {
        if (_referer && !isEmpty(_referer)) {
            chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [tabs.id],
                addRules: [{
                    "id": tabs.id,
                    "action": {
                        "type": "modifyHeaders",
                        "requestHeaders": [{
                            "header": "Referer",
                            "operation": "set",
                            "value": _referer
                        }]
                    },
                    "condition": {
                        "tabIds": [tabs.id],
                        "resourceTypes": ["xmlhttprequest"]
                    }
                }]
            });
        }
        // 没有url 打开输入框
        if (!_url) {
            $("#getURL").show();
            $("#getURL_btn").click(function () {
                const url = $("#getURL #url").val();
                const referer = $("#getURL #referer").val();
                window.location.href = `?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
            });
            return;
        }
        // 如果是m3u8 mpd跳转到解析器
        let ext = _url.split("?")[0];
        ext = ext.split(".").pop();
        if (ext == "m3u8") {
            window.location.href = `m3u8.html?url=${encodeURIComponent(_url)}&referer=${encodeURIComponent(_referer)}`;
            return;
        }
        if (ext == "mpd") {
            window.location.href = `mpd.html?url=${encodeURIComponent(_url)}&referer=${encodeURIComponent(_referer)}`;
            return;
        }
        downloadFile();
    });

    // 使用ajax下载文件
    function downloadFile() {
        $("#downfile").show();
        $("#downFilepProgress").html("后台下载中...");
        $.ajax({
            url: _url,
            xhrFields: { responseType: "blob" },
            xhr: function () {
                let xhr = new XMLHttpRequest();
                xhr.addEventListener("progress", function (evt) {
                    let progress = Math.round(evt.loaded / evt.total * 10000) / 100.00;
                    if (progress != Infinity) {
                        progress = progress + "%";
                        $("#downFilepProgress").html(progress);
                        $(".progress").css("width", progress);
                    } else {
                        $("#downFilepProgress").html("未知大小...");
                        $(".progress").css("width", "100%");
                    }
                });
                return xhr;
            }
        }).fail(function (result) {
            $("#downFilepProgress").html("下载失败... " + JSON.stringify(result));
        }).done(function (result) {
            $("#downFilepProgress").html("下载完成，正在保存到硬盘...");
            try {
                chrome.downloads.download({
                    url: URL.createObjectURL(result),
                    filename: _fileName
                }, function (downloadId) { downId = downloadId });
            } catch (e) {
                $("#downFilepProgress").html("下载失败... " + e);
            }
        });
    }

    // 监听提示变化修改网页标题
    $("#downFilepProgress").bind("DOMNodeInserted", function (e) {
        document.title = e.target.innerHTML;
    });

    // 监听下载事件 修改提示
    chrome.downloads.onChanged.addListener(function (downloadDelta) {
        if (!downloadDelta.state) { return; }
        if (downloadDelta.state.current == "complete" && downId != 0) {
            $("#downFilepProgress").html("已保存到硬盘, 请查看浏览器已下载内容");
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
});