// HeartBeat
chrome.runtime.sendMessage(chrome.runtime.id, { Message: "HeartBeat" });
//填充数据
chrome.storage.local.get({ "MediaData": {} }, function (items) {
    if (items.MediaData === undefined) { return; }
    if (items.MediaData[G.tabId] !== undefined) {
        for (let key in items.MediaData[G.tabId]) {
            AddMedia(items.MediaData[G.tabId][key]);
        }
    }
    if (items.MediaData[-1] !== undefined) {
        for (let key in items.MediaData[-1]) {
            AddMedia(items.MediaData[-1][key]);
        }
    }
    UItoggle();
    // $(document).scrollTop($(document).height());
});

//监听数据
chrome.runtime.onMessage.addListener(function (MediaData, sender, sendResponse) {
    if (MediaData.tabId == G.tabId || MediaData.tabId == -1) {
        AddMedia(MediaData);
        UItoggle();
    }
    sendResponse("OK");
});

// 监听下载下载失败 传递referer重试下载
var downData = [];
chrome.downloads.onChanged.addListener(function (item) {
    // console.log(item.error.current);
    // SERVER_FORBIDDEN
    if (item.error) {
        chrome.tabs.get(G.tabId, function (tab) {
            if (!downData[item.id]) { return; }
            chrome.tabs.create({
                url: `/download.html?url=${encodeURIComponent(
                    downData[item.id].url
                )}&referer=${encodeURIComponent(
                    downData[item.id].initiator
                )}&filename=${encodeURIComponent(
                    downData[item.id].downFileName
                )}`,
                index: tab.index + 1
            });
        });
    }
});

