// 当前页面
const $mediaList = $('#mediaList');
const $current = $("<div></div>");
const $currentCount = $("#currentTab #quantity");
let currentCount = 0;
// 其他页面
const $allMediaList = $('#allMediaList');
const $all = $("<div></div>");
const $allCount = $("#allTab #quantity");
let allCount = 0;
// 提示 操作按钮 DOM
const $tips = $("#Tips");
const $down = $("#down");
// 储存下载id
const downData = [];
// HeartBeat
chrome.runtime.sendMessage(chrome.runtime.id, { Message: "HeartBeat" });
// 清理冗余数据
chrome.runtime.sendMessage(chrome.runtime.id, { Message: "clearRedundant" });
// 填充数据
chrome.storage.local.get("MediaData", function (items) {
    if (items.MediaData === undefined || items.MediaData[G.tabId] == undefined) {
        $tips.html("还没闻到味儿~");
        return;
    }
    currentCount = items.MediaData[G.tabId].length;
    for (let key = 0; key < currentCount; key++) {
        $current.append(AddMedia(items.MediaData[G.tabId][key]));
    }
    $mediaList.append($current);
    UItoggle();
});
// 监听资源数据
chrome.runtime.onMessage.addListener(function (MediaData, sender, sendResponse) {
    const html = AddMedia(MediaData);
    if (MediaData.tabId == G.tabId) {
        !currentCount && $mediaList.append($current);
        currentCount++;
        $current.append(html);
        UItoggle();
    } else if (allCount) {
        allCount++;
        $all.append(html);
        UItoggle();
    }
    sendResponse("OK");
});
// 监听下载 出现服务器拒绝错误 调用下载器
chrome.downloads.onChanged.addListener(function (item) {
    if (G.catDownload) { delete downData[item.id]; return; }
    const errorList = ["SERVER_BAD_CONTENT", "SERVER_UNAUTHORIZED", "SERVER_UNAUTHORIZED", "SERVER_FORBIDDEN", "SERVER_UNREACHABLE", "SERVER_CROSS_ORIGIN_REDIRECT"];
    if (item.error && errorList.includes(item.error.current) && downData[item.id]) {
        catDownload(downData[item.id]);
        delete downData[item.id];
    }
});

