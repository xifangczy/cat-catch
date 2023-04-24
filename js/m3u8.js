// url 参数解析
const params = new URL(location.href).searchParams;
let _m3u8Url = params.get("url");
const _referer = params.get("referer");
const _initiator = params.get("initiator");
const _title = params.get("title");
const tsAddArg = params.get("tsAddArg");
const getId = parseInt(params.get("getId"));
const tabId = parseInt(params.get("tabid"));
const key = params.get("key");
// 修改当前标签下的所有xhr的Referer
_referer ? setReferer(_referer) : deleteReferer();
$(function () {
    // 默认设置
    chrome.storage.local.get({
        thread: 32,
        mp4: false,
        onlyAudio: false,
        saveAs: false,
        skipDecrypt: false,
        StreamSaver: false,
        ffmpeg: true,
    }, function (items) {
        $("#thread").val(items.thread);
        $("#mp4").prop("checked", items.mp4);
        $("#onlyAudio").prop("checked", items.onlyAudio);
        $("#saveAs").prop("checked", items.saveAs);
        $("#skipDecrypt").prop("checked", items.skipDecrypt);
        $("#StreamSaver").prop("checked", items.StreamSaver);
        $("#ffmpeg").prop("checked", items.ffmpeg);
    });
    if (G.isFirefox) {
        $(".firefoxHide").each(function () { $(this).hide(); });
    }
    key && $("#customKey").val(key);

    //获取m3u8参数
    let _m3u8Arg = new RegExp("\\.m3u8\\?([^\n]*)").exec(_m3u8Url);
    if (_m3u8Arg) {
        _m3u8Arg = _m3u8Arg[1];
    }
    let _m3u8Content;   // 储存m3u8文件内容
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
    /* 下载相关 */
    let downId = 0; // 下载id
    let stopDownload = false; // 停止下载flag
    let fileSize = 0; // 文件大小
    let downDuration = 0; // 下载媒体得时长
    let downCurrentTs = 0;    // 当前进度
    let downTotalTs = 0;  // 需要下载的文件数量
    const tsBuffer = []; // ts内容缓存
    const errorTsList = []; // 下载错误ts序号列表
    // let StreamSaver = false; // 流式下载
    let fileStream = undefined; // 流式下载文件输出流
    /* 录制相关 */
    let recorder = false; // 开关
    let recorderIndex = 0;  // 下载索引
    let recorderLast = "";  // 最后下载的url
    /* m3u8DL */
    let addParam = false;
    /* DOM */
    const $fileSize = $("#fileSize");
    const $progress = $("#progress");
    const $fileDuration = $("#fileDuration");

    if (isEmpty(_m3u8Url)) {
        $("#loading").hide(); $("#m3u8Custom").show();
        $("#parse").click(function () {
            let m3u8Text = $("#m3u8Text").val().trim();
            let baseUrl = $("#baseUrl").val().trim();
            let m3u8Url = $("#m3u8Url").val().trim();
            let referer = $("#referer").val().trim();
            if (m3u8Url != "") {
                chrome.tabs.update({ url: "m3u8.html?url=" + encodeURIComponent(m3u8Url) + "&referer=" + referer });
                return;
            }
            if (referer != "") {
                setReferer(referer);
            }
            if (baseUrl != "") {
                m3u8Text = addBashUrl(baseUrl, m3u8Text);
            }
            if (!m3u8Text.includes("#EXTM3U")) {
                m3u8Text = tsListTom3u8Text(m3u8Text);
            }
            _m3u8Url = URL.createObjectURL(new Blob([new TextEncoder("utf-8").encode(m3u8Text)]));
            parseM3U8();
            $("#m3u8Custom").hide();
        });
        // 从mpd解析器读取数据
        if (getId) {
            chrome.tabs.sendMessage(getId, "getM3u8", function (result) {
                $("#m3u8Text").html(result.m3u8Content);
                $("#parse").click();
                $("#info").html(result.mediaInfo);
            });
        }
    } else {
        parseM3U8();
    }

    /* 解析函数 使用hls解析好的数据 进一步处理 */
    function getNewUrl(item){
        const url = encodeURIComponent(item.uri);
        const referer = _referer ? "&referer=" + encodeURIComponent(_referer) : "&initiator=" + (_initiator ? encodeURIComponent(_initiator) : "");
        const title = _title ? encodeURIComponent(_title) : "";
        const name = GetFile(item.uri);
        let newUrl = `/m3u8.html?url=${url}${referer}`;
        if (title) { newUrl += `&title=${title}`; }
        if (tabId) { newUrl += `&tabid=${tabId}`; }
        if (key) { newUrl += `&key=${key}`; }
        return [name, newUrl];
    }
    function parseM3U8() {
        $("#m3u8_url").attr("href", _m3u8Url).html(_m3u8Url);
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
                    const [name, url] = getNewUrl(item);
                    const html = `<div class="block">
                        <div>${item.attrs.RESOLUTION ? "分辨率:" + item.attrs.RESOLUTION : ""}${item.attrs.BANDWIDTH ? " | 码率:" + (parseInt(item.attrs.BANDWIDTH / 1000) + " Kbps") : ""}</div>
                        <a href="${url}">${name}</a>
                    </div>`;
                    $("#next_m3u8").append(html);
                }
            }
            // 多个音频
            if (data.audioTracks.length > 1) {
                $("#more_audio").show();
                more = true;
                for (let item of data.audioTracks) {
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
                    const [name, url] = getNewUrl(item);
                    const html = `<div class="block">
                        <div>${item.name ? item.name : ""} | ${item.lang ? item.lang : ""}</div>
                        <a href="${url}">${name}</a>
                    </div>`;
                    $("#next_audio").append(html);
                }
            }
            // 多个字幕
            if (data.subtitleTracks.length > 1) {
                $("#more_subtitle").show();
                more = true;
                for (let item of data.subtitleTracks) {
                    const [name, url] = getNewUrl(item);
                    const html = `<div class="block">
                        <div>${item.name ? item.name : ""} | ${item.lang ? item.lang : ""}</div>
                        <a href="${url}">${name}</a>
                    </div>`;
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
                // 获取视频信息
                if ($(".videoInfo #info").html() == "") {
                    getVideoInfo();
                }
            });
        });
        // m3u8下载or解析错误
        hls.on(Hls.Events.ERROR, function (event, data) {
            $("#loading").show();
            $("#loading .optionBox").html(`解析或播放m3u8文件中有错误, 详细错误信息查看控制台`);
            console.log(data);
            // 尝试添加删除referer
            if (data.type == "networkError") {
                if (_referer) {
                    $("#loading .optionBox").append(`<p><a href="${window.location.href.replace("&referer=", "&initiator=")}">删除Referer重新尝试</a></p>`);
                    return;
                }
                _initiator && $("#loading .optionBox").append(`<p><a href="${window.location.href.replace("&initiator=", "&referer=")}">添加Referer重新尝试</a></p>`);
            }
        });
        hls.on(Hls.Events.BUFFER_CREATED, function (event, data) {
            // console.log(data);
            const info = $(".videoInfo #info");
            if (data.tracks && info.html() == "") {
                if (data.tracks.audiovideo) {
                    if (data.tracks.audiovideo?.metadata) {
                        info.append(" 分辨率: " + data.tracks.audiovideo.metadata.width + "x" + data.tracks.audiovideo.metadata.height);
                    }
                    return;
                }
                !data.tracks.audio && info.append(" (无音频)");
                if (!data.tracks.video) {
                    info.append(" (无视频)");
                    // 下载第一个切片 判断是否H265编码
                    fetch(_fragments[0].url).then(response => response.arrayBuffer())
                        .then(function (data) {
                            data = new Uint8Array(data);
                            // 非ts文件 或 已加密
                            if (data[0] != 0x47 || data[1] != 0x40) { return; }
                            for (let i = 0; i < data.length; i++) {
                                if (data[i] == 0x47 && data[i + 1] != 0x40) {
                                    // 0x24 H.265
                                    if (data[i + 17] == 0x24) {
                                        info.html(info.html().replace("无视频", "<b>HEVC/H.265编码ts文件 只支持在线ffmpeg转码</b>"));
                                        $("#mp4").prop("checked", false);
                                    }
                                    return;
                                }
                            }
                        }).catch(function (error) {
                            console.log(error);
                        });
                }
                if (data.tracks.video?.metadata) {
                    info.append(" 分辨率: " + data.tracks.video.metadata.width + "x" + data.tracks.video.metadata.height);
                }
            }
        });
    }
    async function getVideoInfo() {
        const video = document.createElement("video");
        video.muted = true;
        video.autoplay = false;
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
            video.play();
        });
        video.oncanplay = function () {
            hls.detachMedia(video);
            video.remove();
        }
        delete video;
    }
    /* 提取所有ts链接 判断处理 */
    function parseTs(data) {
        // console.log(data);
        let isEncrypted = false;
        _fragments.splice(0);   // 清空 防止直播HLS无限添加
        /* 获取 m3u8文件原始内容 MANIFEST_PARSED也能获取但偶尔会为空(BUG?) 放在LEVEL_LOADED获取更安全*/
        _m3u8Content = data.m3u8;
        for (let i in data.fragments) {
            /* 
            * 少部分网站下载ts必须带有参数才能正常下载
            * ts地址如果没有参数 添加m3u8地址的参数
            */
            if (tsAddArg && _m3u8Arg) {
                const flag = new RegExp("[?]([^\n]*)").exec(data.fragments[i].url);
                if (!flag) {
                    data.fragments[i].url = data.fragments[i].url + "?" + _m3u8Arg;
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
                fetch(data.fragments[i].initSegment.url)
                    .then(response => response.arrayBuffer())
                    .then(function (buffer) {
                        initData.set(data.fragments[i].initSegment.url, buffer);
                    }).catch(function (error) { console.log(error); });
                $("#tips").append('初始化片段(EXT-X-MAP): <input type="text" class="keyUrl" value="' + data.fragments[i].initSegment.url + '" spellcheck="false" readonly="readonly">');
            }
            if (data.live && data.fragments[i].initSegment && tsBuffer.length == 0) {
                initSegment = data.fragments[i].initSegment;
            }
            _fragments.push({
                url: data.fragments[i].url,
                decryptdata: data.fragments[i].decryptdata,
                encrypted: data.fragments[i].encrypted,
                duration: data.fragments[i].duration,
                initSegment: initSegment
            });
        }

        // 录制直播
        if (recorder) {
            let indexLast = -1;
            for (let index = 0; index < _fragments.length; index++) {
                if (_fragments[index].url == recorderLast) {
                    indexLast = index;
                    break;
                }
            }
            recorderLast = _fragments[_fragments.length - 1].url;
            fileStream ? streamDownload(indexLast + 1) : downloadTs(indexLast + 1);
        }

        writeText(_fragments);   // 写入ts链接到textarea
        $("#count").append("共 " + _fragments.length + " 个文件" + "，总时长: " + secToTime(data.totalduration));
        if (data.live) {
            $("#recorder").show();
            $("#count").html("直播HLS");
        }
        isEncrypted && $("#count").append(" (加密HLS)");
        if (_m3u8Content.includes("#EXT-X-KEY:METHOD=SAMPLE-AES-CTR")) {
            $("#count").append(' <b>使用SAMPLE-AES-CTR加密的资源, 目前无法处理.</b>');
        }
        // 范围下载所需数据
        $("#rangeStart").attr("max", _fragments.length);
        $("#rangeEnd").attr("max", _fragments.length);
        $("#rangeStart").val(1);
        $("#rangeEnd").val(_fragments.length);
        $("#m3u8dlArg").val(getM3u8DlArg());
    }
    function showKeyInfo(buffer, decryptdata, i) {
        $("#tips").append('密钥地址(KeyURL): <input type="text" value="' + decryptdata.uri + '" spellcheck="false" readonly="readonly" class="keyUrl">');
        if (buffer) {
            $("#tips").append(`
                <div class="key flex">
                    <div class="method">加密算法(Method): <input type="text" value="${decryptdata.method ? decryptdata.method : "NONE"}" spellcheck="false" readonly="readonly"></div>
                    <div>密钥(Hex): <input type="text" value="${ArrayBufferToHexString(buffer)}" spellcheck="false" readonly="readonly"></div>
                    <div>密钥(Base64): <input type="text" value="${ArrayBufferToBase64(buffer)}" spellcheck="false" readonly="readonly"></div>
                    <select id="maybeKey" class="m3u8Key select hide"><option value="tips">寻找到疑似密钥</option></select>
                </div>
            `);
        } else {
            $("#tips").append(`
                <div class="key flex">
                    <div class="method">加密算法(Method): <input type="text" value="${decryptdata.method ? decryptdata.method : "NONE"}" spellcheck="false" readonly="readonly"></div>
                    <div>密钥(Hex): <input type="text" value="密钥下载失败" spellcheck="false" readonly="readonly"></div>
                    <select id="maybeKey" class="m3u8Key select hide"><option value="tips">寻找到疑似密钥</option></select>
                </div>
            `);
        }
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { Message: "getKey" }, function (result) {
                if (chrome.runtime.lastError || !result || result.length == 0) { return; }
                const maybeKey = $("#maybeKey");
                for (let item of result) {
                    maybeKey.append(`<option value="${item}">${item}</option>`);
                }
                maybeKey.show();
                maybeKey.change(function () {
                    this.value != "tips" && $("#customKey").val(this.value);
                    $("#m3u8dlArg").val(getM3u8DlArg());
                });
            });
        }
        // 如果是默认iv 则不显示
        let iv = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, i + 1]).toString();
        let iv2 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, i]).toString();
        let _iv = decryptdata.iv.toString();
        if (_iv != iv && _iv != iv2) {
            iv = "0x" + ArrayBufferToHexString(decryptdata.iv.buffer);
            $("#tips").append('<div class="key flex"><div>偏移量(IV): <input type="text" value="' + iv + '" spellcheck="false" readonly="readonly" class="offset"></div></div>');
        }
        // $("#tips").append("<div class=\"line\"></div>");
    }
    /**************************** 监听 / 按钮绑定 ****************************/
    // 监听下载事件 修改提示
    chrome.downloads.onChanged.addListener(function (downloadDelta) {
        if (!downloadDelta.state) { return; }
        if (downloadDelta.state.current == "complete" && downId != 0) {
            $progress.html("已保存到硬盘, 请查看浏览器已下载内容");
        }
    });
    // 打开目录
    $(".openDir").click(function () {
        downId ? chrome.downloads.show(downId) : chrome.downloads.showDefaultFolder();
    });
    // 下载显示的内容
    $("#downText").click(function () {
        let text = $("#media_file").val().replace(/\n\n/g, "\n");
        text = encodeURIComponent(text);
        let type = $("#media_file").data("type");
        let downType = "data:text/plain,";
        let filename = GetFileName(_m3u8Url) + '.txt';
        if (type == "m3u8") {
            downType = "data:application/vnd.apple.mpegurl,";
            filename = GetFile(_m3u8Url);
        }
        text = downType + text;
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
        writeText(_m3u8Content);
    });
    // 提取ts
    $("#getTs").click(function () {
        writeText(_fragments);
    });
    //把远程文件替换成本地文件
    $("#localFile").click(function () {
        writeText("");
        let textarea = "";
        let m3u8_split = _m3u8Content.split("\n");
        for (let key in m3u8_split) {
            if (isEmpty(m3u8_split[key])) { continue; }
            if (m3u8_split[key].includes("URI=")) {
                let KeyURL = /URI="(.*)"/.exec(m3u8_split[key]);
                if (KeyURL && KeyURL[1]) {
                    KeyURL = GetFile(KeyURL[1]);
                    m3u8_split[key] = m3u8_split[key].replace(/URI="(.*)"/, 'URI="' + KeyURL + '"');
                }
            }
            if (!m3u8_split[key].includes("#")) {
                m3u8_split[key] = GetFile(m3u8_split[key]);
            }
            textarea += m3u8_split[key] + "\n";
        }
        writeText(textarea);
    });
    // 播放m3u8
    $("#play").click(function () {
        if ($(this).data("switch") == "on") {
            $("#video").show();
            hls.attachMedia($("#video")[0]);
            $("#media_file").hide();
            $(this).html("关闭播放").data("switch", "off");
            hls.on(Hls.Events.MEDIA_ATTACHED, function () {
                video.play();
            });
            return;
        }
        $("#video").hide();
        hls.detachMedia($("#video")[0]);
        $("#media_file").show();
        $(this).html("播放").data("switch", "on");
    });
    // 调用m3u8DL下载
    $("#m3u8DL").click(function () {
        const m3u8dlArg = $("#m3u8dlArg").val();
        navigator.clipboard.writeText(m3u8dlArg);
        const m3u8dl = 'm3u8dl://' + Base64.encode(m3u8dlArg);
        if (m3u8dl.length >= 2046) {
            alert("m3u8dl参数太长,可能导致无法唤醒m3u8DL, 请手动复制到m3u8DL下载");
        }
        chrome.tabs.update({ url: m3u8dl });
    });
    // 复制m3u8DL命令
    $("#copyM3U8dl").click(function () {
        const m3u8dlArg = $("#m3u8dlArg").val();
        navigator.clipboard.writeText(m3u8dlArg);
    });
    // m3u8DL参数设置
    $("#setM3u8dl").click(function () {
        $("#m3u8dlArg").slideToggle();
    });
    // 设置载入参数
    $("#loadParam").click(function () {
        addParam = !addParam;
        this.innerHTML = addParam ? "取消设置参数" : "载入设置参数";
        $("#m3u8dlArg").val(getM3u8DlArg());
    });
    $("input").click(function () {
        $("#m3u8dlArg").val(getM3u8DlArg());
    });
    $("input").keyup(function () {
        $("#m3u8dlArg").val(getM3u8DlArg());
    });
    // 只要音频
    $("#onlyAudio").on("change", function () {
        if ($(this).prop("checked") && !$("#mp4").prop("checked") && !$("#ffmpeg").prop("checked")) {
            $("#mp4").click();
        }
    });
    $("#mp4").on("change", function () {
        $("#ffmpeg").prop("checked") && $("#ffmpeg").click();
        if (!$(this).prop("checked") && !$("#ffmpeg").prop("checked") && $("#onlyAudio").prop("checked")) {
            $("#onlyAudio").click();
        }
    });
    $("#StreamSaver").on("change", function () {
        if ($(this).prop("checked")) {
            $progress.html("边下边存功能<br><b>不支持ffmpeg在线转换格式</b> <b>不支持错误切片重下</b> <b>不支持另存为</b>");
            $("#ffmpeg").prop("checked") && $("#ffmpeg").click();
            $("#saveAs").prop("checked", false);
        }
    });
    $("#ffmpeg").on("change", function () {
        $("#mp4").prop("checked") && $("#mp4").click();
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
        let number = parseInt($(this).val());
        number = event.originalEvent.wheelDelta < 0 ? number - 1 : number + 1;
        if (number < $(this).attr("min") || number > $(this).attr("max")) {
            return false;
        }
        $(this).val(number);
        $("#m3u8dlArg").val(getM3u8DlArg());
        if (this.id == "thread") {
            clearTimeout(debounce2);
            debounce2 = setTimeout(() => {
                chrome.storage.local.set({ thread: number });
            }, 500);
        }
        return false;
    });
    // 储存设置
    $("#thread, #mp4, #onlyAudio, #saveAs, #skipDecrypt, #StreamSaver, #ffmpeg").on("change", function () {
        chrome.storage.local.set({
            thread: parseInt($("#thread").val()),
            mp4: $("#mp4").prop("checked"),
            onlyAudio: $("#onlyAudio").prop("checked"),
            saveAs: $("#saveAs").prop("checked"),
            skipDecrypt: $("#skipDecrypt").prop("checked"),
            StreamSaver: $("#StreamSaver").prop("checked"),
            ffmpeg: $("#ffmpeg").prop("checked"),
        });
    });
    // 上传key
    $("#uploadKeyFile").change(function () {
        let fileReader = new FileReader();
        fileReader.onload = function () {
            if (this.result.byteLength != 16) {
                $progress.html(`<b>Key文件不正确</b>`);
                return;
            }
            $("#customKey").val(ArrayBufferToBase64(this.result));
            $("#m3u8dlArg").val(getM3u8DlArg());
        };
        let file = $("#uploadKeyFile").prop('files')[0];
        fileReader.readAsArrayBuffer(file);
    });
    $("#uploadKey").click(function () {
        $("#uploadKeyFile").click();
    });
    // 录制直播
    $("#recorder").click(function () {
        if ($(this).data("switch") == "on") {
            initDownload(); // 初始化下载变量
            recorder = true;

            // 流式下载
            if ($("#StreamSaver").prop("checked")) {
                fileStream = createStreamSaver(_fragments[0].url);
            }

            $(this).html(fileStream ? "停止下载" : "下载录制").data("switch", "off");
            $progress.html(`等待直播数据中...`);
            return;
        }
        stopDownload = '停止录制';
        recorder = false;
        $(this).html("录制直播").data("switch", "on");
        if (fileStream) {
            fileStream.close();
            fileStream = undefined;
            buttonState("#mergeTs", true);
            initDownload();
            $progress.html(stopDownload);
            return true;
        }
        mergeTs();
    });
    // 在线下载合并ts
    $("#mergeTs").click(async function () {
        initDownload(); // 初始化下载变量
        // 设定起始序号
        let start = parseInt($("#rangeStart").val());
        start = start ? start - 1 : 0;
        // 设定结束序号
        let end = parseInt($("#rangeEnd").val());
        end = end ? end - 1 : _fragments.length - 1;
        // 检查序号
        if (start > end) {
            $progress.html(`<b>开始序号不能大于结束序号</b>`);
            return;
        }
        if (start > _fragments.length - 1 || end > _fragments.length - 1) {
            $progress.html(`<b>序号最大不能超过${_fragments.length}</b>`);
            return;
        }
        /* 设定自定义密钥和IV */
        let customKey = $("#customKey").val().trim();
        if (customKey) {
            // customKey = isHexKey(customKey) ? HexStringToArrayBuffer(customKey) : Base64ToArrayBuffer(customKey);
            if(isHexKey(customKey)){
                customKey = HexStringToArrayBuffer(customKey);
            }else if(customKey.length == 24 && customKey.slice(-2) == "=="){
                customKey = Base64ToArrayBuffer(customKey);
                console.log(customKey);
            }else if(/^http[s]*:\/\/.+/i.test(customKey)){
                let flag = false;
                await $.ajax({
                    url: customKey,
                    xhrFields: { responseType: "arraybuffer" }
                }).fail(function () {
                    flag = true;
                }).done(function (responseData) {
                    customKey = responseData;
                    $("#customKey").val(ArrayBufferToBase64(customKey));
                    $("#m3u8dlArg").val(getM3u8DlArg());
                });
                if(flag){
                    $progress.html(`<b>密钥下载失败</b>`);
                    return;
                }
            }else{
                $progress.html(`<b>密钥不正确</b>`);
                return;
            }
            for (let i in _fragments) {
                if(!_fragments[i].encrypted){
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
        downTotalTs = end - start + 1;  // 需要下载的文件数量
        $progress.html(`${downCurrentTs}/${downTotalTs}`); // 进度显示

        // 流式下载
        if ($("#StreamSaver").prop("checked")) {
            fileStream = createStreamSaver(_fragments[0].url);
            streamDownload(start, end);
            $("#ffmpeg").prop("checked", false);
            $("#saveAs").prop("checked", false);
            $("#stopStream").show();
            return;
        }

        downloadTs(start, end);
    });
    // 强制下载
    $("#ForceDownload").click(function () {
        mergeTs();
    });
    // 停止下载流
    $("#stopStream").click(function () {
        if (fileStream) {
            stopDownload = "停止下载流";
            fileStream.close();
            $("#stopStream").hide();
            buttonState("#mergeTs", true);
        }
    });
    // 重新下载
    $("#errorDownload").click(function () {
        $("#errorTsList button").each(function (index) {
            let button = this;
            setTimeout(() => {
                button.click();
            }, index * 233);
        });
    });
    // 添加ts 参数
    _m3u8Arg && $("#tsAddArg").show();
    $("#tsAddArg").click(function () {
        if (tsAddArg) {
            window.location.href = window.location.href.replace(/&tsAddArg=[^&]*/g, "");
            return;
        }
        window.location.href = window.location.href + "&tsAddArg=1";
    });
    /**************************** 下载TS文件 ****************************/
    // start 开始下载的索引
    // end 结束下载的索引
    function downloadTs(start = 0, end = _fragments.length - 1, errorObj = undefined) {
        buttonState("#mergeTs", false);
        const _tsThread = parseInt($("#thread").val());  // 原始线程数量
        let tsThread = _tsThread;  // 线程数量
        let index = start - 1; // 当前下载的索引
        downTotalTs = errorObj ? downTotalTs : end - start + 1;  // 需要下载的文件数量
        const tsInterval = setInterval(function () {
            // 停止下载flag
            if (stopDownload) {
                clearInterval(tsInterval);
                $progress.html(stopDownload);
                return;
            }
            // 列表为空 等待线程数回归 检查是否下载完成
            if (index == end && tsThread == _tsThread) {
                clearInterval(tsInterval);
                if (stopDownload) { return; }
                // 错误列表为0 下载完成
                if (errorTsList.length == 0) {
                    $("#ForceDownload").hide();
                    $("#errorDownload").hide();
                    $("#errorTsList").hide();
                    !recorder && mergeTs();  // 合并下载
                    return;
                }
                $progress.html(`数据不完整... 剩余未下载: ${errorTsList.length}`);
                return;
            }
            // 下载
            if (tsThread > 0 && index < end) {
                tsThread--;
                let currentIndex = ++index;   // 当前下载的索引
                const fragment = _fragments[currentIndex];
                if (recorder) { currentIndex = recorderIndex++; }
                const timeout = errorObj ? 0 : 30000;
                $.ajax({
                    url: fragment.url,
                    xhrFields: { responseType: "arraybuffer" },
                    timeout: timeout
                }).fail(function () {
                    // 直播 不处理下载失败
                    if (stopDownload || recorder) { return; }
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
                    if (errorTsList.length && errorTsList.includes(currentIndex)) {
                        errorTsList.splice(errorTsList.indexOf(currentIndex), 1);
                    }
                    // console.log(fragment.url, currentIndex, tsBuffer);
                    tsBuffer[currentIndex] = tsDecrypt(responseData, currentIndex); //解密m3u8
                    fileSize += tsBuffer[currentIndex].byteLength;
                    $fileSize.html("已下载:" + byteToSize(fileSize));
                    downDuration += fragment.duration;
                    // console.log(downDuration);
                    if (recorder) {
                        $fileDuration.html("录制时长:" + secToTime(downDuration));
                        return;
                    }
                    downCurrentTs++;
                    if (downCurrentTs == downTotalTs) {
                        $progress.html($("#mp4").prop("checked") ? `数据正在转换格式...` : `数据正在合并...`);
                        return;
                    }
                    $progress.html(`${downCurrentTs}/${downTotalTs}`);
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
            $("#errorDownload").show();
            $("#errorTsList").show();
        }
        let html = $(`<p id="errorId${index}">${_fragments[index].url} <button data-id="${index}">重新下载</button></p>`);
        html.find("button").click(function () {
            buttonState(this, false);
            $(this).html("正在重新下载...");
            downloadTs(index, index, html);
        });
        $('#errorTsList').append(html);
    }
    // 合并下载
    function mergeTs() {
        // 修正数组，清理空白数据
        const _tsBuffer = [];
        for (let i = 0; i < tsBuffer.length; i++) {
            if (tsBuffer[i]) {
                _tsBuffer.push(tsBuffer[i]);
                tsBuffer[i] = undefined;
            }
            delete tsBuffer[i];
        }
        tsBuffer.splice(0);

        // 默认下载格式
        let fileBlob = new Blob(_tsBuffer, { type: "video/MP2T" });
        let ext = _fragments[0].url.split("/").pop();
        ext = ext.split("?")[0];
        ext = ext.split(".").pop();
        ext = ext ? ext : "ts";

        // ffmpeg 转码
        if ($("#ffmpeg").prop("checked")) {
            chrome.runtime.sendMessage({
                Message: "catCatchFFmpeg",
                action: $("#onlyAudio").prop("checked") ? "onlyAudio" :"transcode",
                media: [{ data: URL.createObjectURL(fileBlob) }],
                title: `${GetFileName(_m3u8Url)}`
            });
            buttonState("#mergeTs", true);
            $progress.html("已发送给在线ffmpeg");
            return;
        }

        /* 有初始化切片 可能是fMP4 获取初始化切片的后缀 */
        if (_fragments[0].initSegment) {
            let name = _fragments[0].initSegment.url.split("/").pop();
            name = name.split("?")[0];
            ext = name.split(".").pop();
            ext = ext ? ext : "ts";
        }
        // 转码mp4
        if ($("#mp4").prop("checked") && ext.toLowerCase() != "mp4") {
            let index;
            let headEncoding = true;
            /* 转码工具 */
            const onlyAudio = $("#onlyAudio").prop("checked");
            const transmuxer = new muxjs.mp4.Transmuxer({ remux: !onlyAudio });    // mux.js 对象
            // 转码服务监听
            transmuxer.on('data', function (segment) {
                // console.log(segment);
                if (onlyAudio && segment.type != "audio") { return; }
                // 头部信息
                if (headEncoding) {
                    headEncoding = false;
                    let data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
                    data.set(segment.initSegment, 0);
                    data.set(segment.data, segment.initSegment.byteLength);
                    // console.log(muxjs.mp4.tools.inspect(data));
                    // console.log(downDuration);
                    _tsBuffer[index] = fixFileDuration(data, downDuration);
                    return;
                }
                _tsBuffer[index] = segment.data;
            });
            // 载入ts数据转码
            for (index in _tsBuffer) {
                transmuxer.push(new Uint8Array(_tsBuffer[index]));
                transmuxer.flush();
            }
            // 关闭监听
            transmuxer.off('data');
            // 正确转换 下载格式改为 mp4 
            if (!headEncoding) {
                fileBlob = new Blob(_tsBuffer, { type: "video/mp4" });
                ext = "mp4";
            }
            delete transmuxer;
        }
        chrome.downloads.download({
            url: URL.createObjectURL(fileBlob),
            filename: `${GetFileName(_m3u8Url)}.${ext}`,
            saveAs: $("#saveAs").prop("checked")
        }, function (downloadId) { downId = downloadId });
        buttonState("#mergeTs", true);
        _tsBuffer.splice(0); delete _tsBuffer;
    }

    // 流式下载
    function streamDownload(start = 0, end = _fragments.length - 1) {
        buttonState("#mergeTs", false); // 禁止下载按钮
        const _tsThread = parseInt($("#thread").val());  // 原始线程数量
        let tsThread = _tsThread;  // 线程数量
        // 下载范围
        const downList = [];
        for (let index = start; index <= end; index++) {
            downList.push({ url: _fragments[index].url, index: index, duration: _fragments[index].duration });
        }
        let index = 0;  // 下载指针
        let downP = 0;  // 推流指针 帮助按照顺序下载
        const errorList = [];
        const downTotalTs = end - start + 1;  // 需要下载的文件数量
        /* 转码工具 */
        const checkMux = {
            start: false,
            headEncode: false,
            enable: $("#mp4").prop("checked"),
            onlyAudio: $("#onlyAudio").prop("checked")
        };
        const transmuxer = new muxjs.mp4.Transmuxer({ remux: !checkMux.onlyAudio });    // mux.js 对象
        if (checkMux.enable) {
            transmuxer.on('data', function (segment) {
                if (checkMux.onlyAudio && segment.type != "audio") { return; }
                // 头部信息
                if (!checkMux.headEncode) {
                    checkMux.headEncode = true;
                    let data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
                    data.set(segment.initSegment, 0);
                    data.set(segment.data, segment.initSegment.byteLength);
                    fileStream.write(fixFileDuration(data, downDuration));
                    return;
                }
                fileStream.write(segment.data);
            });
        }
        const tsInterval = setInterval(function () {
            // 停止下载flag
            if (stopDownload) {
                if (fileStream) {
                    fileStream.abort();
                    fileStream = undefined;
                }
                checkMux.enable && transmuxer.off('data');
                clearInterval(tsInterval);
                $progress.html(stopDownload);
                buttonState("#mergeTs", true);
                return;
            }
            errorList.includes(downP) && downP++;
            // 推流指针位置大于总下载量 已完成下载
            // downTotalTs 从1开始 所以 判断相等
            // 录播不停止
            if (downP == downTotalTs) {
                clearInterval(tsInterval);
                if (!recorder) {
                    setTimeout(() => {
                        fileStream.close();
                        fileStream = undefined;
                    }, 1000);
                    checkMux.enable && transmuxer.off('data');
                    $progress.html("合并已完成, 等待浏览器下载完成...");
                    $("#stopStream").hide();
                    buttonState("#mergeTs", true);
                }
                return;
            }
            // 检查当前推流指针是否有数据
            if (downList[downP].data) {
                if (!fileStream) { clearInterval(tsInterval); return; }
                if (checkMux.enable) {
                    if(checkMux.start && !checkMux.headEncode){
                        stopDownload = "格式转换错误, 请取消mp4转换, 重新下载.";
                        return;
                    }
                    checkMux.start = true;
                    transmuxer.push(new Uint8Array(downList[downP].data));
                    transmuxer.flush();
                } else {
                    fileStream.write(new Uint8Array(downList[downP].data));
                }
                downList[downP].data = undefined;
                downP++;
            }
            // 下载指针超过推流指针太多(超过线程数) 暂停下载
            if (index - downP > _tsThread) { return; }
            // 还有线程数 并且下载指针小于总下载量 开启下载
            if (tsThread > 0 && index < downTotalTs) {
                tsThread--;
                const currentIndex = index++; // 记录当前下载指针
                $.ajax({
                    url: downList[currentIndex].url,
                    xhrFields: { responseType: "arraybuffer" },
                    timeout: 60000
                }).fail(function (error) {
                    if (stopDownload) { return; }
                    errorList.push(currentIndex);
                    console.error('Error:', error);
                }).done(function (buffer) {
                    if (stopDownload) { return; }
                    // 解密需要当前资源的总索引 downList[currentIndex].index
                    downList[currentIndex].data = tsDecrypt(buffer, downList[currentIndex].index);
                    if (recorder) {
                        downDuration += downList[currentIndex].duration;
                        $fileDuration.html("录制时长:" + secToTime(downDuration));
                        return;
                    }
                    $progress.html(`${++downCurrentTs}/${downTotalTs}`);
                }).always(function () {
                    tsThread++;
                });
            }
        }, 10);
    }

    // ts解密
    function tsDecrypt(responseData, index) {
        // 是否存在初始化切片
        if (_fragments[index] && _fragments[index].initSegment) {
            let initSegmentData = initData.get(_fragments[index].initSegment.url);
            let initLength = initSegmentData.byteLength;
            let newData = new Uint8Array(initLength + responseData.byteLength);
            newData.set(new Uint8Array(initSegmentData), 0);
            newData.set(new Uint8Array(responseData), initLength);
            responseData = newData.buffer;
        }
        if (skipDecrypt || recorder || !_fragments[index].encrypted) {
            return responseData;
        }
        try {
            decryptor.expandKey(_fragments[index].decryptdata.keyContent);
        } catch (e) {
            stopDownload = "密钥类型错误";
            buttonState("#mergeTs", true);
            console.log(e);
            return;
        }
        try {
            let iv = _fragments[index].decryptdata.iv ?? new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, index]);
            return decryptor.decrypt(responseData, 0, iv.buffer, true);
        } catch (e) {
            stopDownload = "解密失败，无法解密.";
            buttonState("#mergeTs", true);
            console.log(e);
        }
    }
    // 初始化下载变量
    function initDownload() {
        fileSize = 0;   // 初始化已下载大小
        $fileSize.html("");
        downDuration = 0;   // 初始化时长
        $fileDuration.html("");
        tsBuffer.splice(0); // 初始化一下载ts缓存
        downCurrentTs = 0;  // 当前进度
        stopDownload = false; // 停止下载
        recorderIndex = 0;  // 录制直播索引
        recorderLast = "";  // 录制最后下载的url
        fileStream = undefined; // 流式下载 文件流
    }

    // 流式下载
    function createStreamSaver(url) {
        streamSaver.mitm = "https://stream.bmmmd.com/mitm.html";
        const ext = $("#mp4").prop("checked") ? "mp4" : GetExt(url);
        return streamSaver.createWriteStream(`${GetFileName(url)}.${ext}`).getWriter();
    }
    window.onunload = function () {
        fileStream && fileStream.abort();
    }
    window.onbeforeunload = function (event) {
        if (fileStream) {
            event.returnValue = `正在推流, 关闭后停止下载...`;
        }
    }
    function getM3u8DlArg() {
        let m3u8dlArg = G.m3u8dlArg;
        // 自定义文件名
        const customFilename = $("#customFilename").val().trim();
        if (customFilename && addParam) {
            m3u8dlArg = m3u8dlArg.replace(/--saveName "[^"]+"/g, `--saveName "${customFilename}"`);
        }
        const data = {
            url: _m3u8Url,
            title: _title,
            referer: _referer,
            initiator: _referer ?? _initiator
        }
        m3u8dlArg = templates(m3u8dlArg, data);
    
        if(!addParam){ return m3u8dlArg; }
    
        if (m3u8dlArg.includes("--maxThreads")) {
            m3u8dlArg = m3u8dlArg.replace(/--maxThreads "?[0-9]+"?/g, "");
        }
        const tsThread = $("#thread").val();  // 线程数量
        m3u8dlArg += ` --maxThreads "${tsThread}"`
    
        const rangeStart = $("#rangeStart").val() - 1;  // 开始序列号
        const rangeEnd = $("#rangeEnd").val() - 1;  // 结束序列号
        m3u8dlArg += ` --downloadRange "${rangeStart}-${rangeEnd}"`
    
        let customKey = $("#customKey").val().trim();  // 自定义密钥
        if (customKey) {
            if (isHexKey(customKey)) {
                customKey = HexStringToArrayBuffer(customKey);
                customKey = ArrayBufferToBase64(customKey);
                m3u8dlArg += ` --useKeyBase64 "${customKey}"`;
            }else if(customKey.length == 24 && customKey.slice(-2) == "=="){
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
});
// 写入ts链接
function writeText(text) {
    if (typeof text == "object") {
        let url = [];
        for (let key in text) {
            url.push(text[key].url + "\n");
        }
        $("#media_file").val(url.join("\n"));
        $("#media_file").data("type", "link");
        return;
    }
    $("#media_file").val(text);
    $("#media_file").data("type", "m3u8");
}
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
    let str = url.split(".");
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
            //删除创建日期
            data[i+11] = 0;
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
    return /[0-9a-fA-F]{32}/.test(str);
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
// ts列表转换成m3u8
function tsListTom3u8Text(tsList) {
    tsList = tsList.split("\n");
    let m3u8Text = "#EXTM3U\n";
    m3u8Text += "#EXT-X-TARGETDURATION:10\n";
    for (let key in tsList) {
        if (tsList[key]) {
            m3u8Text += "#EXTINF:1\n";
            m3u8Text += tsList[key] + "\n";
        }
    }
    m3u8Text += "#EXT-X-ENDLIST";
    return m3u8Text;
}