function AddMedia(data) {
    // 正则匹配的备注扩展
    if (data.extraExt) {
        data.ext = data.extraExt;
    }
    // 不存在扩展使用类型
    if (data.ext === undefined && data.type !== undefined) {
        data.ext = data.type.split("/")[1];
    }

    //文件名是否为空
    if (data.name === undefined || data.name == '') {
        data.name = data.title + '.' + data.ext;
    }

    //截取文件名长度
    let trimName = data.name;
    if (data.name.length >= 60) {
        trimName = trimName.substr(0, 20) + '...' + trimName.substr(-23);
    }

    //添加下载文件名
    data.downFileName = G.TitleName ? data.title + '.' + data.ext : data.name;

    // 文件大小单位转换
    if (data.size) {
        data.size = byteToSize(data.size);
    }

    // 是否需要解析
    let parsing = { switch: false, type: "null" };
    if (isM3U8(data)) {
        parsing = { switch: true, type: "m3u8" };
        // 有m3u8文件 加载hls文件 预览m3u8 和 获取分辨率
        if (typeof Hls === "undefined") {
            const script = document.createElement('script');
            script.src = "js/hls.min.js"
            document.body.appendChild(script);
        }
    } else if (isMPD(data)) {
        parsing = { switch: true, type: "mpd" };
    } else if (isJSON(data)) {
        parsing = { switch: true, type: "json" };
    }
    //添加html
    let html = $(`
        <div class="panel" id="requestId${data.requestId}">
            <div class="panel-heading">
                <input type="checkbox" class="DownCheck" checked="true"/>
                <img src="${data.webInfo?.favIconUrl ? data.webInfo?.favIconUrl : ""}" class="icon ${G.ShowWebIco && data.webInfo?.favIconUrl ? "" : "hide"}"/>
                <img src="img/regex.png" class="icon ${data.isRegex ? "" : "hide"}" title="正则表达式匹配 或 来自深度搜索"/>
                <span class="name">${trimName}</span>
                <span class="size ${data.size ? "" : "hide"}">${data.size}</span>
                <img src="img/copy.png" class="icon" id="copy" title="复制地址"/>
                <img src="img/parsing.png" class="icon ${parsing.switch ? "" : "hide"}" id="${parsing.type}" title="解析"/>
                <img src="img/${G.Player ? "player.png" : "play.png"}" class="icon ${isPlay(data) ? "" : "hide"}" id="play" title="预览"/>
                <img src="img/download.png" class="icon" id="download" title="下载"/>
            </div>
            <div class="url hide">
                <div id="mediaInfo" data-state="false">
                    ${data.title ? `<b>标题:</b> ${data.title}` : ""}
                    ${data.type ? `<br><b>MIME:</b>  ${data.type}` : ""}
                </div>
                <div id="qrcode"><img src="img/qrcode.png" class="icon"/></div>
                <a href="${data.url}" target="_blank" download="${data.downFileName}" data-initiator="${data.initiator}">${data.url}</a>
                <br>
                <img id="screenshots" class="hide"/>
                <video id="preview" class="hide" controls></video>
            </div>
        </div>`);
    ////////////////////////绑定事件////////////////////////
    //展开网址
    html.find('.panel-heading').click(function (event) {
        const urlPanel = html.find(".url");
        const mediaInfo = html.find("#mediaInfo");
        const preview = html.find("#preview");
        if (urlPanel.is(":visible")) {
            if (event.target.id == "play") {
                preview.show().trigger("play");
                return false;
            }
            urlPanel.hide();
            !preview[0].paused && preview.trigger("pause");
            return false;
        }
        urlPanel.show();
        if (!mediaInfo.data("state")) {
            mediaInfo.data("state", true);
            if (isM3U8(data)) {
                let hls = new Hls({enableWorker: false});
                hls.loadSource(data.url);
                hls.attachMedia(preview[0]);
                hls.on(Hls.Events.BUFFER_CREATED, function (event, data) {
                    if (data.tracks) {
                        if (data.tracks.audiovideo) { return; }
                        !data.tracks.audio && mediaInfo.append("<br><b>H.256编码 或 无音频</b>");
                        !data.tracks.video && mediaInfo.append("<br><b>无视频</b>");
                    }
                });
                hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                    if (data.levels.length > 1 && !mediaInfo.text().includes("m3u8播放列表")) {
                        mediaInfo.append("<br><b>m3u8播放列表</b>");
                    }
                });
            } else if (isPlay(data)) {
                preview.attr("src", data.url);
            } else if (isPicture(data)) {
                html.find("#screenshots").show().attr("src", data.url);
                return false;
            } else {
                return false;
            }
            preview.on("loadedmetadata", function () {
                preview.show();
                if (this.duration && this.duration != Infinity) {
                    mediaInfo.append("<br><b>时长:</b> " + secToTime(this.duration));
                }
                this.videoHeight && mediaInfo.append("<br><b>分辨率:</b> " + this.videoWidth + "x" + this.videoHeight);
            });
        }
        if (event.target.id == "play") {
            preview.show().trigger("play");
        }
        return false;
    });
    // 二维码
    html.find("#qrcode").click(function () {
        const size = data.url.length >= 300 ? 400 : 256;
        $(this).html("").qrcode({ width: size, height: size, text: data.url }).off("click");
    });
    //点击复制网址
    html.find('#copy').click(function () {
        let text = data.url;
        if (isM3U8(data)) {
            text = G.copyM3U8;
        } else if (isMPD(data)) {
            text = G.copyMPD;
        } else {
            text = G.copyOther;
        }
        text = text.includes("$url$") ? text : data.url;
        text = text.replace(/\$url\$/g, data.url);
        text = text.replace(/\$referer\$/g, data.initiator);
        text = text.replace(/\$title\$/g, data.title);
        navigator.clipboard.writeText(text);
        Tips("已复制到剪贴板");
        return false;
    });
    // 下载
    html.find('#download').click(function () {
        if (G.m3u8dl && (isM3U8(data) || isMPD(data))) {
            let m3u8dlArg = G.m3u8dlArg.replace(/\$referer\$/g, data.initiator);
            m3u8dlArg = m3u8dlArg.replace(/\$url\$/g, data.url);
            m3u8dlArg = m3u8dlArg.replace(/\$title\$/g, data.title);
            let url = 'm3u8dl://' + Base64.encode(m3u8dlArg);
            if (url.length >= 2046) {
                navigator.clipboard.writeText(m3u8dlArg);
                Tips("m3u8dl参数太长无法唤醒m3u8DL程序, 请手动粘贴下载。", 2000);
                return false;
            }
            if (G.isFirefox) {
                window.location.href = url;
                return false;
            }
            chrome.tabs.update({ url: url });
            return false;
        }
        chrome.downloads.download({
            url: data.url,
            filename: data.downFileName
        }, function (id) { downData[id] = data; });
        return false;
    });
    //播放
    html.find('#play').click(function () {
        if (isEmpty(G.Player)) { return true; }
        if (G.Player == "$shareApi$") {
            navigator.share({ url: data.url });
            return false;
        }
        let url = G.Player.replace(/\$url\$/g, data.url);
        url = url.replace(/\$referer\$/g, data.initiator);
        url = url.replace(/\$title\$/g, encodeURIComponent(data.title));
        if (G.isFirefox) {
            window.location.href = url;
            return false;
        }
        chrome.tabs.update({ url: url });
        return false;
    });
    //解析m3u8
    html.find('#m3u8, #json, #mpd').click(function () {
        const id = this.id;
        chrome.tabs.get(G.tabId, function (tab) {
            let url = `/${id}.html?url=${encodeURIComponent(data.url)}&referer=${encodeURIComponent(data.initiator)}&title=${encodeURIComponent(data.title)}&tabid=${data.tabId}`;
            chrome.tabs.create({ url: url, index: tab.index + 1 });
        });
        return false;
    });
    //多选框
    html.find('input').click(function (event) {
        event.originalEvent.cancelBubble = true;
    });

    data.tabId == -1 ? $('#otherMediaList').append(html) : $('#mediaList').append(html);
}

