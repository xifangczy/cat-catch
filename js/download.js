$(function () {
    var url = new RegExp("[?]url=([^\n&]*)").exec(window.location.href);
    url = url ? decodeURIComponent(url[1]) : undefined;

    var referer = new RegExp("&referer=([^\n&]*)").exec(window.location.href);
    referer = referer ? decodeURIComponent(referer[1]) : undefined;

    var fileName = new RegExp("&filename=([^\n&]*)").exec(window.location.href);
    fileName = fileName ? decodeURIComponent(fileName[1]) : undefined;

    // 下载的文件ID
    var downId = 0;

    // 获取当前tabId 如果存在Referer修改当前标签下的所有xhr的Referer
    chrome.tabs.getCurrent(function (tabs) {
        let tabId = tabs.id;
        // 修改Referer
        if (referer && referer != undefined && referer != "" && referer != "undefined") {
            chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [tabId],
                addRules: [{
                    "id": tabId,
                    "action": {
                        "type": "modifyHeaders",
                        "requestHeaders": [{
                            "header": "Referer",
                            "operation": "set",
                            "value": referer
                        }]
                    },
                    "condition": {
                        "tabIds": [tabId],
                        "resourceTypes": ["xmlhttprequest"]
                    }
                }]
            });
        }
        // 没有url 打开输入框
        if (!url) {
            $("#getURL").show();
            $("#getURL_btn").click(function () {
                const url = $("#getURL #url").val();
                const referer = $("#getURL #referer").val();
                window.location.href = `?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
            });
            return;
        }
        // 如果是m3u8跳转到解析器
        if (url.includes(".m3u8")) {
            window.location.href = `m3u8.html?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
            return;
        }
        downloadFile();
    });

    // 使用ajax下载文件
    function downloadFile() {
        $("#downfile").show();
        $("#downFilepProgress").html("后台下载中...");
        $.ajax({
            url: url,
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
                    filename: fileName
                }, function (downloadId) { downId = downloadId; });
            } catch (e) {
                $("#downFilepProgress").html("下载失败... " + e);
            }
        });
    }

    // 监听提示变化修改网页标题
    $("#progress, #downFilepProgress").bind("DOMNodeInserted", function (e) {
        document.title = e.target.innerHTML;
    });

    // 监听下载事件 修改提示
    chrome.downloads.onChanged.addListener(function (DownloadDelta) {
        if (!DownloadDelta.state) { return; }
        if (DownloadDelta.state.current == "complete" && downId != 0) {
            $("#downFilepProgress").html("已保存到硬盘, 请查看浏览器已下载内容");
            $("#progress").html("已保存到硬盘, 请查看浏览器已下载内容");
        }
    });

    // 返回上一页
    $("#historyBack").click(function () {
        if (window.history.length > 1) { window.history.back(); }
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