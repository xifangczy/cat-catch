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
chrome.downloads.onChanged.addListener(function (DownloadItem) {
    // console.log(DownloadItem.error.current);
    // SERVER_FORBIDDEN
    if (DownloadItem.error) {
        chrome.tabs.get(G.tabId, function (tab) {
            if (!downData[DownloadItem.id]) { return; }
            let url = downData[DownloadItem.id].url;
            let initiator = downData[DownloadItem.id].initiator;
            let downFileName = downData[DownloadItem.id].downFileName;
            url = `/m3u8.html?m3u8_url=${encodeURIComponent(url)}&referer=${encodeURIComponent(initiator)}&filename=${encodeURIComponent(downFileName)}`;
            chrome.tabs.create({ url: url, index: tab.index + 1 });
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
    let html = `
        <div class="panel">
            <div class="panel-heading">
                <input type="checkbox" class="DownCheck" checked="true"/>
                <img src="${data.webInfo?.favIconUrl}" class="icon ${G.ShowWebIco && data.webInfo?.favIconUrl ? "" : "hide"}"/>
                <img src="img/regex.png" class="icon ${data.isRegex ? "" : "hide"}" title="正则表达式匹配"/>
                <span class="name">${trimName}</span>
                <span class="size ${data.size ? "" : "hide"}">${data.size}</span>
                <img src="img/copy.png" class="ico" id="copy" title="复制地址"/>
                <img src="img/parsing.png" class="ico ${parsing ? "" : "hide"}" id="${parsingType}" title="解析"/>
                <img src="img/${G.Potplayer ? "potplayer.png" : "play.png"}" class="ico ${isPlay(data) || isM3U8(data) ? "" : "hide"}" id="play" title="预览"/>
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
        </div>`;

    ////////////////////////绑定事件////////////////////////
    html = $(html);
    //展开网址
    html.find('.panel-heading').click(function () {
        html.find(".url").toggle();
        let screenshots = html.find("#screenshots");
        // 预览图片
        if (isPicture(data)) {
            screenshots.css("display", "block");
            screenshots.attr("src", data.url);
            return;
        }
        //获取时长
        let getMediaInfo = html.find("#getMediaInfo");
        let durationNode = html.find("#duration");
        if (html.find(".url").is(":visible") && durationNode.html() == "") {
            getMediaInfo.attr('src', data.url);
            getMediaInfo[0].onloadeddata = function () {
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
                getMediaInfo.removeAttr('src');
            }
            getMediaInfo[0].onplay = function () {
                getMediaInfo.removeAttr('src');
            }
            getMediaInfo[0].onerror = function () {
                getMediaInfo.removeAttr('src');
            }
        }
    });
    //点击复制网址
    html.find('#copy').click(function () {
        navigator.clipboard.writeText(data.url);
        Tips("已复制到剪贴板");
        return false;
    });
    // 下载
    html.find('#download').click(function () {
        if (G.m3u8dl && isM3U8(data)) {
            let m3u8dlArg = G.m3u8dlArg.replace("$referer$", data.initiator);
            m3u8dlArg = m3u8dlArg.replace("$url$", data.url);
            m3u8dlArg = m3u8dlArg.replace("$title$", unescape(encodeURIComponent(data.title)));
            let url = 'm3u8dl://' + btoa(m3u8dlArg);
            if (url.length >= 2046) {
                alert("m3u8dl参数太长,可能导致无法唤醒m3u8DL, 请手动复制到m3u8DL下载");
            }
            window.open(url);
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
            window.open('potplayer://' + data.url);
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
            let video = $('#player video')[0];
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
        let id = $(this).attr('id');
        let title = encodeURIComponent(data.title);
        let url = encodeURIComponent(data.url);
        let initiator = encodeURIComponent(data.initiator);
        chrome.tabs.get(G.tabId, function (tab) {
            if (id == "m3u8") {
                url = `/m3u8.html?m3u8_url=${url}&referer=${initiator}&title=${title}`;
            } else {
                url = `/json.html?url=${url}&referer=${initiator}&title=${title}`;
            }
            chrome.tabs.create({ url: url, index: tab.index + 1 });
        });
        return false;
    });
    //多选框
    html.find('input').click(function () {
        //防止绑定事件重叠
        html.find(".url").toggle();
        return true;
    });
    //添加页面
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
        let index = $(this).index();
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
        let FileNum = $('.TabShow :checked').length;
        if (FileNum >= 10 && !confirm("共 " + FileNum + "个文件，是否确认下载?")) {
            return;
        }
        $('.TabShow :checked').each(function () {
            const link = $(this).parents(".panel").find("a");
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
        let count = $('.TabShow :checked').length;
        if (count == 0) { return false };
        let url = '';
        $('.TabShow :checked').each(function () {
            url += $(this).parents('.panel').find('.url a').attr('href') + "\n";
        });
        navigator.clipboard.writeText(url);
        Tips("已复制到剪贴板");
    });
    //全选
    $('#AllSelect').click(function () {
        $('.TabShow input').each(function () {
            $(this).attr("checked", true);
        });
    });
    //反选
    $('#ReSelect').click(function () {
        $('.TabShow input').each(function () {
            $(this).attr('checked', !$(this).prop('checked'));
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
        let action = $(this).data("switch");
        if (action == "on") {
            $("#MobileUserAgent").html("关闭模拟");
            $("#MobileUserAgent").data("switch", "off");
        } else {
            $("#MobileUserAgent").html("模拟手机");
            $("#MobileUserAgent").data("switch", "on");
        }
        chrome.runtime.sendMessage({ Message: "mobileUserAgent", tabId: G.tabId, action: action }, function () {
            $('#Clear').click();
        });
    });
    // 自动下载
    $("#AutoDown").click(function () {
        let action = $(this).data("switch");
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
        let action = $(this).data("switch");
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

    //102以上开启捕获按钮
    if (G.moreFeat) {
        $("#Catch").show();
    }
});

//html5播放器允许格式
function isPlay(data) {
    if (G.Potplayer) { return true }
    let arr = ['ogg', 'ogv', 'mp4', 'webm', 'mp3', 'wav', 'flv', 'm4a', '3gp', 'mpeg', 'mov'];
    return arr.includes(data.ext);
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

//取消提示 3个以上显示操作按钮
function UItoggle() {
    let length = $('.TabShow #download').length;
    length > 0 ? $('#Tips').hide() : $('#Tips').show();
    length >= 30 ? $('#ToBottom').show() : $('#ToBottom').hide();
    length = $('#mediaList .panel').length;
    $("#mediaQuantity").text("[" + length + "]");
    length = $('#otherMediaList .panel').length;
    $("#otherQuantity").text("[" + length + "]");
}

function Tips(text, delay = 200) {
    $('#TipsFixed').html(text).fadeIn(500).delay(delay).fadeOut(500);
}