//绑定事件
$(function () {
    //到页面底部
    $("#ToBottom").click(function () {
        $(document).scrollTop($(document).height());
    });
    //标签切换
    $(".Tabs .TabButton").click(function () {
        const index = $(this).index();
        $(".Tabs .TabButton").removeClass('Active');
        $(this).addClass("Active");
        $(".mediaList").removeClass("TabShow");
        $(".mediaList").eq(index).addClass("TabShow");
        UItoggle();
    });
    //设置
    $("#Options").click(function () {
        chrome.tabs.create({ url: '/options.html' });
    });
    //下载选中文件
    $('#DownFile').click(function () {
        const FileNum = $('.TabShow :checked').length;
        if (FileNum >= 10 && !confirm("共 " + FileNum + "个文件，是否确认下载?")) {
            return;
        }
        $('.TabShow :checked').each(function () {
            const link = $(this).parents(".panel").find(".url a");
            const url = link.attr("href");
            const filename = "CatCatch/" + link.attr("download");
            const initiator = link.data("initiator");
            setTimeout(function () {
                chrome.downloads.download({
                    url: url,
                    filename: filename
                }, function (id) {
                    downData[id] = { url: url, downFileName: filename, initiator: initiator };
                });
            }, 100);
        });
    });
    //复制选中文件
    $('#AllCopy').click(function () {
        const checked = $('.TabShow :checked');
        if (checked.length == 0) { return false };
        let url = '';
        checked.each(function () {
            url += $(this).parents('.panel').find('.url a').attr('href') + "\n";
        });
        navigator.clipboard.writeText(url);
        Tips("已复制到剪贴板");
    });
    //全选
    $('#AllSelect').click(function () {
        $('.TabShow input').each(function () {
            $(this).prop("checked", true);
        });
    });
    //反选
    $('#ReSelect').click(function () {
        $('.TabShow input').each(function () {
            $(this).prop('checked', !$(this).prop('checked'));
        });
    });
    //清空数据
    $('#Clear').click(function () {
        chrome.runtime.sendMessage({ Message: "clearData", tabId: G.tabId });
        chrome.runtime.sendMessage({ Message: "ClearIcon" });
        location.reload();
    });
    // 获取模拟手机 自动下载 捕获 状态
    chrome.runtime.sendMessage({ Message: "getButtonState", tabId: G.tabId }, function (state) {
        if (state.mobile) {
            $("#MobileUserAgent").html("关闭模拟").data("switch", "off");
        }
        if (state.autodown) {
            Tips("已关闭自动下载", 500);
        }
        if (state.catch) {
            $("#Catch").html("关闭脚本").data("switch", "off");
        }
    });
    // 模拟手机端
    $("#MobileUserAgent").click(function () {
        const action = $(this).data("switch");
        chrome.runtime.sendMessage({ Message: "mobileUserAgent", tabId: G.tabId, action: action }, function () {
            G.refreshClear ? $('#Clear').click() : location.reload();
        });
    });
    // 自动下载
    $("#AutoDown").click(function () {
        const action = $(this).data("switch");
        if (action == "on") {
            if (confirm("找到资源立刻尝试下载\n点击扩展图标将关闭自动下载\n是否确认开启？")) {
                $("#AutoDown").html("关闭下载").data("switch", "off");
                chrome.runtime.sendMessage({ Message: "autoDown", tabId: G.tabId, action: action });
            }
        } else {
            $("#AutoDown").html("自动下载").data("switch", "on");
            chrome.runtime.sendMessage({ Message: "autoDown", tabId: G.tabId, action: action });
        }
    });

    /* 网页视频控制 */
    var _tabId = -1;   // 选择的页面ID
    var _index = -1;    //选择的视频索引
    var VideoTagTimer;  // 获取所有视频标签的定时器
    var VideoStateTimer;  // 获取所有视频信息的定时器

    function setVideoTagTimer() {
        clearInterval(VideoTagTimer);
        VideoTagTimer = setInterval(getVideoTag, 1000);
    }
    function getVideoTag() {
        chrome.tabs.query({ windowType: "normal" }, function (tabs) {
            let videoTabList = [];
            // 列出所有标签
            for (let tab of tabs) {
                if ($("#option" + tab.id).length == 1) { continue; }
                videoTabList.push(tab.id);
                $("#videoTabIndex").append(`<option value='${tab.id}' id="option${tab.id}">${stringModify(tab.title)}</option>`);
            }
            // 删除没有媒体的标签. 异步的原因，使用一个for去处理无法保证标签顺序一致
            for (let tab of videoTabList) {
                chrome.tabs.sendMessage(tab, { Message: "getVideoState", index: 0 }, function (state) {
                    if (chrome.runtime.lastError || state.count == 0) {
                        $("#option" + tab).remove();
                        return;
                    }
                    $("#videoTabTips").remove();
                    if (tab == G.tabId && _tabId == -1) {
                        _tabId = tab;
                        $("#videoTabIndex").val(tab);
                    }
                });
            }
        });
    }
    function setVideoStateTimer() {
        clearInterval(VideoStateTimer);
        VideoStateTimer = setInterval(getVideoState, 500);
    }
    function getVideoState() {
        if (_tabId == -1) {
            let currentTabId = $("#videoTabIndex").val();
            if (currentTabId == -1) { return; }
            _tabId = parseInt(currentTabId);
        }
        chrome.tabs.sendMessage(_tabId, { Message: "getVideoState", index: _index }, function (state) {
            if (chrome.runtime.lastError || state.count == 0) { return; }
            if (state.type == "audio") {
                $("#pip").hide();
                $("#screenshot").hide();
            }
            $("#volume").val(state.volume);
            if (state.duration && state.duration != Infinity) {
                $("#timeShow").html(secToTime(state.currentTime) + " / " + secToTime(state.duration));
                $("#time").val(state.time);
            }
            state.paused ? $("#control").html("播放").data("switch", "play") : $("#control").html("暂停").data("switch", "pause");
            state.speed == 1 ? $("#speed").html("倍数播放").data("switch", "speed") : $("#speed").html("正常播放").data("switch", "normal");
            $("#loop").prop("checked", state.loop);
            $("#muted").prop("checked", state.muted);
            $("#videoIndex").empty();
            for (let i = 0; i < state.count; i++) {
                let src = state.src[i];
                if (src.length >= 60) {
                    src = src.substr(0, 35) + '...' + src.substr(-35);
                }
                $("#videoIndex").append(`<option value='${i}'>${src}</option>`);
            }
            _index = _index == -1 ? 0 : _index;
            $("#videoIndex").val(_index);
        });
    }
    // 点击其他设置标签页 开始读取tab信息以及视频信息
    getVideoTag();
    $("#OtherOptions").click(function () {
        chrome.tabs.get(G.mediaControl.tabid, function (tab) {
            if (chrome.runtime.lastError) {
                _tabId = -1;
                _index = -1;
                setVideoTagTimer(); getVideoState(); setVideoStateTimer();
                return;
            }
            chrome.tabs.sendMessage(G.mediaControl.tabid, { Message: "getVideoState", index: 0 }, function (state) {
                _tabId = G.mediaControl.tabid;
                if (state.count > G.mediaControl.index) {
                    _index = G.mediaControl.index;
                }
                $("#videoTabIndex").val(_tabId);
                setVideoTagTimer(); getVideoState(); setVideoStateTimer();
                chrome.storage.local.set({ mediaControl: { tabid: _tabId, index: _index } });
            });
        });
        // setVideoTagTimer(); getVideoState(); setVideoStateTimer();
    });
    // 切换标签选择 切换视频选择
    $("#videoIndex, #videoTabIndex").change(function () {
        if (!G.isFirefox) { $("#pip").show(); }
        $("#screenshot").show();
        if (this.id == "videoTabIndex") {
            _tabId = parseInt($("#videoTabIndex").val());
        } else {
            _index = parseInt($("#videoIndex").val());
        }
        chrome.storage.local.set({ mediaControl: { tabid: _tabId, index: _index } });
        getVideoState();
    });
    let wheelPlaybackRateTimeout;
    $("#playbackRate").on("wheel", function (event) {
        $(this).blur();
        let speed = parseFloat($(this).val());
        speed = event.originalEvent.wheelDelta < 0 ? speed - 0.1 : speed + 0.1;
        speed = parseFloat(speed.toFixed(1));
        if (speed < 0.1 || speed > 16) { return false; }
        $(this).val(speed);
        clearTimeout(wheelPlaybackRateTimeout);
        wheelPlaybackRateTimeout = setTimeout(() => {
            chrome.storage.sync.set({ playbackRate: speed });
            chrome.tabs.sendMessage(_tabId, { Message: "speed", speed: speed, index: _index });
        }, 200);
        return false;
    });
    // 倍速播放
    $("#speed").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        if ($(this).data("switch") == "speed") {
            const speed = parseFloat($("#playbackRate").val());
            chrome.tabs.sendMessage(_tabId, { Message: "speed", speed: speed, index: _index });
            chrome.storage.sync.set({ playbackRate: speed });
            return;
        }
        chrome.tabs.sendMessage(_tabId, { Message: "speed", speed: 1, index: _index });
    });
    // 画中画
    $("#pip").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "pip", index: _index }, function (state) {
            if (chrome.runtime.lastError) { return; }
            state.state ? $("#pip").html("退出") : $("#pip").html("画中画");
        });
    });
    // 全屏
    $("#fullScreen").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.get(_tabId, function (tab) {
            chrome.tabs.highlight({ 'tabs': tab.index }, function () {
                chrome.tabs.sendMessage(_tabId, { Message: "fullScreen", index: _index }, function (state) {
                    close();
                });
            });
        });
    });
    // 暂停 播放
    $("#control").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        const action = $(this).data("switch");
        chrome.tabs.sendMessage(_tabId, { Message: action, index: _index });
    });
    // 循环 静音
    $("#loop, #muted").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        const action = $(this).prop("checked");
        chrome.tabs.sendMessage(_tabId, { Message: this.id, action: action, index: _index });
    });
    // 调节音量和视频进度时 停止循环任务
    $("#volume, #time").mousedown(function () {
        if (_index < 0 || _tabId < 0) { return; }
        clearInterval(VideoStateTimer);
    });
    // 调节音量
    $("#volume").mouseup(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "setVolume", volume: $(this).val(), index: _index }, function () {
            if (chrome.runtime.lastError) { return; }
            setVideoStateTimer();
        });
    });
    // 调节视频进度
    $("#time").mouseup(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "setTime", time: $(this).val(), index: _index }, function () {
            if (chrome.runtime.lastError) { return; }
            setVideoStateTimer();
        });
    });
    // 视频截图
    $("#screenshot").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "screenshot", index: _index });
    });
    /* 网页视频控制END */

    // 其他功能按钮
    $(".otherFeat .button2").click(function () {
        let url = $(this).data("go");
        chrome.tabs.create({ url: url });
    });

    //102以上开启捕获按钮
    if (G.version >= 102) {
        $("#Catch").show();
        $("#otherScript").show();
    }
    // Firefox 关闭画中画 全屏 修复右边滚动条遮挡
    if (G.isFirefox) {
        $("#pip").hide();
        $("#fullScreen").hide();
        $("body").addClass("fixFirefoxRight");
    }

    // 解决浏览器字体设置超过16px按钮变高遮挡一条资源
    if ($("#down").height() > 30) {
        const downHeigth = $("#down").height();
        $(".mediaList").css("margin-bottom", (downHeigth + 2) + "px");
    }

    // 一些需要等待G变量加载完整的操作
    const interval = setInterval(function () {
        if (!G.initComplete) { return; }
        clearInterval(interval);
        // 捕获按钮
        if ($("#Catch").data("switch") != "off") {
            $("#Catch").html(G.scriptList.get(G.injectScript).name);
        }
        $("#Catch").click(function () {
            chrome.runtime.sendMessage({ Message: "catch", tabId: G.tabId });
            G.refreshClear && $('#Clear').click();
            location.reload();
        });
        G.scriptList.forEach(function (value, key) {
            let button = $(`<button data-script="${key}" class="button2">${value.name}</button>`);
            button.click(function () {
                chrome.storage.sync.set({ injectScript: this.dataset.script }, function () {
                    chrome.runtime.sendMessage({ Message: "catch", tabId: G.tabId });
                    G.refreshClear && $('#Clear').click();
                });
            });
            $(".otherScript").append(button);
        });

        // 上一次设定的倍数
        $("#playbackRate").val(G.playbackRate);
    }, 10);
});

