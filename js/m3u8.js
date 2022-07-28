// url 参数解析
const params = new URL(location.href).searchParams;
const _m3u8Url = params.get("url");
const _referer = params.get("referer");
const _title = params.get("title");

// 解析参数 注入脚本
let onCatch = new RegExp("&catch=([^\n&]*)").exec(window.location.href);
if (onCatch) {
    onCatch = decodeURIComponent(onCatch[1]);
    onCatch = onCatch == "catch.js" ? "js/catch.js" : "js/recorder.js";  // Security
    const script = document.createElement('script');
    script.src = onCatch;
    document.head.appendChild(script);
}
var debug;
$(function () {
    // 捕获开关按钮
    if (onCatch) {
        $("#catch").html("关闭捕获");
        $("#catch").data("switch", "off");
    }
    // Firefox 关闭播放m3u8 和 捕获
    if (G.isFirefox) {
        $("#play").hide();
        $("#catch").hide();
    }
    //获取m3u8参数
    var _m3u8Arg = new RegExp("\\.m3u8\\?([^\n]*)").exec(_m3u8Url);
    if (_m3u8Arg) {
        _m3u8Arg = _m3u8Arg[1];
    }
    // 填充m3u8 url到页面
    $("#m3u8_url").attr("href", _m3u8Url).html(_m3u8Url);
    var _m3u8Content;   // 储存m3u8文件内容
    /* m3u8 解析工具 */
    const hls = new Hls();  // hls.js 对象
    const _fragments = []; // 储存切片对象
    debug = _fragments;
    const keyContent = new Map(); // 储存key的内容
    const decryptor = new AESDecryptor(); // 解密工具
    var skipDecrypt = false; // 是否跳过解密
    /* 转码工具 */
    const mp4Cache = [];  // mp4格式缓存
    const transmuxer = new muxjs.mp4.Transmuxer();    // mux.js 对象
    transmuxer.on('data', function (segment) {
        let data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
        data.set(segment.initSegment, 0);
        data.set(segment.data, segment.initSegment.byteLength);
        mp4Cache.push(data);
    });
    /* 下载相关 */
    var downId = 0; // 下载id
    var stopDownload = false; // 停止下载flag
    var fileSize = 0; // 文件大小
    var downCurrentTs = 0;    // 当前进度
    var downTotalTs = 0;  // 需要下载的文件数量
    const tsBuffer = []; // ts内容缓存
    const errorTsList = []; // 下载错误ts序号列表

    // 如果存在Referer修改当前标签下的所有xhr的Referer
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
        // 开始解析
        parseM3U8();
    });

    /* 解析函数 使用hls解析好的数据 进一步处理 */
    function parseM3U8() {
        hls.loadSource(_m3u8Url);    // 载入m3u8 url
        // 等待m3u8解析完成 获得解析的数据
        hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
            // console.log(data);
            $("#m3u8").show(); $("#loading").hide();
            let more = false;
            // 多个视频
            if (data.levels.length > 1) {
                $("#more_m3u8").show();
                more = true;
                for (let item of data.levels) {
                    const url = encodeURIComponent(item.uri);
                    const referer = encodeURIComponent(_referer);
                    const title = _title ? encodeURIComponent(_title) : "";
                    const name = GetFile(item.uri);
                    const html = `<div class="block"><div>${item.attrs.RESOLUTION ? "分辨率:" + item.attrs.RESOLUTION : ""}${item.attrs.BANDWIDTH ? " | 码率:" + item.attrs.BANDWIDTH : ""}</div><a href="/m3u8.html?url=${url}&referer=${referer}&title=${title}">${name}</a></div>`;
                    $("#next_m3u8").append(html);
                }
            }
            // 多个音频
            if (data.audioTracks.length > 1) {
                $("#more_audio").show();
                more = true;
                for (let item of data.audioTracks) {
                    const url = encodeURIComponent(item.url);
                    const referer = encodeURIComponent(_referer);
                    const title = _title ? encodeURIComponent(_title) : "";
                    const name = GetFile(item.url);
                    const html = `<div class="block"><div>${item.name ? item.name : ""} | ${item.lang ? item.lang : ""}</div><a href="/m3u8.html?url=${url}&referer=${referer}&title=${title}">${name}</a></div>`;
                    $("#next_audio").append(html);
                }
            }
            // 多个字幕
            if (data.subtitleTracks.length > 1) {
                $("#more_subtitle").show();
                more = true;
                for (let item of data.subtitleTracks) {
                    const url = encodeURIComponent(item.url);
                    const referer = encodeURIComponent(_referer);
                    const title = _title ? encodeURIComponent(_title) : "";
                    const name = GetFile(item.url);
                    const html = `<div class="block"><div>${item.name ? item.name : ""} | ${item.lang ? item.lang : ""}</div><a href="/m3u8.html?url=${url}&referer=${referer}&title=${title}">${name}</a></div>`;
                    $("#next_subtitle").append(html);
                }
            }
            // 有下一级m3u8 停止解析
            if (more) {
                $("#m3u8").hide();
                $("button").hide();
                return;
            }
            // 等待ts载入完成 提取Ts链接
            hls.on(Hls.Events.LEVEL_LOADED, function (event, data) {
                // console.log(data);
                parseTs(data.details);  // 提取Ts链接
            });
        });
        // m3u8下载or解析错误
        hls.on(Hls.Events.ERROR, function (event, data) {
            $("#m3u8").hide(); $("#loading").show();
            $("#loading .optionBox").html(`获取m3u8内容失败, 请尝试手动下载<br><a href="${_m3u8Url}">${_m3u8Url}</a>`);
            console.log(data.error);
        });
    }
    /* 提取所有ts链接 判断处理 */
    function parseTs(data) {
        let isEncrypted = false;
        _fragments.splice(0);   // 清空 防止直播HLS无限添加
        _m3u8Content = data.m3u8;   // m3u8文件内容
        for (let i in data.fragments) {
            // 把本地ts文件地址 转换成远程地址 并添加地址参数
            let flag = new RegExp("[?]([^\n]*)").exec(data.fragments[i].url);
            if (!flag && _m3u8Arg) {
                data.fragments[i].url = data.fragments[i].url + "?" + _m3u8Arg;
            }
            // 查看是否有加密数据
            if (data.fragments[i].decryptdata && data.fragments[i].decryptdata.iv) {
                isEncrypted = true;
                // 填入key内容
                Object.defineProperty(data.fragments[i].decryptdata, "keyContent", {
                    get: function () { return keyContent.get(this.uri); },
                    configurable: true
                });
                // 如果不存在key内容 开始下载
                if (!keyContent.get(data.fragments[i].decryptdata.uri)) {
                    // 占位 等待ajax获取key内容
                    keyContent.set(data.fragments[i].decryptdata.uri, true);
                    // 下载key内容
                    $.ajax({
                        url: data.fragments[i].decryptdata.uri,
                        xhrFields: { responseType: "arraybuffer" }
                    }).fail(function () {
                        keyContent.set(data.fragments[i].decryptdata.uri, undefined);
                    }).done(function (responseData) {
                        if (typeof responseData == "string") {
                            if (responseData == "[object ArrayBuffer]" ||
                                responseData.includes("404") ||
                                responseData.toLowerCase.includes("error")
                            ) {
                                keyContent.set(data.fragments[i].decryptdata.uri, undefined);
                                $("#tips").append('密钥(Key)Base64: <input type="text" value="密钥无法下载, 请检查密钥地址是否正确" spellcheck="false" readonly="readonly">');
                                return;
                            }
                            responseData = new TextEncoder().encode(responseData).buffer;
                        }
                        keyContent.set(data.fragments[i].decryptdata.uri, responseData); // 储存密钥内容
                        $("#tips").append('密钥(Hex): <input type="text" value="' + ArrayBufferToHexString(responseData) + '" spellcheck="false" readonly="readonly">');
                        $("#tips").append('密钥(Base64): <input type="text" value="' + ArrayBufferToBase64(responseData) + '" spellcheck="false" readonly="readonly">');
                    });
                    data.fragments[i].decryptdata.method && $("#tips").append('加密算法(Method): <input type="text" value="' + data.fragments[i].decryptdata.method + '" spellcheck="false" readonly="readonly">');
                    $("#tips").append('密钥地址(KeyURL): <input type="text" value="' + data.fragments[i].decryptdata.uri + '" spellcheck="false" readonly="readonly">');
                    // 如果iv是默认模式 不显示
                    let iv = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, i + 1]).toString();
                    let iv2 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, i]).toString();
                    let _iv = data.fragments[i].decryptdata.iv.toString();
                    if (_iv != iv && _iv != iv2) {
                        iv = Uint8ArrayToHexString(data.fragments[i].decryptdata.iv);
                        $("#tips").append('偏移量(iv): <input type="text" value="' + iv + '" spellcheck="false" readonly="readonly">');
                    }
                }
            }
            _fragments.push({
                url: data.fragments[i].url,
                decryptdata: data.fragments[i].decryptdata
            });
            // 范围下载所需数据
            $("#rangeStart").attr("max", _fragments.length);
            $("#rangeEnd").attr("max", _fragments.length);
            $("#rangeStart").val(1);
            $("#rangeEnd").val(_fragments.length);
        }
        writeTsUrl();   // 写入ts链接到textarea
        $("#count").html("共 " + _fragments.length + " 个文件" + "，总时长: " + secToTime(data.totalduration));
        data.live && $("#count").html("直播HLS");
        isEncrypted && $("#count").html($("#count").html() + " (加密HLS)");
    }
    /**************************** 监听 / 按钮绑定 ****************************/
    // 监听下载事件 修改提示
    chrome.downloads.onChanged.addListener(function (downloadDelta) {
        if (!downloadDelta.state) { return; }
        if (downloadDelta.state.current == "complete" && downId != 0) {
            $("#progress").html("已保存到硬盘, 请查看浏览器已下载内容");
        }
    });
    // 打开目录
    $(".openDir").click(function () {
        if (downId) {
            chrome.downloads.show(downId);
            return;
        }
        chrome.downloads.showDefaultFolder();
    });
    // 下载显示的内容
    $("#downText").click(function () {
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
    // 原始m3u8
    $("#originalM3U8").click(function () {
        $("#media_file").val(_m3u8Content);
    });
    // 提取ts
    $("#getTs").click(function () {
        writeTsUrl();
    });
    //把远程文件替换成本地文件
    $("#localFile").click(function () {
        $("#media_file").val("");
        let textarea = "";
        let m3u8_split = _m3u8Content.split("\n");
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
            textarea += line + "\n";
        }
        $("#media_file").val(textarea);
    });
    // 播放m3u8
    $("#play").click(function () {
        if ($(this).data("switch") == "on") {
            $("#video").show();
            hls.attachMedia($("#video")[0]);
            $("#textarea textarea").hide();
            $("#textarea").append(video);
            $("#play").html("关闭播放");
            $("#play").data("switch", "off");
            hls.on(Hls.Events.MEDIA_ATTACHED, function () {
                video.play();
            });
            return;
        }
        $("#video").hide();
        $("#video")[0].pause();
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
    // 调用m3u8DL下载
    $("#m3u8DL").click(function () {
        let m3u8dlArg = G.m3u8dlArg.replace(/\$referer\$/g, _referer);
        m3u8dlArg = m3u8dlArg.replace(/\$url\$/g, _m3u8Url);
        m3u8dlArg = m3u8dlArg.replace(/\$title\$/g, _title);
        let m3u8dl = 'm3u8dl://' + Base64.encode(m3u8dlArg);
        if (m3u8dl.length >= 2046) {
            alert("m3u8dl参数太长,可能导致无法唤醒m3u8DL, 请手动复制到m3u8DL下载");
        }
        chrome.tabs.update({ url: m3u8dl });
    });
    // 切换 转换mp4格式按钮
    $(".mp4div").click(function () {
        $("#mp4").prop("checked", !$("#mp4").prop("checked"));
    });
    // 切换 跳过解密
    $(".skipDecryptDiv").click(function () {
        $("#skipDecrypt").prop("checked", !$("#skipDecrypt").prop("checked"));
    });
    $("#skipDecrypt, #mp4").click(function (event) {
        event.originalEvent.cancelBubble = true;
    });
    // 范围 线程数 滚轮调节
    $("#rangeStart, #rangeEnd, #thread").on("wheel", function (event) {
        $(this).blur();
        let number = parseInt($(this).val());
        number = event.originalEvent.wheelDelta < 0 ? number - 1 : number + 1;
        if (number < $(this).attr("min") || number > $(this).attr("max")) {
            return false;
        }
        $(this).val(number);
        return false;
    });
    // 在线下载合并ts
    $("#mergeTs").click(function () {
        fileSize = 0;
        let start = 0;
        let end = _fragments.length - 1;
        if ($("#rangeStart").val()) {
            start = parseInt($("#rangeStart").val()) - 1;
        }
        if ($("#rangeEnd").val()) {
            end = parseInt($("#rangeEnd").val()) - 1;
        }
        if (start > end) {
            $("#progress").html(`<b>开始序号不能大于结束序号</b>`);
            return;
        }
        if (start > _fragments.length - 1 || end > _fragments.length - 1) {
            $("#progress").html(`<b>序号最大不能超过${_fragments.length}</b>`);
            return;
        }
        downCurrentTs = 0;  // 当前进度
        downTotalTs = end - start + 1;  // 需要下载的文件数量
        skipDecrypt = $("#skipDecrypt").prop("checked");    // 是否跳过解密
        downloadTs(start, end);
    });
    // 强制下载
    $("ForceDownload").click(function () {
        mergeTs();
    });
    /**************************** 下载TS文件 ****************************/
    // start 开始下载的索引
    // end 结束下载的索引
    function downloadTs(start = 0, end = _fragments.length - 1, errorObj = undefined) {
        buttonState("#mergeTs", false);
        // 查看自定义key和iv 是否存在
        let customKey = $("#customKey").val();
        let customIV = $("#customIV").val();
        if (customKey) {
            // Base64 转 ArrayBuffer
            let temp = Base64.atob(customKey);
            customKey = new Uint8Array(new ArrayBuffer(temp.length));
            for (i = 0; i < temp.length; i++) {
                customKey[i] = temp.charCodeAt(i);
            }
            keyContent.forEach(function (value, key) {
                keyContent.set(key, customKey.buffer);
            });
        }
        if (customIV) {
            let iv = new TextEncoder().encode(customIV);
            for (let i in _fragments) {
                _fragments[i].decryptdata.iv = iv;
            }
        }
        $("#progress").html(`${downCurrentTs}/${downTotalTs}`); // 进度显示
        const _tsThread = parseInt($("#thread").val());  // 原始线程数量
        let tsThread = _tsThread;  // 线程数量
        let index = start - 1; // 当前下载的索引
        const tsInterval = setInterval(function () {
            // 停止下载flag
            if (stopDownload) {
                clearInterval(tsInterval);
                $("#progress").html(stopDownload);
            }
            // 列表为空 等待线程数回归 检查是否下载完成
            if (index == end && tsThread == _tsThread) {
                clearInterval(tsInterval);
                // 错误列表为0 下载完成
                if (errorTsList.length == 0) {
                    $("ForceDownload").hide();
                    $("#errorTsList").hide();
                    mergeTs();  // 合并下载
                    return;
                }
                $("#progress").html(`数据不完整... 剩余未下载: ${errorTsList.length}`);
                return;
            }
            // 下载
            if (tsThread > 0 && index < end) {
                tsThread--;
                let currentIndex = ++index;   // 当前下载的索引
                $.ajax({
                    url: _fragments[currentIndex].url,
                    xhrFields: { responseType: "arraybuffer" },
                    timeout: 30000
                }).fail(function () {
                    if (stopDownload) { return; }
                    if (errorObj) {
                        errorObj.find("button").html("下载失败...重试");
                        buttonState(errorObj.find("button"), true);
                    }
                    if (!errorTsList.includes(currentIndex)) {
                        errorTsList.push(currentIndex);
                        downloadTsError(currentIndex);
                    }
                }).done(function (responseData) {
                    if (stopDownload) { return; }
                    if (errorObj) { errorObj.remove(); }
                    if (errorTsList.includes(currentIndex)) {
                        errorTsList.splice(errorTsList.indexOf(currentIndex), 1);
                    }
                    tsBuffer[currentIndex] = tsDecrypt(responseData, currentIndex);   //解密m3u8
                    fileSize += tsBuffer[currentIndex].byteLength;
                    $("#fileSize").html("已下载:" + byteToSize(fileSize));
                    progressAdd();
                }).always(function () {
                    tsThread++;
                });
            }
        }, 10);
    }
    // 下载ts出现错误
    function downloadTsError(index) {
        if ($("#errorTsList").is(':hidden')) {
            $("#ForceDownload").show();
            $("#errorTsList").show();
        }
        let html = $(`<p>${_fragments[index].url} <button data-id="${index}">重新下载</button></p>`);
        html.find("button").click(function () {
            buttonState(this, false);
            $(this).html("正在重新下载...");
            downloadTs(index, index, html);
        });
        $('#errorTsList').append(html);
    }
    // 合并下载
    function mergeTs() {
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
            filename: `${GetFileName(_m3u8Url)}.${ext}`
        }, function (downloadId) { downId = downloadId });
        buttonState("#mergeTs", true);
    }
    // ts解密
    function tsDecrypt(responseData, index) {
        if (!_fragments[index].decryptdata || skipDecrypt) {
            return responseData;
        }
        try {
            decryptor.expandKey(_fragments[index].decryptdata.keyContent);
        } catch (e) {
            stopDownload = "密钥类型错误";
            console.log(e);
            return;
        }
        try {
            return decryptor.decrypt(responseData, 0, _fragments[index].decryptdata.iv.buffer, true);
        } catch (e) {
            stopDownload = "解密失败，无法解密.";
            console.log(e);
        }
    }
    // 写入ts链接
    function writeTsUrl() {
        let url = [];
        for (let ts of _fragments) {
            url.push(ts.url);
        }
        $("#media_file").val(url.join("\n"));
    }
    // 进度
    function progressAdd() {
        downCurrentTs++;
        if (downCurrentTs == downTotalTs) {
            $("#progress").html($("#mp4").prop("checked") ? `数据正在转换格式...` : `数据正在合并...`);
            return;
        }
        $("#progress").html(`${downCurrentTs}/${downTotalTs}`);
    }
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
    if (G.TitleName && _title) {
        return _title;
    }
    url = GetFile(url);
    url = url.split(".");
    url.pop();
    return url.join(".");
}
// Uint8Array 转 16进制字符串
function Uint8ArrayToHexString(data) {
    let result = "0x";
    for (let i = 0; i < data.length; i++) {
        result += data[i].toString(16);
    }
    return result;
}
// ArrayBuffer 转 16进制字符串
function ArrayBufferToHexString(buffer) {
    let binary = "";
    let bytes = new Uint8Array(buffer);
    let len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += ('00' + bytes[i].toString(16)).slice(-2);
    }
    return binary;
}
// ArrayBuffer 转 Base64
function ArrayBufferToBase64(buffer) {
    let binary = "";
    let bytes = new Uint8Array(buffer);
    let len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return Base64.encode(binary);
}
// 按钮状态
function buttonState(obj = "#mergeTs", state = true) {
    if (state) {
        $(obj).prop("disabled", false).removeClass("no-drop");
        return;
    }
    $(obj).prop("disabled", true).addClass("no-drop");
}