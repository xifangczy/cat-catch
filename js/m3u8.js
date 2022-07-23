// 解析参数 注入脚本
let onCatch = new RegExp("&catch=([^\n&]*)").exec(window.location.href);
if (onCatch) {
    onCatch = decodeURIComponent(onCatch[1]);
    onCatch = onCatch == "catch.js" ? "js/catch.js" : "js/recorder.js";  // Security
    const script = document.createElement('script');
    script.src = onCatch;
    document.head.appendChild(script);
}
$(function () {
    // url 参数解析
    var m3u8_url = new RegExp("[?]m3u8_url=([^\n&]*)").exec(window.location.href);
    m3u8_url = m3u8_url ? decodeURIComponent(m3u8_url[1]) : undefined;

    var m3u8_referer = new RegExp("&referer=([^\n&]*)").exec(window.location.href);
    m3u8_referer = m3u8_referer ? decodeURIComponent(m3u8_referer[1]) : undefined;

    var m3u8_title = new RegExp("&title=([^\n&]*)").exec(window.location.href);
    m3u8_title = m3u8_title ? decodeURIComponent(m3u8_title[1]) : undefined;

    var file_name = new RegExp("&filename=([^\n&]*)").exec(window.location.href);
    file_name = file_name ? decodeURIComponent(file_name[1]) : undefined;

    if (onCatch) {
        $("#catch").html("关闭捕获");
        $("#catch").data("switch", "off");
    }

    //获取m3u8参数
    var m3u8_arg = new RegExp("\\.m3u8\\?([^\n]*)").exec(m3u8_url);
    if (m3u8_arg) {
        m3u8_arg = m3u8_arg[1];
    }

    $("#m3u8_url").attr("href", m3u8_url).html(m3u8_url);

    var BasePath;
    var RootPath;
    var m3u8_content;
    var tsLists = [];    //储存所有ts链接
    var expandKey = false;
    var KeyURL = "";
    var m3u8IV = "";
    var keyID = "";
    var MapURI = "";
    var method = "";
    var isEncrypted = false;    //是否加密的m3u8
    const decryptor = new AESDecryptor(); //解密工具
    var mediaDuration = 0;  // 视频总时长
    var isLive = true; // 是否是直播
    var hls = {}  // 在线播放工具
    var fileSize = 0; // 文件大小
    var downState = false;
    var downId = 0;

    // 获取当前tabId 如果存在Referer修改当前标签下的所有xhr的Referer
    chrome.tabs.getCurrent(function (tabs) {
        let tabId = tabs.id;
        // 修改Referer
        if (m3u8_referer && m3u8_referer != undefined && m3u8_referer != "" && m3u8_referer != "undefined") {
            chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [tabId],
                addRules: [{
                    "id": tabId,
                    "action": {
                        "type": "modifyHeaders",
                        "requestHeaders": [{
                            "header": "Referer",
                            "operation": "set",
                            "value": m3u8_referer
                        }]
                    },
                    "condition": {
                        "tabIds": [tabId],
                        "resourceTypes": ["xmlhttprequest"]
                    }
                }]
            });
        }
        if (!m3u8_url) {
            $("#getURL").show();
            $("#loading").hide();
            $("#getURL_btn").click(function () {
                const url = $("#getURL #url").val();
                const referer = $("#getURL #referer").val();
                window.location.href = `?m3u8_url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
            });
            return;
        }
        if (m3u8_title || m3u8_url.includes(".m3u8")) {
            getM3u8Content();
            return;
        }
        downloadFile();
        return;
    });
    // 监听下载事件 修改提示
    chrome.downloads.onChanged.addListener(function (DownloadDelta) {
        if (!DownloadDelta.state) { return; }
        if (DownloadDelta.state.current == "complete" && downState) {
            downId = DownloadDelta.id;
            $("#downFilepProgress").html("已保存到硬盘, 请查看浏览器已下载内容");
            $("#progress").html("已保存到硬盘, 请查看浏览器已下载内容");
        }
    });
    // 辅助下载文件
    function downloadFile() {
        $("#loading").hide();
        $("#downfile").show();
        $("#downFilepProgress").html("后台下载中...");
        $.ajax({
            url: m3u8_url,
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
            downState = true;
            $("#downFilepProgress").html("下载完成，正在保存到硬盘...");
            chrome.downloads.download({
                url: URL.createObjectURL(result),
                filename: file_name
            });
        });
    }
    // 下载m3u8内容
    function getM3u8Content() {
        $.ajax({
            async: true,
            url: m3u8_url
        }).fail(function () {
            $("#loading").show();
            $("#m3u8").hide();
            $("#loading .optionBox").html(`获取m3u8内容失败, 请尝试手动下载 <a href="${m3u8_url}">${m3u8_url}</a>`);
        }).done(function (result) {
            $("#m3u8").show();
            BasePath = getManifestUrlBase();
            RootPath = getManifestUrlRoot();
            m3u8_content = result;
            show_list();
        });
    }
    // 获得不带扩展的文件名
    function GetFileName(url, ext = false) {
        if (G.TitleName && m3u8_title) {
            return m3u8_title;
        }
        url = url.toLowerCase();
        let str = url.split("?");
        str = str[0].split("/");
        str = str[str.length - 1].split("#")[0];
        if (ext) { return str; }
        str = str.split(".");
        str.pop();
        return str.join(".");
    }
    // 基本文件目录
    function getManifestUrlBase(decode = true) {
        let url_decode = decode ? decodeURIComponent(m3u8_url) : m3u8_url;
        url_decode = url_decode.split("?")[0];
        let parts = url_decode.split("/");
        parts.pop();
        return parts.join("/") + "/";
    }
    // 根目录
    function getManifestUrlRoot() {
        let Path = m3u8_url.split("/");
        return Path[0] + "//" + Path[2];
    }
    // 修复url路劲
    function fixUrl(url) {
        if (/^[\w]+:.+/i.test(url)) {
            return url;
        }
        if (url[0] == "/") {
            return RootPath + url;
        }
        return BasePath + url;
    }
    // 获取文件名
    function GetFile(str) {
        str = str.split("?")[0];
        if (str.substr(0, 5) != "data:" && str.substr(0, 4) != "skd:") {
            return str.split("/").pop();
        }
        return str;
    }

    //////////////////////// 解析器 主函数 ////////////////////////
    function show_list(format = "") {
        let count = 0;
        let ExistKey = false;
        let textarea = "";
        mediaDuration = 0;
        $("#media_file").val("");
        $("#tips").html("");
        let m3u8_split = m3u8_content.split("\n");
        tsLists = [];
        for (let line of m3u8_split) {
            if (line == "\n" || line == "\r" || line == "" || line == " " || line == undefined) {
                continue;
            }
            //重要信息
            if (line.includes("#EXT-X-MAP")) {
                ExistKey = true;
                let MapUriTemp = /URI="(.*)"/.exec(line);
                if (MapUriTemp && MapUriTemp[1]) {
                    MapURI = fixUrl(MapUriTemp[1]);
                    $("#tips").append('#EXT-X-MAP URI: <input type="text" value="' + MapURI + '" spellcheck="false">');
                    line = MapURI;
                }
            }
            let isKyeUrl = false;
            if (line.includes("#EXT-X-KEY")) {
                ExistKey = true;
                let KeyURLTemp = /URI="([^"]*)"/.exec(line);
                if (KeyURLTemp && KeyURLTemp[1] && KeyURL != KeyURLTemp[1]) {
                    KeyURL = fixUrl(KeyURLTemp[1]);
                    $("#tips").append('#EXT-X-KEY URI: <input type="text" value="' + KeyURL + '" spellcheck="false">');
                    // 下载Key文件
                    $.ajax({
                        url: KeyURL,
                        xhrFields: { responseType: "arraybuffer" }
                    }).done(function (responseData) {
                        isEncrypted = true;
                        let count = $("#count").html();
                        if (!count.includes("(加密HLS)")) {
                            $("#count").html(count + " (加密HLS)");
                        }
                        if (typeof responseData == "string") {
                            responseData = new TextEncoder().encode(responseData).buffer;
                        }
                        try {
                            decryptor.expandKey(responseData);
                            expandKey = true;
                        } catch (e) {
                            expandKey = false;
                            console.log(e);
                        }
                    });
                }
                if (line.includes("IV=")) {
                    let m3u8IvTemp = /IV=([^,\n]*)/.exec(line);
                    if (m3u8IvTemp && m3u8IvTemp[1] && m3u8IV != m3u8IvTemp[1]) {
                        m3u8IV = m3u8IvTemp[1];
                        $("#tips").append('IV= <input type="text" value="' + m3u8IV + '" spellcheck="false">');
                    }
                }
                if (line.includes("KEYID=")) {
                    let keyIDTemp = /KEYID=([^,\n]*)/.exec(line);
                    if (keyIDTemp && keyIDTemp[1] && keyID != keyIDTemp[1]) {
                        keyID = keyIDTemp[1];
                        $("#tips").append('KEYID= <input type="text" value="' + keyID + '" spellcheck="false">');
                    }
                }
                if (line.includes("METHOD=")) {
                    let methodTemp = /METHOD=([^,\n]*)/.exec(line);
                    if (methodTemp && methodTemp[1] && methodTemp[1] != "NONE" && method != methodTemp[1]) {
                        method = methodTemp[1];
                        $("#tips").append('METHOD= <input type="text" value="' + method + '" spellcheck="false">');
                    }
                }
                line = KeyURL;
                isKyeUrl = true;
            }
            // fix https://test-streams.mux.dev/dai-discontinuity-deltatre/manifest.m3u8
            if (line == "\n" || line == "\r" || line == "" || line == " " || line == undefined) {
                continue;
            }

            if (line.includes("#EXTINF:")) {
                mediaDuration += parseFloat(/#EXTINF:([^,]*)/.exec(line)[1]);
            }
            if (line.includes("#EXT-X-ENDLIST")) {
                isLive = false;
            }
            //ts文件
            if (!line.includes("#")) {
                count++;
                line = fixUrl(line);
                //判断是否m3u8
                if (line.includes(".m3u8")) {
                    $("#m3u8").hide();
                    $("button").hide();
                    $("#more_m3u8").show();
                    $("#next_m3u8").append(
                        `<p><a href="/m3u8.html?m3u8_url=${encodeURIComponent(line)}&referer=${encodeURIComponent(m3u8_referer)}&title=${m3u8_title ? encodeURIComponent(m3u8_title) : ""}">${GetFile(line)}</a></p>`
                    );
                    isLive = false;
                    continue;
                }
                //格式化
                line = line.replace("\n", "").replace("\r", "");
                let results = new RegExp("[?]([^\n]*)").exec(line);
                if (!results && m3u8_arg) {
                    line = line + "?" + m3u8_arg;
                }
                !isKyeUrl && tsLists.push(line);
                if (format != "") {
                    line = format.replace("$url$", line);
                }
                textarea = textarea + line + "\n";
            }
        }
        $("#media_file").val(textarea);
        if (ExistKey) { $("#tips").show(); }
        $("#count").html("共 " + count + " 个文件" + "，总时长: " + secToTime(mediaDuration));
        if (isLive) {
            $("#count").html("直播HLS");
        }
        $('#loading').hide();

        if ($("#next_m3u8 a").length == 1) {
            $("#next_m3u8 a")[0].click();
        }
    }

    //////////////////////// 事件绑定 ////////////////////////
    //格式化
    $("#format").click(function () {
        let formatStr = $("#formatStr").val();
        show_list(formatStr);
    });
    //下载 文本格式 按钮
    $("#DownText").click(function () {
        var txt = $("#media_file").val();
        txt = "data:text/plain," + encodeURIComponent(txt);
        if (G.isFirefox) {
            downloadDataURL(txt, "media_file.txt");
            return;
        }
        chrome.downloads.download({
            url: txt,
            filename: "media_file.txt"
        });
    });
    //UrlDecode编码 按钮
    $("#UrlDecode").click(function () {
        BasePath = getManifestUrlBase(false);
        show_list();
    });
    //刷新还原 按钮
    $("#Refresh").click(function () {
        BasePath = getManifestUrlBase();
        $("#formatStr").val('wget "$url$"');
        show_list();
    });
    // 原始m3u8
    $("#originalM3U8").click(function () {
        $("#media_file").val(m3u8_content);
    });
    //把远程文件替换成本地文件
    $("#DownFixm3u8").click(function () {
        $("#media_file").val("");
        let textarea = "";
        let m3u8_split = m3u8_content.split("\n");
        for (let line of m3u8_split) {
            if (line.includes("URI=")) {
                let KeyURL = /URI="(.*)"/.exec(line);
                if (KeyURL && KeyURL[1]) {
                    KeyURL = GetFile(KeyURL[1]);
                    line = line.replace(/URI="(.*)"/, 'URI="' + KeyURL + '"');
                }
            }
            if (!line.includes("#")) {
                line = GetFile(line);
            }
            textarea = textarea + line + "\n";
        }
        $("#media_file").val(textarea);
    });

    // 播放m3u8
    $("#play").click(function () {
        if ($(this).data("switch") == "on") {
            hls = new Hls();
            const video = $('<video />', {
                controls: true,
                width: "100%"
            })[0];
            hls.loadSource(m3u8_url);
            hls.attachMedia(video);
            $("#textarea textarea").hide();
            $("#textarea").append(video);
            $("#play").html("关闭播放");
            $("#play").data("switch", "off");
            hls.on(Hls.Events.MEDIA_ATTACHED, function () {
                video.play();
            });
            return;
        }
        hls.destroy();
        $("video").remove();
        $("textarea").show();
        $("#play").html("播放m3u8");
        $("#play").data("switch", "on");
    });
    // 开启/关闭捕获
    $("#catch").click(function () {
        if ($(this).data("switch") == "on") {
            let injectScript = G.injectScript ? G.injectScript : "catch.js";
            injectScript = encodeURIComponent(injectScript);
            window.location.href = window.location.href + "&catch=" + injectScript;
            return;
        }
        window.location.href = window.location.href.replace(/&catch=[^&]*/, "");
    });

    // 监听提示变化修改网页标题
    $("#progress, #downFilepProgress").bind("DOMNodeInserted", function (e) {
        document.title = e.target.innerHTML;
    });

    // 调用m3u8DL下载
    $("#m3u8DL").click(function () {
        let m3u8dlArg = G.m3u8dlArg.replace(/\$referer\$/g, data.initiator);
        m3u8dlArg = m3u8dlArg.replace(/\$url\$/g, data.url);
        m3u8dlArg = m3u8dlArg.replace(/\$title\$/g, data.title);
        let url = 'm3u8dl://' + Base64.encode(m3u8dlArg);
        if (url.length >= 2046) {
            alert("m3u8dl参数太长,可能导致无法唤醒m3u8DL, 请手动复制到m3u8DL下载");
        }
        chrome.tabs.update({ url: url });
        // window.open(url);
    });
    // 强制下载 按钮
    $("#ForceDownload").click(function () {
        downloadAllTs();
    });
    // 返回上一页
    $("#historyBack").click(function () {
        if (window.history.length > 1) { window.history.back(); }
        window.location.href = "/m3u8.html";
    });
    // 打开目录
    $(".openDir").click(function () {
        if (downId) {
            chrome.downloads.show(downId);
            return;
        }
        chrome.downloads.showDefaultFolder();
    });
    // 切换 转换mp4格式按钮
    $(".tomp4").click(function () {
        $("#mp4").prop("checked", !$("#mp4").prop("checked"));
    });
    // Firefox 关闭播放m3u8 和 捕获
    if (G.isFirefox) {
        $("#play").hide();
        $("#catch").hide();
    }

    //////////////////////// 合并下载 ts文件 ////////////////////////
    var isComplete = false; // 是否下载完成
    var errorTsList = [];   // 下载错误的ts序号
    var tsBuffer = [];     // ts缓存
    var successCount = 1; // 已下载数量
    var stopDownload = false; // 停止下载
    /* 转码成mp4 */
    var mp4Cache = []; // mp4缓存
    var transmuxer = new muxjs.mp4.Transmuxer();
    transmuxer.on('data', function (segment) {
        let data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
        data.set(segment.initSegment, 0);
        data.set(segment.data, segment.initSegment.byteLength);
        mp4Cache.push(data);
    });
    $("#AllDownload").click(function () {
        if (isComplete) {
            downloadAllTs();
            return;
        }
        if (tsBuffer.length > 0) {
            return;
        }
        $("#progress").html(`等待下载中...`);
        let tsThread = parseInt($("#thread").val());  // 线程数量
        let tsList = [...tsLists]; // ts列表
        let tsCount = tsList.length - 1; // ts总数量
        let tsInterval = setInterval(function () {
            if (stopDownload) {
                clearInterval(tsInterval);
                $("#progress").html(stopDownload);
            }
            if (tsList.length == 0 && tsThread == parseInt($("#thread").val())) {
                isComplete = m3u8Complete();
                if (isComplete) {
                    $("#progress").html(`数据完整，下载中...`);
                    clearInterval(tsInterval);
                    downloadAllTs();
                }
                if (errorTsList.length > 0) {
                    clearInterval(tsInterval);
                    $("#progress").html(`数据不完整... 下载失败: ${errorTsList.length}`);
                }
            }
            if (tsThread > 0 && tsList.length > 0) {
                tsThread--;
                let tsUrl = tsList.shift(); // 取出一个ts地址
                let tsIndex = tsCount - tsList.length; // 当前下载的ts序号
                $.ajax({
                    url: tsUrl,
                    xhrFields: { responseType: "arraybuffer" },
                    timeout: 30000
                }).fail(function () {
                    if (stopDownload) { return; }
                    ErrorTsList(tsIndex);
                    errorTsList.push(tsIndex);
                    tsThread++;
                }).done(function (responseData) {
                    if (stopDownload) { return; }
                    tsBuffer[tsIndex] = tsDecrypt(responseData, tsIndex);
                    fileSize += tsBuffer[tsIndex].byteLength;
                    $("#fileSize").html("已下载:" + byteToSize(fileSize));
                    $("#progress").html(`${successCount++}/${tsLists.length}`);
                    if (errorTsList.length > 0) {
                        $("#progress").html($("#progress").html() + " 下载失败: " + errorTsList.length);
                    }
                    tsThread++;
                });
            }
        }, 66);
    });

    // 添加下载出错的数据 可重新下载
    function ErrorTsList(tsIndex) {
        if ($("#errorTsList").is(':hidden')) {
            $("#ForceDownload").show();
            $("#errorTsList").show();
        }
        let html = $(`<p>${tsLists[tsIndex]} <button data-id="${tsIndex}">重新下载</button></p>`);
        html.find("button").click(function () {
            if ($(this).html() == "正在重新下载") { return; }
            $(this).html("正在重新下载");
            let tsIndex = $(this).data("id");
            let url = tsLists[tsIndex];
            $.ajax({
                url: url,
                xhrFields: { responseType: "arraybuffer" },
                timeout: 30000
            }).fail(function () {
                html.find("button").html("下载失败, 继续重新下载");
            }).done(function (responseData) {
                tsBuffer[tsIndex] = tsDecrypt(responseData, tsIndex);
                fileSize += tsBuffer[tsIndex].byteLength;
                $("#fileSize").html("已下载:" + byteToSize(fileSize));
                for (let i in errorTsList) {
                    if (errorTsList[i] == tsIndex) {
                        errorTsList.splice(i, 1);
                    }
                }
                html.remove();
                $("#progress").html(`${successCount++}/${tsLists.length}`);
                if (errorTsList.length > 0) {
                    $("#progress").html($("#progress").html() + " 下载失败: " + errorTsList.length);
                }
                isComplete = m3u8Complete(true);
                if (isComplete) {
                    $("#ForceDownload").hide();
                    $("#progress").html(`数据完整，下载中...`);
                    downloadAllTs();
                }
            });
        });
        $('#errorTsList').append(html);
    }
    // 开始下载
    function downloadAllTs() {
        downState = true;
        let fileBlob = new Blob(tsBuffer, { type: "video/MP2T" });
        let ext = "ts";
        if ($("#mp4").prop("checked")) {
            for (let i of tsBuffer) {
                transmuxer.push(new Uint8Array(i));
                transmuxer.flush();
            }
            if (mp4Cache.length != 0) {
                fileBlob = new Blob(mp4Cache, { type: "video/mp4" });
                ext = "mp4";
            }
        }
        chrome.downloads.download({
            url: URL.createObjectURL(fileBlob),
            filename: `${GetFileName(m3u8_url)}.${ext}`
        });
        $("#mp4").prop("checked") ? $("#progress").html(`数据正在转换格式...`) : $("#progress").html(`数据正在合并...`);
    }
    // 解密ts文件
    function tsDecrypt(responseData, tsIndex) {
        if (!isEncrypted) {
            return responseData;
        }
        if (expandKey) {
            let iv = m3u8IV ? new TextEncoder().encode(m3u8IV) : new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, tsIndex]);
            try {
                return decryptor.decrypt(responseData, 0, iv.buffer || iv, true);
            } catch (e) {
                stopDownload = "解密出错，无法解密.";
                console.log(e);
            }
        } else {
            stopDownload = "密钥错误，无法解密.";
        }
    }
    // 验证ts文件是否完整
    function m3u8Complete(isError = false) {
        $("#progress").html(`下载数据校验中...`);
        for (let i = 0; i < tsLists.length; i++) {
            if (tsBuffer[i] == undefined) {
                isError && $("#progress").html(`数据不完整... 下载失败: ${errorTsList.length}`);
                return false;
            }
        }
        $("#progress").html(`数据完整`);
        return true
    }
})