/* 格式判断 */
function isPlay(data) {
    if (G.Player && !isJSON(data) && !isPicture(data)) { return true; }
    const extArray = ['ogg', 'ogv', 'mp4', 'webm', 'mp3', 'wav', 'm4a', '3gp', 'mpeg', 'mov'];
    const typeArray = ['video/ogg', 'video/mp4', 'video/webm', 'audio/ogg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'video/3gp', 'video/mpeg', 'video/mov'];
    return extArray.includes(data.ext) || typeArray.includes(data.type) || isM3U8(data);
}
function isM3U8(data) {
    return (data.ext == "m3u8" ||
        data.ext == "m3u" ||
        data.type == "application/vnd.apple.mpegurl" ||
        data.type == "application/x-mpegurl" ||
        data.type == "application/mpegurl" ||
        data.type == "application/octet-stream-m3u8"
    )
}
function isMPD(data) {
    return (data.ext == "mpd" ||
        data.type == "application/dash+xml"
    )
}
function isJSON(data) {
    return (data.ext == "json" ||
        data.type == "application/json" ||
        data.type == "text/json"
    )
}
function isPicture(data) {
    if (data.type && data.type.split("/")[0] == "image") {
        return true;
    }
    return (data.ext == "jpg" ||
        data.ext == "png" ||
        data.ext == "jpeg" ||
        data.ext == "bmp" ||
        data.ext == "gif" ||
        data.ext == "webp"
    )
}

/*
* 有资源 隐藏无资源提示
* 大于30条 显示一键到最底部按钮
* 更新数量显示
* 如果标签是其他设置 隐藏底部按钮
*/
function UItoggle() {
    let length = $('.TabShow .panel').length;
    length > 0 ? $('#Tips').hide() : $('#Tips').show();
    length >= 30 ? $('#ToBottom').show() : $('#ToBottom').hide();
    length = $('#mediaList .panel').length;
    $("#mediaQuantity").text("[" + length + "]");
    length = $('#otherMediaList .panel').length;
    $("#otherQuantity").text("[" + length + "]");
    if ($('.TabShow').attr("id") == "otherOptions") {
        $('#Tips').hide();
        $('#down').hide();
    } else if ($('#down').is(":hidden")) {
        $('#down').show();
    }
}

function Tips(text, delay = 200) {
    $('#TipsFixed').html(text).fadeIn(500).delay(delay).fadeOut(500);
}