// 生成资源DOM
function AddMedia(data) {
    // console.log(data);
    data._title = stringModify(data.title);
    data.title = trimTitle(data._title);

    // 正则匹配的备注扩展
    if (data.extraExt) {
        data.ext = data.extraExt;
    }
    // 不存在扩展使用类型
    if (data.ext === undefined && data.type !== undefined) {
        data.ext = data.type.split("/")[1];
    }

    //文件名
    data.name = isEmpty(data.name) ? data.title + '.' + data.ext : decodeURIComponent(stringModify(data.name));

    // Youtube
    if (data.name == "videoplayback" && data.url.includes("googlevideo.com")) {
        data.name = data.title + '.' + data.ext;
        const size = data.url.match(/&clen=([\d]*)/);
        data.size = size ? size[1] : 0;
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
    let parsing = false;
    if (isM3U8(data)) {
        parsing = "m3u8";
    } else if (isMPD(data)) {
        parsing = "mpd";
    } else if (isJSON(data)) {
        parsing = "json";
    }

    // 网站图标 不存在 使用duckduckgo图标服务
    if (!data.favIconUrl) {
        // data.favIconUrl = "https://icons.duckduckgo.com/ip3/" + new URL(data.initiator).hostname + ".ico";
        data.favIconUrl = "img/web-favicon.png";
    }
    //添加html
    const html = $(`
        <div class="panel" id="requestId${data.requestId}">
            <div class="panel-heading">
                <input type="checkbox" class="DownCheck" checked="true"/>
                ${G.ShowWebIco ? `<img src="${data.favIconUrl}" class="favicon"/>` : ""}
                <img src="img/regex.png" class="favicon ${data.isRegex ? "" : "hide"}" title="正则表达式匹配 或 来自深度搜索"/>
                <span class="name ${parsing || data.isRegex ? "bold" : ""}">${trimName}</span>
                <span class="size ${data.size ? "" : "hide"}">${data.size}</span>
                <img src="img/copy.png" class="icon" id="copy" title="复制地址"/>
                <img src="img/parsing.png" class="icon ${parsing ? "" : "hide"}" id="parsing" data-type="${parsing}" title="解析"/>
                <img src="img/${G.Player ? "player.png" : "play.png"}" class="icon ${isPlay(data) ? "" : "hide"}" id="play" title="预览"/>
                <img src="img/download.png" class="icon" id="download" title="下载"/>
            </div>
            <div class="url hide">
                <div id="mediaInfo" data-state="false">
                    ${data._title ? `<b>标题:</b> ${data._title}` : ""}
                    ${data.type ? `<br><b>MIME:</b>  ${data.type}` : ""}
                </div>
                <div class="moreButton">
                    <div id="qrcode"><img src="img/qrcode.png" class="icon" title="显示资源地址二维码"/></div>
                    <div id="catDown"><img src="img/cat-down.png" class="icon" title="携带referer参数下载"/></div>
                </div>
                <a href="${data.url}" target="_blank" download="${data.downFileName}" data-referer="${data.referer ?? ""}" data-initiator="${data.initiator}" data-title="${data.title}" data-weburl="${data.webUrl}">${data.url}</a>
                <br>
                <img id="screenshots" class="hide"/>
                <video id="preview" class="hide" controls></video>
            </div>
        </div>`);
    ////////////////////////绑定事件////////////////////////
    //展开网址
    html.find('.panel-heading').click(function (event) {
        const html = $(this).parent();
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
                let hls = new Hls({ enableWorker: false });
                hls.loadSource(data.url);
                hls.attachMedia(preview[0]);
                hls.on(Hls.Events.BUFFER_CREATED, function (event, data) {
                    if (data.tracks) {
                        if (data.tracks.audiovideo) { return; }
                        !data.tracks.audio && mediaInfo.append("<br><b>无音频</b>");
                        !data.tracks.video && mediaInfo.append("<br><b>无视频 或 HEVC/H.265编码ts文件</b>");
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
    // 猫抓下载器 下载
    html.find("#catDown").click(function () {
        catDownload(data);
    });
    //点击复制网址
    html.find('#copy').click(function () {
        const text = copyLink(parsing, data);
        navigator.clipboard.writeText(text);
        Tips("已复制到剪贴板");
        return false;
    });
    // 下载
    html.find('#download').click(function () {
        if (G.m3u8dl && (isM3U8(data) || isMPD(data))) {
            let m3u8dlArg = templates(G.m3u8dlArg, data);
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
            filename: data.downFileName,
            saveAs: G.saveAs
        }, function (id) { downData[id] = data; });
        return false;
    });
    //播放
    html.find('#play').click(function () {
        if (isEmpty(G.Player)) { return true; }
        if (G.Player == "$shareApi$" || G.Player == "${shareApi}") {
            navigator.share({ url: data.url });
            return false;
        }
        let url = templates(G.Player, data);
        if (G.isFirefox) {
            window.location.href = url;
            return false;
        }
        chrome.tabs.update({ url: url });
        return false;
    });
    //解析m3u8
    html.find('#parsing').click(function () {
        const type = $(this).data("type");
        chrome.tabs.get(G.tabId, function (tab) {
            let url = `/${type}.html?url=${encodeURIComponent(data.url)}&title=${encodeURIComponent(data.title)}&tabid=${data.tabId}`;
            if (data.referer) {
                url += `&referer=${encodeURIComponent(data.referer)}`;
            } else {
                url += `&initiator=${encodeURIComponent(data.initiator)}`;
            }
            chrome.tabs.create({ url: url, index: tab.index + 1 });
        });
        return false;
    });
    //多选框
    html.find('input').click(function (event) {
        event.originalEvent.cancelBubble = true;
    });

    return html;
}

/********************绑定事件********************/
//标签切换
$(".Tabs .TabButton").click(function () {
    const index = $(this).index();
    $(".Tabs .TabButton").removeClass('Active');
    $(this).addClass("Active");
    $(".container").removeClass("TabShow");
    $(".container").eq(index).addClass("TabShow");
    UItoggle();
});
// 其他页面
$('#allTab').click(function () {
    !allCount && chrome.storage.local.get("MediaData", function (items) {
        if (items.MediaData === undefined) { return; }
        for (let key in items.MediaData) {
            if (key == G.tabId) { continue; }
            allCount += items.MediaData[key].length;
            for (let i = 0; i < items.MediaData[key].length; i++) {
                $all.append(AddMedia(items.MediaData[key][i]));
            }
        }
        allCount && $allMediaList.append($all);
        UItoggle();
    });
});
// 下载选中文件
$('#DownFile').click(function () {
    const checked = $('.TabShow :checked');
    if (checked.length >= 10 && !confirm("共 " + checked.length + "个文件，是否确认下载?")) {
        return;
    }
    checked.each(function () {
        const link = $(this).parents(".panel").find(".url a");
        const url = link.attr("href");
        let title = stringModify(link.data("title"));
        title = title ? title : "CatCatch";
        const filename = title + "/" + stringModify(link.attr("download"));
        const referer = link.data("referer");
        setTimeout(function () {
            chrome.downloads.download({
                url: url,
                filename: filename
            }, function (id) {
                downData[id] = { url: url, downFileName: filename };
                if (referer) { downData[id].referer = referer; }
                downData[id].initiator = referer ? referer : link.data('initiator');
                downData[id].webUrl = link.data("weburl");
            });
        }, 500);
    });
});
// 复制选中文件
$('#AllCopy').click(function () {
    const checked = $('.TabShow :checked');
    if (checked.length == 0) { return false };
    const url = [];
    checked.each(function () {
        const type = $(this).siblings("#parsing").data("type");
        const link = $(this).parents('.panel').find('.url a');
        let href = link.attr('href');
        if (type) {
            const referer = link.data('referer');
            const title = link.data('title');
            const data = { url: href, title: title };
            if (referer) { data.referer = referer; }
            data.initiator = referer ? referer : link.data('initiator');
            data.webUrl = link.data("weburl");
            href = copyLink(type, data);
        }
        url.push(href);
    });
    navigator.clipboard.writeText(url.join("\n"));
    Tips("已复制到剪贴板");
});
// 全选
$('#AllSelect').click(function () {
    $('.TabShow input').each(function () {
        $(this).prop("checked", true);
    });
});
// 反选
$('#ReSelect').click(function () {
    $('.TabShow input').each(function () {
        $(this).prop('checked', !$(this).prop('checked'));
    });
});
// 清空数据
$('#Clear').click(function () {
    const type = $('.Active').attr("id") != "allTab";
    chrome.runtime.sendMessage({ Message: "clearData", tabId: G.tabId, type: type });
    !type && chrome.runtime.sendMessage({ Message: "ClearIcon" });
    location.reload();
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
        if (confirm("当前页面找到资源立刻尝试下载\n是否确认开启?")) {
            $("#AutoDown").html("关闭自动下载").data("switch", "off");
            chrome.runtime.sendMessage({ Message: "autoDown", tabId: G.tabId, action: action });
        }
    } else {
        $("#AutoDown").html("自动下载").data("switch", "on");
        chrome.runtime.sendMessage({ Message: "autoDown", tabId: G.tabId, action: action });
    }
});
// 102以上开启 捕获按钮/注入脚本
if (G.version >= 102) {
    $("#Catch").show();
    $("#otherScript").show();
}
// Firefox 关闭画中画 全屏 修复右边滚动条遮挡
if (G.isFirefox) {
    $("body").addClass("fixFirefoxRight");
    $(".firefoxHide").each(function () { $(this).hide(); });
}

// 解决浏览器字体设置超过16px按钮变高遮挡一条资源
if ($down[0].offsetHeight > 30) {
    $(".container").css("margin-bottom", ($down[0].offsetHeight + 2) + "px");
}
// 跳转页面
$(".otherFeat .button2, #Options").click(function () {
    chrome.tabs.create({ url: $(this).data("go") });
});
// 一些需要等待G变量加载完整的操作
const interval = setInterval(function () {
    if (!G.initComplete || !G.tabId) { return; }
    clearInterval(interval);
    // 获取模拟手机 自动下载 捕获 状态
    chrome.runtime.sendMessage({ Message: "getButtonState", tabId: G.tabId }, function (state) {
        if (state.mobile) {
            $("#MobileUserAgent").html("关闭模拟").data("switch", "off");
        }
        if (state.autodown) {
            // Tips("已关闭自动下载", 500);
            $("#AutoDown").html("关闭自动下载").data("switch", "off");
        }
        if (state.catch) {
            $("#Catch").html("关闭脚本").data("switch", "off");
        }
    });
    // 捕获按钮
    if ($("#Catch").data("switch") != "off") {
        G.injectScript = G.scriptList.has(G.injectScript) ? G.injectScript : GetDefault("injectScript");
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
/********************绑定事件END********************/

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
// 复制选项
function copyLink(type, data) {
    let text = data.url;
    if (type == "m3u8") {
        text = G.copyM3U8;
    } else if (type == "mpd") {
        text = G.copyMPD;
    } else {
        text = G.copyOther;
    }
    return templates(text, data);
}
// 修剪标题
function trimTitle(title) {
    const _title = title;
    if (!G.trimTitleRE) { return _title; }
    try {
        const result = title.match(G.trimTitleRE);
        if (result && result.length >= 2) {
            title = "";
            for (let i = 1; i < result.length; i++) {
                title += result[i].trim();
            }
        }
        return title;
    } catch (e) { console.log(e); return _title; }
}
// 携带referer 下载
function catDownload(obj) {
    chrome.tabs.get(G.tabId, function (tab) {
        chrome.tabs.create({
            url: `/download.html?url=${encodeURIComponent(
                obj.url
            )}&referer=${encodeURIComponent(
                obj.referer ?? obj.initiator
            )}&filename=${encodeURIComponent(
                obj.downFileName
            )}`,
            index: tab.index + 1
        });
    });
}
// 提示
function Tips(text, delay = 200) {
    $('#TipsFixed').html(text).fadeIn(500).delay(delay).fadeOut(500);
}
/*
* 有资源 隐藏无资源提示
* 更新数量显示
* 如果标签是其他设置 隐藏底部按钮
*/
function UItoggle() {
    let length = $('.TabShow .panel').length;
    length > 0 ? $tips.hide() : $tips.show().html("还没闻到味儿~");
    currentCount && $currentCount.text("[" + currentCount + "]");
    allCount && $allCount.text("[" + allCount + "]");
    if ($('.TabShow').attr("id") == "otherOptions") {
        $tips.hide();
        $down.hide();
    } else if ($down.is(":hidden")) {
        $down.show();
    }
}