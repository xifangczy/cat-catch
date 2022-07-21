// HeartBeat
chrome.runtime.sendMessage(chrome.runtime.id, { Message: "HeartBeat" });
//填充数据
chrome.storage.local.get({ "MediaData": {} }, function (items) {
    if (items.MediaData === undefined) { return; }
    if (items.MediaData[G.tabId] !== undefined) {
        for (let item of items.MediaData[G.tabId]) {
            AddMedia(item);
        }
    }
    if (items.MediaData[-1] !== undefined) {
        for (let item of items.MediaData[-1]) {
            AddMedia(item);
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
                url: `/m3u8.html?m3u8_url=${encodeURIComponent(
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
    if (data.name.length >= 43) {
        trimName = data.name.replace(/\.[^.\/]+$/, "");
        trimName = trimName.substr(0, 13) + '...' + trimName.substr(-20) + '.' + data.ext;
    }

    //添加下载文件名
    data.downFileName = G.TitleName ? data.title + '.' + data.ext : data.name;

    // 文件大小单位转换
    if (data.size) {
        data.size = byteToSize(data.size);
    }
    // 是否需要解析
    let parsing = false;
    let parsingType = "m3u8";
    if (isM3U8(data)) {
        parsing = true;
        parsingType = "m3u8";
    } else if (isJSON(data)) {
        parsing = true;
        parsingType = "json";
    }
    //添加html
    let html = $(`
        <div class="panel" id="requestId${data.requestId}">
            <div class="panel-heading">
                <input type="checkbox" class="DownCheck" checked="true"/>
                <img src="${data.webInfo?.favIconUrl}" class="icon ${G.ShowWebIco && data.webInfo?.favIconUrl ? "" : "hide"}"/>
                <img src="img/regex.png" class="icon ${data.isRegex ? "" : "hide"}" title="正则表达式匹配"/>
                <span class="name">${trimName}</span>
                <span class="size ${data.size ? "" : "hide"}">${data.size}</span>
                <img src="img/copy.png" class="ico" id="copy" title="复制地址"/>
                <img src="img/parsing.png" class="ico ${parsing ? "" : "hide"}" id="${parsingType}" title="解析"/>
                <img src="img/${G.Potplayer ? "potplayer.png" : "play.png"}" class="ico ${isPlay(data) ? "" : "hide"}" id="play" title="预览"/>
                <img src="img/download.png" class="ico" id="download" title="下载"/>
            </div>
            <div class="url hide">
                ${data.title ? `标题: ${data.title}<br>` : ""}
                ${data.type ? `MIME:  ${data.type}<br>` : ""}
                <div id="duration"></div>
                <a href="${data.url}" target="_blank" download="${data.downFileName}" data-initiator="${data.initiator}">${data.url}</a>
                <br>
                <img id="screenshots" class="hide"/>
                <video id="getMediaInfo" class="hide" muted autoplay></video>
            </div>
        </div>`);

    ////////////////////////绑定事件////////////////////////
    //展开网址
    html.find('.panel-heading').click(function () {
        html.find(".url").toggle();
        const screenshots = html.find("#screenshots");
        // 预览图片
        if (isPicture(data)) {
            screenshots.css("display", "block");
            screenshots.attr("src", data.url);
            return;
        }
        //获取时长
        const getMediaInfo = html.find("#getMediaInfo");
        const durationNode = html.find("#duration");
        if (html.find(".url").is(":visible") && durationNode.html() == "") {
            getMediaInfo.attr('src', data.url);
            getMediaInfo.on("loadeddata", function () {
                this.pause();
                // 截图
                if (screenshots.attr("src") == undefined) {
                    const canvas = document.createElement('canvas');
                    canvas.width = this.videoWidth;
                    canvas.height = this.videoHeight;
                    const blank = canvas.toDataURL('image/jpeg');
                    canvas.getContext('2d').drawImage(this, 0, 0, this.videoWidth, this.videoHeight);
                    const image = canvas.toDataURL('image/jpeg');
                    if (image != blank) {
                        html.find("#player").length == 0 && screenshots.css("display", "block");
                        screenshots.attr("src", canvas.toDataURL('image/jpeg'));
                    }
                    delete canvas;
                }
                // 获取播放时长
                if (this.duration && this.duration != Infinity) {
                    durationNode.html("时长: " + secToTime(this.duration));
                }
                getMediaInfo.remove();
            });
            getMediaInfo.on("play", function () {
                getMediaInfo.remove();
            });
            getMediaInfo.on("error", function () {
                getMediaInfo.remove();
            });
        }
    });
    //点击复制网址
    html.find('#copy').click(function () {
        let text = data.url;
        if (isM3U8(data) || isMPD(data)) {
            text = isM3U8(data) ? G.copyM3U8 : G.copyMPD;
            text = text.includes("$url$") ? text : data.url;    // 防止$url$不存在无法成功复制地址
            text = text.replace(/\$url\$/g, data.url);
            text = text.replace(/\$referer\$/g, data.initiator);
            text = text.replace(/\$title\$/g, data.title);
        }
        navigator.clipboard.writeText(text);
        Tips("已复制到剪贴板");
        return false;
    });
    // 下载
    html.find('#download').click(function () {
        if (G.m3u8dl && isM3U8(data)) {
            let m3u8dlArg = G.m3u8dlArg.replace(/\$referer\$/g, data.initiator);
            m3u8dlArg = m3u8dlArg.replace(/\$url\$/g, data.url);
            m3u8dlArg = m3u8dlArg.replace(/\$title\$/g, data.title);
            let url = 'm3u8dl://' + Base64.encode(m3u8dlArg);
            if (url.length >= 2046) {
                alert("m3u8dl参数太长,可能导致无法唤醒m3u8DL, 请手动复制到m3u8DL下载");
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
    // 点击预览图片
    html.find('#screenshots').click(function () {
        if (isPicture(data)) { return; }
        html.find('#play').click();
    });
    //播放
    html.find('#play').click(function () {
        if (G.Potplayer) {
            if (G.isFirefox) {
                window.location.href = 'potplayer://' + data.url;
                return false;
            }
            chrome.tabs.update({ url: 'potplayer://' + data.url });
            return false;
        }
        html.find("#screenshots").hide();
        $('#player video').attr('src', data.url);
        $('#player').show();
        $('#player').appendTo(html);
        if (!isM3U8(data)) {
            $('#player video').trigger('play');
            return false;
        }
        let script = {};
        if (typeof Hls === "undefined") {
            script = document.createElement('script');
            script.src = "js/hls.min.js"
            document.body.appendChild(script);
        }
        script.onload = function () {
            const hls = new Hls();
            const video = $('#player video')[0];
            hls.loadSource(data.url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MEDIA_ATTACHED, function () {
                video.play();
            });
        }
        if (typeof Hls === "function") {
            script.onload();
        }
        return false;
    });
    //解析m3u8
    html.find('#m3u8, #json').click(function () {
        let url = '';
        const id = $(this).attr('id');
        chrome.tabs.get(G.tabId, function (tab) {
            if (id == "m3u8") {
                url = `/m3u8.html?m3u8_url=${encodeURIComponent(data.url)}&referer=${encodeURIComponent(data.initiator)}&title=${encodeURIComponent(data.title)}`;
            } else {
                url = `/json.html?url=${encodeURIComponent(data.url)}&referer=${encodeURIComponent(data.initiator)}&title=${encodeURIComponent(data.title)}`;
            }
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
    //预览播放关闭按钮
    $('#CloseBtn').click(function () {
        const screenshots = $(this).parent().siblings(".url").find("#screenshots");
        if (screenshots.attr("src") != "" && screenshots.attr("src") != undefined) {
            screenshots.css("display", "block");
        }
        $('#player video').trigger('pause');
        $('#player video').removeAttr('src');
        $("#player").hide();
        $("#player").appendTo('body');
        return false;
    });

    // 获取模拟手机 自动下载 捕获 状态
    chrome.runtime.sendMessage({ Message: "getButtonState", tabId: G.tabId }, function (state) {
        if (state.mobile) {
            $("#MobileUserAgent").html("关闭模拟");
            $("#MobileUserAgent").data("switch", "off");
        }
        if (state.autodown) {
            Tips("已关闭自动下载", 500);
        }
        if (state.catch) {
            $("#Catch").html("停止捕获");
            $("#Catch").data("switch", "off");
        }
    });
    // 模拟手机端
    $("#MobileUserAgent").click(function () {
        const action = $(this).data("switch");
        chrome.runtime.sendMessage({ Message: "mobileUserAgent", tabId: G.tabId, action: action }, function () {
            $('#Clear').click();
        });
    });
    // 自动下载
    $("#AutoDown").click(function () {
        const action = $(this).data("switch");
        if (action == "on") {
            if (confirm("找到资源立刻尝试下载\n点击扩展图标将关闭自动下载\n是否确认开启？")) {
                $("#AutoDown").html("关闭下载");
                $("#AutoDown").data("switch", "off");
                chrome.runtime.sendMessage({ Message: "autoDown", tabId: G.tabId, action: action });
            }
        } else {
            $("#AutoDown").html("自动下载");
            $("#AutoDown").data("switch", "on");
            chrome.runtime.sendMessage({ Message: "autoDown", tabId: G.tabId, action: action });
        }
    });

    // 捕获
    $("#Catch").click(function () {
        const action = $(this).data("switch");
        if (action == "on") {
            if (confirm("保存视频缓存数据\n媒体可能会被分成音频和视频,请注意浏览器提示下载多个文件\n是否确认开启？")) {
                $("#Catch").html("关闭捕获");
                $("#Catch").data("switch", "off");
                $('#Clear').click();
                chrome.runtime.sendMessage({ Message: "catch", tabId: G.tabId, action: action });
            }
        } else {
            $("#Catch").html("停止捕获");
            $("#Catch").data("switch", "on");
            $('#Clear').click();
            chrome.runtime.sendMessage({ Message: "catch", tabId: G.tabId, action: action });
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
            $("#volume").val(state.volume);
            $("#time").val(state.time);
            state.paused ? $("#control").html("播放").data("switch", "play") : $("#control").html("暂停").data("switch", "pause");
            state.speed == 1 ? $("#speed").html("倍数播放").data("switch", "speed") : $("#speed").html("正常播放").data("switch", "normal");
            $("#loop").prop("checked", state.loop);
            $("#muted").prop("checked", state.muted);
            $("#videoIndex").empty();
            for (let i = 1; i <= state.count; i++) {
                let src = state.src[i - 1];
                if (src.length >= 60) {
                    src = src.substr(0, 35) + '...' + src.substr(-35);
                }
                $("#videoIndex").append(`<option value='${i - 1}'>${src}</option>`);
            }
            _index = _index == -1 ? 0 : _index;
            $("#videoIndex").val(_index);
        });
    }

    // 点击其他设置标签页 开始读取tab信息以及视频信息
    getVideoTag();
    $("#OtherOptions").click(function () {
        setVideoTagTimer();
        getVideoState(); setVideoStateTimer();
    });
    // 切换标签选择
    $("#videoTabIndex").change(function () {
        _tabId = parseInt($("#videoTabIndex").val());
        getVideoState();
    });
    // 切换视频选择
    $("#videoIndex").change(function () {
        _index = parseInt($("#videoIndex").val());
        getVideoState();
    });
    $("#playbackRate").on("mousewheel", function (event) {
        let speed = parseFloat($("#playbackRate").val());
        speed = event.originalEvent.wheelDelta < 0 ? speed - 0.1 : speed + 0.1;
        speed = parseFloat(speed.toFixed(1));
        if (speed < 0) { speed = 0; }
        if (speed > 16) { speed = 16; }
        $("#playbackRate").val(speed);
    });
    // 倍速播放
    $("#playbackRate").val(G.playbackRate); // 上一次设定的倍数
    $("#speed").click(function () {
        if (_index < 0) { return; }
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
        if (_index < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "pip", index: _index }, function (state) {
            if (chrome.runtime.lastError) { return; }
            state.state ? $("#pip").html("退出") : $("#pip").html("画中画");
        });
    });
    // 全屏
    $("#fullScreen").click(function () {
        if (_index < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "fullScreen", index: _index }, function (state) {
            if (chrome.runtime.lastError) { return; }
            state.state ? $("#fullScreen").html("退出") : $("#fullScreen").html("全屏");
        });
    });
    // 暂停 播放
    $("#control").click(function () {
        if (_index < 0) { return; }
        const action = $(this).data("switch");
        chrome.tabs.sendMessage(_tabId, { Message: action, index: _index });
    });
    // 循环 静音
    $("#loop, #muted").click(function () {
        if (_index < 0) { return; }
        const action = $(this).prop("checked");
        chrome.tabs.sendMessage(_tabId, { Message: this.id, action: action, index: _index });
    });
    // 调节音量和视频进度时 停止循环任务
    $("#volume, #time").mousedown(function () {
        if (_index < 0) { return; }
        clearInterval(VideoStateTimer);
    });
    // 调节音量
    $("#volume").mouseup(function () {
        if (_index < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "setVolume", volume: $(this).val(), index: _index }, function () {
            if (chrome.runtime.lastError) { return; }
            setVideoStateTimer();
        });
    });
    // 调节视频进度
    $("#time").mouseup(function () {
        if (_index < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "setTime", time: $(this).val(), index: _index }, function () {
            if (chrome.runtime.lastError) { return; }
            setVideoStateTimer();
        });
    });
    /* 网页视频控制END */

    //102以上开启捕获按钮
    if (G.moreFeat) {
        $("#Catch").show();
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
});

//html5播放器允许格式
function isPlay(data) {
    if (G.Potplayer && !isJSON(data) && !isPicture(data)) { return true; }
    const extArray = ['ogg', 'ogv', 'mp4', 'webm', 'mp3', 'wav', 'm4a', '3gp', 'mpeg', 'mov'];
    const typeArray = ['video/ogg', 'video/mp4', 'video/webm', 'audio/ogg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'video/3gp', 'video/mpeg', 'video/mov'];
    return extArray.includes(data.ext) || typeArray.includes(data.type) || isM3U8(data);
}
function isM3U8(data) {
    if (data.ext == "m3u8" ||
        data.ext == "m3u" ||
        data.type == "application/vnd.apple.mpegurl" ||
        data.type == "application/x-mpegurl" ||
        data.type == "application/mpegurl" ||
        data.type == "application/octet-stream-m3u8"
    ) { return true; }
    return false;
}
function isMPD(data) {
    if (data.ext == "mpd" ||
        data.type == "application/dash+xml"
    ) { return true; }
    return false;
}
function isJSON(data) {
    if (data.ext == "json" ||
        data.type == "application/json" ||
        data.type == "text/json"
    ) { return true; }
    return false;
}
function isPicture(data) {
    if (data.type && data.type.split("/")[0] == "image") {
        return true;
    }
    if (data.ext == "jpg" ||
        data.ext == "png" ||
        data.ext == "jpeg" ||
        data.ext == "bmp" ||
        data.ext == "gif" ||
        data.ext == "webp"
    ) { return true; }
    return false;
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