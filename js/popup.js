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
// 储存所有资源数据
const allData = new Map([
    [true, new Map()],  // 当前页面
    [false, new Map()]  // 其他页面
]);
// 筛选
const $filter_ext = $("#filter #ext");
// 储存所有扩展名，保存是否筛选状态 来判断新加入的资源 立刻判断是否需要隐藏
const filterExt = new Map();
// 当前所在页面
let activeTab = true;
// 储存下载id
const downData = [];
// 图标地址
const favicon = new Map();
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
    const html = AddMedia(MediaData, MediaData.tabId == G.tabId);
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
function AddMedia(data, currentTab = true) {
    data._title = data.title;
    data.title = stringModify(data.title);
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
    data.downFileName = G.TitleName ? templates(G.downFileName, data) : data.name;
    // 文件大小单位转换
    if (data.size) {
        data.size = byteToSize(data.size);
    }
    // 是否需要解析
    data.parsing = false;
    if (isM3U8(data)) {
        data.parsing = "m3u8";
    } else if (isMPD(data)) {
        data.parsing = "mpd";
    } else if (isJSON(data)) {
        data.parsing = "json";
    }
    // 网站图标
    if (data.favIconUrl && !favicon.has(data.webUrl)) {
        favicon.set(data.webUrl, data.favIconUrl);
    }
    data.isPlay = isPlay(data);
    //添加html
    data.html = $(`
        <div class="panel">
            <div class="panel-heading">
                <input type="checkbox" class="DownCheck" checked/>
                ${G.ShowWebIco ? `<img class="favicon ${!data.favIconUrl ? "faviconFlag" : ""}" requestId="${data.requestId}" src="${data.favIconUrl}"/>` : ""}
                <img src="img/regex.png" class="favicon regex ${data.isRegex ? "" : "hide"}" title="正则表达式匹配 或 来自深度搜索"/>
                <span class="name ${data.parsing || data.isRegex ? "bold" : ""}">${trimName}</span>
                <span class="size ${data.size ? "" : "hide"}">${data.size}</span>
                <img src="img/copy.png" class="icon copy" id="copy" title="复制地址"/>
                <img src="img/parsing.png" class="icon parsing ${data.parsing ? "" : "hide"}" id="parsing" data-type="${data.parsing}" title="解析"/>
                <img src="img/play.png" class="icon play ${data.isPlay ? "" : "hide"}" id="play" title="预览"/>
                <img src="img/download.png" class="icon download" id="download" title="下载"/>
            </div>
            <div class="url hide">
                <div id="mediaInfo" data-state="false">
                    ${data.title ? `<b>标题:</b> ${data.title}` : ""}
                    ${data.type ? `<br><b>MIME:</b>  ${data.type}` : ""}
                </div>
                <div class="moreButton">
                    <div id="qrcode"><img src="img/qrcode.png" class="icon qrcode" title="显示资源地址二维码"/></div>
                    <div id="catDown"><img src="img/cat-down.png" class="icon cat-down" title="携带referer参数下载"/></div>
                </div>
                <a href="${data.url}" target="_blank" download="${data.downFileName}">${data.url}</a>
                <br>
                <img id="screenshots" class="hide"/>
                <video id="preview" class="hide" controls></video>
            </div>
        </div>`);
    ////////////////////////绑定事件////////////////////////
    //展开网址
    data.urlPanel = data.html.find(".url");
    data.urlPanelShow = false;
    data.panelHeading = data.html.find(".panel-heading");
    data.panelHeading.click(function (event) {
        data.urlPanelShow = !data.urlPanelShow;
        const mediaInfo = data.html.find("#mediaInfo");
        const preview = data.html.find("#preview");
        if (!data.urlPanelShow) {
            if (event.target.id == "play") {
                preview.show().trigger("play");
                return false;
            }
            data.urlPanel.hide();
            !preview[0].paused && preview.trigger("pause");
            return false;
        }
        data.urlPanel.show();
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
            } else if (data.isPlay) {
                preview.attr("src", data.url);
            } else if (isPicture(data)) {
                data.html.find("#screenshots").show().attr("src", data.url);
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
    data.html.find("#qrcode").click(function () {
        const size = data.url.length >= 300 ? 400 : 256;
        $(this).html("").qrcode({ width: size, height: size, text: data.url }).off("click");
    });
    // 猫抓下载器 下载
    data.html.find("#catDown").click(function () {
        catDownload(data);
    });
    //点击复制网址
    data.html.find('#copy').click(function () {
        const text = copyLink(data);
        navigator.clipboard.writeText(text);
        Tips("已复制到剪贴板");
        return false;
    });
    // 下载
    data.html.find('#download').click(function () {
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
    data.html.find('#play').click(function () {
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
    data.html.find('#parsing').click(function () {
        chrome.tabs.get(G.tabId, function (tab) {
            let url = `/${data.parsing}.html?url=${encodeURIComponent(data.url)}&title=${encodeURIComponent(data.title)}&tabid=${data.tabId}`;
            if (data.referer) {
                url += `&referer=${encodeURIComponent(data.referer)}`;
            } else {
                url += `&initiator=${encodeURIComponent(data.initiator)}`;
            }
            chrome.tabs.create({ url: url, index: tab.index + 1 });
        });
        return false;
    });
    // 多选框 创建checked属性 值和checked状态绑定
    data._checked = true;
    data.html.find('input').click(function (event) {
        data._checked = this.checked;
        event.originalEvent.cancelBubble = true;
    });
    Object.defineProperty(data, "checked", {
        get() {
            return data._checked;
        },
        set(newValue) {
            data._checked = newValue;
            data.html.find('input').prop("checked", newValue);
        }
    });

    // 使用Map 储存数据
    allData.get(currentTab).set(data.requestId, data);

    // 筛选
    if (!filterExt.has(data.ext)) {
        filterExt.set(data.ext, true);
        const html = $(`<label class="flexFilter" id="${data.ext}"><input type="checkbox" checked>${data.ext}</label>`);
        html.click(function () {
            filterExt.set(this.id, html.find("input").prop("checked"));
            getAllData().forEach(function (value) {
                if (filterExt.get(value.ext)) {
                    value.html.find("input").prop("checked", true);
                    value.html.show();
                } else {
                    value.html.find("input").prop("checked", false);
                    value.html.hide();
                }
            });
        });
        $filter_ext.append(html);
    }
    // 如果被筛选出去 直接隐藏
    if (!filterExt.get(data.ext)) {
        data.html.hide();
        data.html.find("input").prop("checked", false);
    }

    return data.html;
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
    $("#filter, #scriptCatch, #unfold").hide();
    activeTab = this.id == "currentTab";
});
// 其他页面
$('#allTab').click(function () {
    !allCount && chrome.storage.local.get("MediaData", function (items) {
        if (items.MediaData === undefined) { return; }
        for (let key in items.MediaData) {
            if (key == G.tabId) { continue; }
            allCount += items.MediaData[key].length;
            for (let i = 0; i < items.MediaData[key].length; i++) {
                $all.append(AddMedia(items.MediaData[key][i], false));
            }
        }
        allCount && $allMediaList.append($all);
        UItoggle();
    });
});
// 下载选中文件
$('#DownFile').click(function () {
    let confirm = 0
    getData().forEach(function (data) { data.checked && confirm++; });
    if (confirm >= 10 && !confirm("共 " + confirm + "个文件，是否确认下载?")) {
        return;
    }
    getData().forEach(function (data) {
        if (data.checked) {
            setTimeout(function () {
                chrome.downloads.download({
                    url: data.url,
                    filename: data.title + "/" + data.downFileName
                }, function (id) { downData[id] = data; });
            }, 500);
        }
    });
});
// 复制选中文件
$('#AllCopy').click(function () {
    const url = [];
    getData().forEach(function (data) {
        if (data.checked) {
            url.push(data.parsing ? copyLink(data) : data.url);
        }
    });
    navigator.clipboard.writeText(url.join("\n"));
    Tips("已复制到剪贴板");
});
// 全选 反选
$('#AllSelect, #ReSelect').click(function () {
    const checked = this.id == "AllSelect";
    getData().forEach(function (data) {
        data.checked = checked ? checked : !data.checked;
    });
});
// unfoldAll展开全部  unfoldPlay展开可播放 unfoldFilter展开选中的 fold关闭展开
$('#unfold button').click(function () {
    $("#unfold").hide();
    if (this.id == "unfoldAll") {
        getData().forEach(function (data) {
            !data.urlPanelShow && data.panelHeading.click();
        });
        return;
    }
    if (this.id == "unfoldPlay") {
        getData().forEach(function (data) {
            if (data.isPlay && !data.urlPanelShow) {
                data.panelHeading.click();
            }
        });
        return;
    }
    if (this.id == "unfoldFilter") {
        getData().forEach(function (data) {
            if (!data.urlPanelShow && data.checked) {
                data.panelHeading.click();
            }
        });
        return;
    }
    if (this.id == "fold") {
        getData().forEach(function (data) {
            data.urlPanelShow && data.panelHeading.click();
        });
        return;
    }
});
// 捕捉/录制 展开按钮 筛选按钮 按钮
$('#Catch, #openUnfold, #openFilter').click(function () {
    // const _height = parseInt($(".container").css("margin-bottom"));
    // $(".container").css("margin-bottom", ($down[0].offsetHeight + 26) + "px");
    const $panel = $(`#${this.getAttribute("panel")}`);
    $(".more").not($panel).hide();
    if (this.id == "Catch" || this.id == "openFilter" || this.id == "openUnfold") {
        if ($panel.is(":hidden")) {
            $panel.css("display", "flex");
            return;
        }
        // $(".container").css("margin-bottom", _height);
        $panel.hide();
    }
});
// 清空数据
$('#Clear').click(function () {
    chrome.runtime.sendMessage({ Message: "clearData", tabId: G.tabId, type: activeTab });
    chrome.runtime.sendMessage({ Message: "ClearIcon", type: activeTab });
    if (activeTab) {
        currentCount = 0;
        $current.empty();
    } else {
        allCount = 0;
        $all.empty();
    }
    UItoggle();
});
// 模拟手机端
$("#MobileUserAgent").click(function () {
    const action = $(this).data("switch");
    if (action == "on") {
        $(this).html("关闭模拟").data("switch", "off");
    } else {
        $(this).html("模拟手机").data("switch", "on");
    }
    chrome.runtime.sendMessage({ Message: "mobileUserAgent", tabId: G.tabId, action: action }, function () {
        G.refreshClear ? $('#Clear').click() : location.reload();
    });
});
// 自动下载
$("#AutoDown").click(function () {
    const action = $(this).data("switch");
    if (action == "on") {
        if (confirm("当前页面找到资源立刻尝试下载\n是否确认开启?")) {
            $(this).html("关闭自动下载").data("switch", "off");
        } else {
            return true;
        }
    } else {
        $(this).html("自动下载").data("switch", "on");
    }
    chrome.runtime.sendMessage({ Message: "autoDown", tabId: G.tabId, action: action });
});
// 102以上开启 捕获按钮/注入脚本
if (G.version >= 102) {
    $("#search").show();
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
$("[go]").click(function () {
    chrome.tabs.create({ url: this.getAttribute("go") });
});
// 一些需要等待G变量加载完整的操作
const interval = setInterval(function () {
    if (!G.initComplete || !G.tabId) { return; }
    clearInterval(interval);
    // 获取模拟手机 自动下载 捕获 状态
    chrome.runtime.sendMessage({ Message: "getButtonState", tabId: G.tabId }, function (state) {
        state.MobileUserAgent && $("#MobileUserAgent").html("关闭模拟").data("switch", "off");
        state.AutoDown && $("#AutoDown").html("关闭自动下载").data("switch", "off");
        state.search && $("#search").html("关闭搜索");
        state.catch && $("#catch").html("关闭捕获");
        state.recorder && $("#recorder").html("关闭录制");
        state.recorder2 && $("#recorder2").html("关闭屏幕捕捉");
    });
    // 深度搜索 注入脚本
    $("#scriptCatch button, #search").click(function () {
        $("#scriptCatch").hide();
        chrome.runtime.sendMessage({ Message: "script", tabId: G.tabId, script: this.id + ".js" });
        G.refreshClear && $('#Clear').click();
        location.reload();
    });

    // 上一次设定的倍数
    $("#playbackRate").val(G.playbackRate);

    $(`<style>${G.css}</style>`).appendTo("head");
}, 4);
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
function copyLink(data) {
    let text = data.url;
    if (data.parsing == "m3u8") {
        text = G.copyM3U8;
    } else if (data.parsing == "mpd") {
        text = G.copyMPD;
    } else {
        text = G.copyOther;
    }
    return templates(text, data);
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
    getData().size > 0 ? $tips.hide() : $tips.show().html("还没闻到味儿~");
    $currentCount.text(currentCount ? `[${currentCount}]` : "");
    $allCount.text(allCount ? `[${allCount}]` : "");
    if ($('.TabShow').attr("id") == "otherOptions") {
        $tips.hide();
        $down.hide();
    } else if ($down.is(":hidden")) {
        $down.show();
    }
    // 更新图标
    $(".faviconFlag").each(function () {
        const data = getData(this.getAttribute("requestId"));
        if (favicon.has(data.webUrl)) {
            this.setAttribute("src", favicon.get(data.webUrl));
            this.classList.remove("faviconFlag");
        }
    });
}
// 获取当前标签的资源列表 存在requestId返回该资源
function getData(requestId = false) {
    if (requestId) {
        return allData.get(activeTab).get(requestId);
    }
    return allData.get(activeTab);
}
// 获取所有资源列表
function getAllData() {
    const data = [];
    data.push(...allData.get(true).values());
    data.push(...allData.get(false).values());
    return data;
}