// url 参数解析
const params = new URL(location.href).searchParams;
const _url = params.get("url");
const _referer = params.get("referer");
const _fileName = params.get("filename");
const autosend = params.get("autosend");
const downDir = params.get("downDir");
const autoClose = params.get("autoClose");
const title = params.get("title");

// 修改当前标签下的所有xhr的Referer
_referer ? setReferer(_referer, startDownload) : startDownload();

function startDownload() {
    $(`<style>${G.css}</style>`).appendTo("head");
    // 储存blob
    let blobUrl = "";
    // 下载的文件ID
    let downId = 0;
    // 没有url 打开输入框
    if (!_url) {
        $("#getURL").show();
        $("#getURL_btn").click(function () {
            const url = $("#getURL #url").val().trim();
            const referer = $("#getURL #referer").val().trim();
            window.location.href = `?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
        });
        return;
    }

    const $downFilepProgress = $("#downFilepProgress");
    const $progress = $(".progress");

    $("#autoClose").prop("checked", autoClose);

    // 使用ajax下载文件
    $("#downfile").show();
    $downFilepProgress.html("后台下载中...");
    $.ajax({
        url: _url,
        xhrFields: { responseType: "blob" },
        xhr: function () {
            let xhr = new XMLHttpRequest();
            xhr.addEventListener("progress", function (evt) {
                let progress = Math.round(evt.loaded / evt.total * 10000) / 100.00;
                if (progress != Infinity) {
                    progress = progress + "%";
                    $downFilepProgress.html(byteToSize(evt.loaded) + " " + progress);
                    $progress.css("width", progress);
                } else {
                    $downFilepProgress.html("未知大小...");
                    $progress.css("width", "100%");
                }
            });
            return xhr;
        }
    }).fail(function (result) {
        $downFilepProgress.html("下载失败... " + JSON.stringify(result));
    }).done(function (result) {
        try {
            blobUrl = URL.createObjectURL(result);
            $("#ffmpeg").show();
            // 自动发送到ffmpeg
            if (autosend) {
                sendFile("popupAddMedia");
                return;
            }
            $downFilepProgress.html("下载完成，正在保存到硬盘...");
            chrome.downloads.download({
                url: blobUrl,
                filename: downDir ? downDir + "/" + _fileName : _fileName,
                saveAs: G.saveAs
            }, function (downloadId) {
                downId = downloadId;
            });
        } catch (e) {
            $downFilepProgress.html("下载失败... " + e);
        }
    });

    // 监听下载事件 修改提示
    chrome.downloads.onChanged.addListener(function (downloadDelta) {
        if (!downloadDelta.state) { return; }
        if (downloadDelta.state.current == "complete" && downId != 0) {
            $downFilepProgress.html("已保存到硬盘, 请查看浏览器已下载内容");
            // if (downDir) { window.close(); }
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

    function sendFile(action = "addMedia") {
        chrome.runtime.sendMessage({
            Message: "catCatchFFmpeg",
            action: action,
            media: [{ data: blobUrl, name: getUrlFileName(_url) }],
            title: title
        }, function () {
            $downFilepProgress.html("已发送到在线ffmpeg");
            $("#autoClose").prop("checked") && setTimeout(() => { window.close(); }, 1000 + Math.ceil(Math.random() * 999));
        });
    }
}