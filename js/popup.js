// 解析参数
const params = new URL(location.href).searchParams;
const _tabId = parseInt(params.get("tabId"));
const _type = params.get("type");

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
// 疑似密钥
const $maybeKey = $("<div></div>");
// 提示 操作按钮 DOM
const $tips = $("#Tips");
const $down = $("#down");
const $mergeDown = $("#mergeDown");
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
// 当前页面DOM
let pageDOM = undefined;
// HeartBeat
chrome.runtime.sendMessage(chrome.runtime.id, { Message: "HeartBeat" });
// 清理冗余数据
chrome.runtime.sendMessage(chrome.runtime.id, { Message: "clearRedundant" });
// 监听下载 出现服务器拒绝错误 调用下载器
chrome.downloads.onChanged.addListener(function (item) {
    if (G.catDownload) { delete downData[item.id]; return; }
    const errorList = ["SERVER_BAD_CONTENT", "SERVER_UNAUTHORIZED", "SERVER_FORBIDDEN", "SERVER_UNREACHABLE", "SERVER_CROSS_ORIGIN_REDIRECT", "SERVER_FAILED", "NETWORK_FAILED"];
    if (item.error && errorList.includes(item.error.current) && downData[item.id]) {
        catDownload(downData[item.id]);
        delete downData[item.id];
    }
});
// 复选框状态 点击返回或者全选后 影响新加入的资源 复选框勾选状态
let checkboxState = true;

// 生成资源DOM
function AddMedia(data, currentTab = true) {
    data._title = data.title;
    data.title = stringModify(data.title);
    //文件名
    data.name = isEmpty(data.name) ? data.title + '.' + data.ext : decodeURIComponent(stringModify(data.name));
    //截取文件名长度
    let trimName = data.name;
    if (data.name && data.name.length >= 50 && !_tabId) {
        trimName = trimName.substr(0, 20) + '...' + trimName.substr(-30);
    }
    //添加下载文件名
    Object.defineProperty(data, "pageDOM", {
        get() { return pageDOM; }
    });
    data.downFileName = G.TitleName ? templates(G.downFileName, data) : data.name;
    data.downFileName = filterFileName(data.downFileName);
    if (isEmpty(data.downFileName)) {
        data.downFileName = data.name;
    }
    // 文件大小单位转换
    data._size = data.size;
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

    if (allData.get(currentTab).has(data.requestId)) {
        data.requestId = data.requestId + "_" + Date.now().toString();
    }

    //添加html
    data.html = $(`
        <div class="panel">
            <div class="panel-heading">
                <input type="checkbox" class="DownCheck"/>
                ${G.ShowWebIco ? `<img class="favicon ${!data.favIconUrl ? "faviconFlag" : ""}" requestId="${data.requestId}" src="${data.favIconUrl}"/>` : ""}
                <img src="img/regex.png" class="favicon regex ${data.isRegex ? "" : "hide"}" title="${i18n.regexTitle}"/>
                <span class="name ${data.parsing || data.isRegex || data.tabId == -1 ? "bold" : ""}">${trimName}</span>
                <span class="size ${data.size ? "" : "hide"}">${data.size}</span>
                <img src="img/copy.png" class="icon copy" id="copy" title="${i18n.copy}"/>
                <img src="img/parsing.png" class="icon parsing ${data.parsing ? "" : "hide"}" id="parsing" data-type="${data.parsing}" title="${i18n.parser}"/>
                <img src="img/play.png" class="icon play ${data.isPlay ? "" : "hide"}" id="play" title="${i18n.preview}"/>
                <img src="img/download.svg" class="icon download" id="download" title="${i18n.download}"/>
                <img src="img/aria2.png" class="icon aria2 ${G.enableAria2Rpc ? "" : "hide"}"" id="aria2" title="Aria2"/>
                <img src="img/invoke.svg" class="icon invoke ${G.invoke ? "" : "hide"}"" id="invoke" title="${i18n.invoke}"/>
                <img src="img/send.svg" class="icon send ${G.send2localManual || G.send2local ? "" : "hide"}"" id="send2local" title="${i18n.send2local}"/>
            </div>
            <div class="url hide">
                <div id="mediaInfo" data-state="false">
                    ${data.title ? `<b>${i18n.title}:</b> ${data.title}` : ""}
                    ${data.type ? `<br><b>MIME:</b>  ${data.type}` : ""}
                </div>
                <div class="moreButton">
                    <div id="qrcode"><img src="img/qrcode.png" class="icon qrcode" title="QR Code"/></div>
                    <div id="catDown"><img src="img/cat-down.png" class="icon cat-down" title="${i18n.downloadWithRequestHeader}"/></div>
                    <div><img src="img/invoke.svg" class="icon invoke" title="${i18n.invoke}"/></div>
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
                const hls = new Hls({ enableWorker: false });
                setRequestHeaders(data.requestHeaders, function () {
                    hls.loadSource(data.url);
                    hls.attachMedia(preview[0]);
                });
                hls.on(Hls.Events.BUFFER_CREATED, function (event, data) {
                    if (data.tracks && !data.tracks.audiovideo) {
                        !data.tracks.audio && mediaInfo.append(`<br><b>${i18n.noAudio}</b>`);
                        !data.tracks.video && mediaInfo.append(`<br><b>${i18n.noVideo}</b>`);
                    }
                });
                hls.on(Hls.Events.ERROR, function (event, data) {
                    hls.stopLoad();
                });
                hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                    if (data.levels.length > 1 && !mediaInfo.text().includes(i18n.m3u8Playlist)) {
                        mediaInfo.append(`<br><b>${i18n.m3u8Playlist}</b>`);
                    }
                });
            } else if (data.isPlay) {
                setRequestHeaders(data.requestHeaders, function () {
                    preview.attr("src", data.url);
                });
            } else if (isPicture(data)) {
                setRequestHeaders(data.requestHeaders, function () {
                    data.html.find("#screenshots").show().attr("src", data.url);
                });
                return false;
            } else {
                return false;
            }
            preview.on("loadedmetadata", function () {
                preview.show();
                if (this.duration && this.duration != Infinity) {
                    data.duration = this.duration;
                    mediaInfo.append(`<br><b>${i18n.duration}:</b> ` + secToTime(this.duration));
                }
                if (this.videoHeight && this.videoWidth) {
                    mediaInfo.append(`<br><b>${i18n.resolution}:</b> ` + this.videoWidth + "x" + this.videoHeight);
                    data.videoWidth = this.videoWidth;
                    data.videoHeight = this.videoHeight;
                }
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
        Tips(i18n.copiedToClipboard);
        return false;
    });
    // 发送到Aria2
    data.html.find('#aria2').click(function () {
        aria2AddUri(data, function (data) {
            Tips(i18n.hasSent + JSON.stringify(data), 2000);
        }, function (errMsg) {
            Tips(i18n.sendFailed, 2000);
            console.log(errMsg);
        });
        return false;
    });
    // 下载
    data.html.find('#download').click(function (event) {
        if (G.m3u8dl && (isM3U8(data) || isMPD(data))) {
            if (!data.url.startsWith("blob:")) {
                const m3u8dlArg = data.m3u8dlArg ?? templates(G.m3u8dlArg, data);
                const url = 'm3u8dl:' + (G.m3u8dl == 1 ? Base64.encode(m3u8dlArg) : m3u8dlArg);
                if (url.length >= 2046) {
                    navigator.clipboard.writeText(m3u8dlArg);
                    Tips(i18n.M3U8DLparameterLong, 2000);
                    return false;
                }
                // 下载前确认参数
                if (G.m3u8dlConfirm && event.originalEvent && event.originalEvent.isTrusted) {
                    data.html.find('.confirm').remove();
                    const confirm = $(`<div class="confirm">
                        <textarea type="text" class="width100" rows="10">${m3u8dlArg}</textarea>
                        <button class="button2" id="confirm">${i18n.confirm}</button>
                        <button class="button2" id="close">${i18n.close}</button>
                    </div>`);
                    confirm.find("#confirm").click(function () {
                        data.m3u8dlArg = confirm.find("textarea").val();
                        data.html.find('#download').click();
                        confirm.hide();
                    });
                    confirm.find("#close").click(function () {
                        confirm.remove();
                    });
                    data.html.append(confirm);
                    return false;
                }
                if (G.isFirefox) {
                    window.location.href = url;
                    return false;
                }
                chrome.tabs.update({ url: url });
                return false;
            }
            Tips(i18n.blobM3u8DLError, 1500);
        }
        if (G.m3u8AutoDown && data.parsing == "m3u8") {
            openParser(data, { autoDown: true });
            return false;
        }
        chrome.downloads.download({
            url: data.url,
            filename: data.downFileName,
            saveAs: G.saveAs
        }, function (id) { downData[id] = data; });
        return false;
    });
    // 调用
    data.html.find('.invoke').click(function (event) {
        const url = data.invoke ?? templates(G.invokeText, data);

        // 下载前确认参数
        if (G.invokeConfirm && event.originalEvent && event.originalEvent.isTrusted) {
            data.html.find('.confirm').remove();
            const confirm = $(`<div class="confirm">
                        <textarea type="text" class="width100" rows="10">${url}</textarea>
                        <button class="button2" id="confirm">${i18n.confirm}</button>
                        <button class="button2" id="close">${i18n.close}</button>
                    </div>`);
            confirm.find("#confirm").click(function () {
                data.invoke = confirm.find("textarea").val();
                data.html.find('.invoke').click();
                confirm.hide();
            });
            confirm.find("#close").click(function () {
                confirm.remove();
            });
            data.html.append(confirm);
            return false;
        }

        if (G.isFirefox) {
            window.location.href = url;
        } else {
            chrome.tabs.update({ url: url });
        }
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
    //解析
    data.html.find('#parsing').click(function (e) {
        openParser(data);
        return false;
    });
    // 多选框 创建checked属性 值和checked状态绑定
    data._checked = checkboxState;
    data.html.find(".DownCheck").prop("checked", data._checked);
    data.html.find('input').click(function (event) {
        data._checked = this.checked;
        mergeDownButton();
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

    // 数据发送
    data.html.find("#send2local").click(function () {
        send2local("catch", data, data.tabId).then(function (success) {
            success && success?.ok && Tips(i18n.hasSent, 1000);
        }).catch(function (error) {
            error ? Tips(error, 1000) : Tips(i18n.sendFailed, 1000);
        });
        return false;
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
                    value.checked = true;
                    value.html.show();
                } else {
                    value.checked = false;
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

function AddKey(key) {
    // 检查key是否合法
    const base64Key = base64ToHex(key);
    if (!base64Key) { return; }

    const data = {};
    data.html = $(`
        <div class="panel">
            <div class="panel-heading">
                <span class="name bold">${key}</span>
                <img src="img/copy.png" class="icon copy" id="copy" title="${i18n.copy}"/>
                <img src="img/send.svg" class="icon send ${G.send2localManual || G.send2local ? "" : "hide"}"" id="send2local" title="${i18n.send2local}"/>
            </div>
            <div class="url hide">
                Hex: ${base64Key}
                <br>
                Base64: ${key}
            </div>
        </div>`);
    data.html.find('.panel-heading').click(function () {
        data.html.find(".url").toggle();
    });
    data.html.find('.copy').click(function () {
        navigator.clipboard.writeText(key);
        Tips(i18n.copiedToClipboard);
        return false;
    });
    data.html.find("#send2local").click(function () {
        send2local("addKey", key).then(function (success) {
            success && success?.ok && Tips(i18n.hasSent, 1000);
        }).catch(function (error) {
            error ? Tips(error, 1000) : Tips(i18n.sendFailed, 1000);
        });
        return false;
    });
    return data.html;
}

/********************绑定事件********************/
//标签切换
$(".Tabs .TabButton").click(function () {
    activeTab = this.id == "currentTab";
    const index = $(this).index();
    $(".Tabs .TabButton").removeClass('Active');
    $(this).addClass("Active");
    $(".container").removeClass("TabShow").eq(index).addClass("TabShow");
    UItoggle();
    $("#filter, #unfold").hide();
    $("#features").hide();
});
// 其他页面
$('#allTab').click(function () {
    !allCount && chrome.runtime.sendMessage(chrome.runtime.id, { Message: "getAllData" }, function (data) {
        if (!data) { return; }
        for (let key in data) {
            if (key == G.tabId) { continue; }
            allCount += data[key].length;
            for (let i = 0; i < data[key].length; i++) {
                $all.append(AddMedia(data[key][i], false));
            }
        }
        allCount && $allMediaList.append($all);
        UItoggle();
    });
});
// 下载选中文件
$('#DownFile').click(function () {
    const [checkedData, maxSize] = getCheckedData();
    if (checkedData.length >= 10 && !confirm(i18n("confirmDownload", [checkedData.length]))) {
        return;
    }
    if (G.enableAria2Rpc) {
        Tips(i18n.hasSent, 2000);
        checkedData.forEach(function (data) {
            aria2AddUri(data);
        });
        return;
    }
    let index = 0;
    for (let data of checkedData) {
        if (G.m3u8dl && (data.parsing == "m3u8" || data.parsing == "mpd") && !data.url.startsWith("blob:")) {
            const m3u8dlArg = templates(G.m3u8dlArg, data);
            const url = 'm3u8dl:' + (G.m3u8dl == 1 ? Base64.encode(m3u8dlArg) : m3u8dlArg);
            chrome.tabs.create({ url: url });
            continue;
        }
        if (G.m3u8AutoDown && data.parsing == "m3u8") {
            openParser(data, { autoDown: true, autoClose: true });
            continue;
        }
        // 以防止popup页面被关闭 丢失下载数据 批量下载前临时修改为 后台下载
        G.downActive = true;

        index++;
        setTimeout(function () {
            chrome.downloads.download({
                url: data.url,
                filename: data.downFileName
            }, function (id) { downData[id] = data; });
        }, index * 100);
    };
});
// 合并下载
$mergeDown.click(function () {
    const [checkedData, maxSize] = getCheckedData();
    const taskId = Date.parse(new Date());
    // 都是m3u8 自动合并并发送到ffmpeg
    if (checkedData.every(data => isM3U8(data))) {
        checkedData.forEach(function (data) {
            openParser(data, { ffmpeg: "merge", quantity: checkedData.length, taskId: taskId, autoDown: true, autoClose: true });
        });
        return true;
    }
    catDownload(checkedData, { ffmpeg: "merge" })
});
// 复制选中文件
$('#AllCopy').click(function () {
    const url = [];
    getData().forEach(function (data) {
        data.checked && url.push(copyLink(data));
    });
    navigator.clipboard.writeText(url.join("\n"));
    Tips(i18n.copiedToClipboard);
});
// 全选 反选
$('#AllSelect, #invertSelection').click(function () {
    checkboxState = !checkboxState;
    let checked = false;
    if (this.id == "AllSelect") {
        checked = true;
        checkboxState = true;
    }
    getData().forEach(function (data) {
        data.checked = checked ? checked : !data.checked;
    });
    mergeDownButton();
});
// unfoldAll展开全部  unfoldPlay展开可播放 unfoldFilter展开选中的 fold关闭展开
$('#unfoldAll, #unfoldPlay, #unfoldFilter, #fold').click(function () {
    $("#features").hide();
    if (this.id == "unfoldAll") {
        getData().forEach(function (data) {
            if (data.html.is(":hidden")) { return true; }
            !data.urlPanelShow && data.panelHeading.click();
        });
    } else if (this.id == "unfoldPlay") {
        getData().forEach(function (data) {
            if (data.html.is(":hidden")) { return true; }
            data.isPlay && !data.urlPanelShow && data.panelHeading.click();
        });
    } else if (this.id == "unfoldFilter") {
        getData().forEach(function (data) {
            if (data.html.is(":hidden")) { return true; }
            data.checked && !data.urlPanelShow && data.panelHeading.click();
        });
    } else if (this.id == "fold") {
        getData().forEach(function (data) {
            if (data.html.is(":hidden")) { return true; }
            data.urlPanelShow && data.panelHeading.click();
        });
    }
});
// 捕捉/录制 展开按钮 筛选按钮 按钮
// $('#Catch, #openUnfold, #openFilter, #more').click(function () {
$('#openFilter, #more').click(function () {
    // const _height = parseInt($(".container").css("margin-bottom"));
    // $(".container").css("margin-bottom", ($down[0].offsetHeight + 26) + "px");
    const $panel = $(`#${this.getAttribute("panel")}`);
    $panel.css("bottom", $down[0].offsetHeight + "px");
    $(".more").not($panel).hide();
    if ($panel.is(":hidden")) {
        $panel.css("display", "flex");
        return;
    }
    // $(".container").css("margin-bottom", _height);
    $panel.hide();
});

// 正则筛选
$("#regular input").bind('keypress', function (event) {
    if (event.keyCode == "13") {
        const input = $(this).val();
        if (input == "") {
            getData().forEach(function (data) {
                data.checked = true;
                data.html.show();
            });
            return;
        }
        const regex = new RegExp($(this).val());
        getData().forEach(function (data) {
            if (!regex.test(data.url)) {
                data.checked = false;
                data.html.hide();
            }
        });
        $("#filter").hide();
    }
});

// 清空数据
$('#Clear').click(function () {
    chrome.runtime.sendMessage({ Message: "clearData", tabId: G.tabId, type: activeTab });
    chrome.runtime.sendMessage({ Message: "ClearIcon", type: activeTab, tabId: G.tabId });
    if (activeTab) {
        currentCount = 0;
        $current.empty();
    } else {
        allCount = 0;
        $all.empty();
    }
    allData.get(activeTab).clear();
    UItoggle();
});
// 模拟手机端
$("#MobileUserAgent").click(function () {
    chrome.runtime.sendMessage({ Message: "mobileUserAgent", tabId: G.tabId }, function () {
        G.refreshClear && $('#Clear').click();
        updateButton();
    });
});
// 自动下载
$("#AutoDown").click(function () {
    chrome.runtime.sendMessage({ Message: "autoDown", tabId: G.tabId }, function () {
        updateButton();
    });
});
// 深度搜索 缓存捕捉 注入脚本
$("[type='script']").click(function () {
    chrome.runtime.sendMessage({ Message: "script", tabId: G.tabId, script: this.id + ".js" }, function () {
        G.autoClearMode > 0 && $('#Clear').click();
        updateButton();
    });
});
// 102以上开启 捕获按钮/注入脚本
if (G.version >= 102) {
    $("[type='script']").show();
}
// Firefox 关闭一些功能 修复右边滚动条遮挡
if (G.isFirefox) {
    $("body").addClass("fixFirefoxRight");
    $(".firefoxHide").each(function () { $(this).hide(); });
    if (G.version < 128) {
        $(".firefoxHideScript").each(function () { $(this).hide(); });
    }
}
// 跳转页面
$("[go]").click(function () {
    let url = this.getAttribute("go");
    if (url == "ffmpegURL") {
        chrome.tabs.create({ url: G.ffmpegConfig.url })
        return;
    }
    chrome.tabs.create({ url: url });
});
// 暂停 启用
$("#enable").click(function () {
    chrome.runtime.sendMessage({ Message: "enable" }, function (state) {
        $("#enable").html(state ? i18n.pause : i18n.enable);
    });
});
// 弹出窗口
$("#popup").click(function () {
    switch (G.popupMode) {
        case 0:
            chrome.tabs.create({ url: `preview.html?tabId=${G.tabId}` });
            break;
        case 1:
            chrome.tabs.create({ url: `popup.html?tabId=${G.tabId}&type=tab` });
            break;
        case 2:
            chrome.windows.create({ url: `preview.html?tabId=${G.tabId}`, type: "popup", height: 1080, width: 1920 });
            break;
        case 3:
            chrome.windows.create({ url: `popup.html?tabId=${G.tabId}&type=window`, type: "popup", height: 1080, width: 1920 });
            break;
        default:
            chrome.tabs.create({ url: `preview.html?tabId=${G.tabId}` });
            break;
    }
});
$("#currentPage").click(function () {
    chrome.tabs.query({ active: true, currentWindow: false }, function (tabs) {
        chrome.tabs.update({ url: `popup.html?tabId=${tabs[0].id}${_type ? "&type=" + _type : ""}` });
    });
});

// 手动发送
$("#send2localSelect").click(function () {
    getData().forEach(function (item) {
        if (item.checked) {
            send2local("catch", item, item.tabId).then(function (success) {
                success && success?.ok && Tips(i18n.hasSent, 1000);
            }).catch(function (error) {
                error ? Tips(error, 1000) : Tips(i18n.sendFailed, 1000);
            });
        }
    });
});

// 一些需要等待G变量加载完整的操作
const interval = setInterval(function () {
    if (!G.initSyncComplete || !G.initLocalComplete || !G.tabId) { return; }
    clearInterval(interval);

    if (G.popup && !_tabId) {
        closeTab();
        $("#popup").click();
        return;
    }
    // 侧边面板模式 body 宽度100%
    if (_tabId) {
        G.tabId = _tabId;
        $("body").css("width", "100%");
        $("#down").css("justify-content", "center").find("button").css("margin-left", "5px");
        $("#popup").hide();
        _type == "window" && $("#currentPage").show();
    }

    // 获取页面DOM
    chrome.tabs.sendMessage(G.tabId, { Message: "getPage" }, { frameId: 0 }, function (result) {
        if (chrome.runtime.lastError) { return; }
        pageDOM = new DOMParser().parseFromString(result, 'text/html');
    });
    // 填充数据
    chrome.runtime.sendMessage(chrome.runtime.id, { Message: "getData", tabId: G.tabId }, function (data) {
        if (!data || data === "OK") {
            $tips.html(i18n.noData);
            $tips.attr("data-i18n", "noData");
            return;
        }
        currentCount = data.length;
        if (currentCount >= 500 && confirm(i18n("confirmLoading", [currentCount]))) {
            $mediaList.append($current);
            UItoggle();
            return;
        }
        for (let key = 0; key < currentCount; key++) {
            $current.append(AddMedia(data[key]));
        }
        $mediaList.append($current);
        UItoggle();
    });
    // 监听资源数据
    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (!Message.Message || !Message.data) { return; }
        // 添加资源
        if (Message.Message == "popupAddData") {
            const html = AddMedia(Message.data, Message.data.tabId == G.tabId);
            if (Message.data.tabId == G.tabId) {
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
            return true;
        }
        // 添加疑似密钥
        if (Message.Message == "popupAddKey") {
            $("#maybeKeyTab").show();
            chrome.tabs.query({}, function (tabs) {
                let tabId = -1;
                for (let item of tabs) {
                    if (item.url == Message.url) {
                        tabId = item.id;
                        break;
                    }
                }
                if (tabId == -1 || tabId == G.tabId) {
                    $maybeKey.append(AddKey(Message.data));
                }
                !$("#maybeKey .panel").length && $("#maybeKey").append($maybeKey);
            });
            sendResponse("OK");
            return true;
        }
    });
    // 获取模拟手机 自动下载 捕获 状态
    updateButton();

    // 上一次设定的倍数
    $("#playbackRate").val(G.playbackRate);

    loadCSS();

    const observer = new MutationObserver(updateDownHeight);
    observer.observe($down[0], { childList: true, subtree: true, attributes: true });
    setInterval(() => { updateDownHeight(); }, 233);
    // 疑似密钥
    chrome.webNavigation.getAllFrames({ tabId: G.tabId }, function (frames) {
        if (!frames) { return; }
        for (let frame of frames) {
            chrome.tabs.sendMessage(G.tabId, { Message: "getKey" }, { frameId: frame.frameId }, function (result) {
                if (chrome.runtime.lastError || !result || result.length == 0) { return; }
                $("#maybeKeyTab").show();
                for (let key of result) {
                    $maybeKey.append(AddKey(key));
                }
                $("#maybeKey").append($maybeKey);
                UItoggle();
            });
        }
    });
}, 0);
/********************绑定事件END********************/
window.addEventListener('beforeunload', function () {
    chrome.runtime.sendMessage(chrome.runtime.id, { Message: "clearRedundant" });
});

// 按钮状态更新
function updateButton() {
    chrome.runtime.sendMessage({ Message: "getButtonState", tabId: G.tabId }, function (state) {
        for (let key in state) {
            const $DOM = $(`#${key}`);
            if (key == "MobileUserAgent") {
                $DOM.html(state.MobileUserAgent ? i18n.closeSimulation : i18n.simulateMobile);
                continue;
            }
            if (key == "AutoDown") {
                $DOM.html(state.AutoDown ? i18n.closeDownload : i18n.autoDownload);
                continue;
            }
            if (key == "enable") {
                $DOM.html(state.enable ? i18n.pause : i18n.enable);
                continue;
            }
            const script = G.scriptList.get(key + ".js");
            $DOM.html(state[key] ? script.off : script.name);
        }
    });
}
/* 格式判断 */
function isPlay(data) {
    if (G.Player && !isJSON(data) && !isPicture(data)) { return true; }
    const typeArray = ['video/ogg', 'video/mp4', 'video/webm', 'audio/ogg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'video/3gp', 'video/mpeg', 'video/mov'];
    return isMediaExt(data.ext) || typeArray.includes(data.type) || isM3U8(data);
}

// 猫抓下载器
let catDownloadIsProcessing = false;
function catDownload(data, extra = {}) {
    // 防止连续多次提交
    if (catDownloadIsProcessing) {
        setTimeout(() => {
            catDownload(data, extra);
        }, 233);
        return;
    }
    catDownloadIsProcessing = true;
    if (!Array.isArray(data)) { data = [data]; }

    // 储存数据到临时变量 提高检索速度
    localStorage.setItem('downloadData', JSON.stringify(data));

    // 如果大于2G 询问是否使用流式下载
    if (!extra.ffmpeg && !G.downStream && Math.max(...data.map(item => item._size)) > G.chromeLimitSize && confirm(i18n("fileTooLargeStream", ["2G"]))) {
        extra.downStream = 1;
    }
    // 发送消息给下载器
    chrome.runtime.sendMessage(chrome.runtime.id, { Message: "catDownload", data: data }, (message) => {
        // 不存在下载器或者下载器出错 新建一个下载器
        if (chrome.runtime.lastError || !message || message.message != "OK") {
            createCatDownload(data, extra);
            return;
        }
        catDownloadIsProcessing = false;
    });
}
function createCatDownload(data, extra) {
    chrome.tabs.get(G.tabId, function (tab) {
        const arg = {
            url: `/downloader.html?${new URLSearchParams({
                requestId: data.map(item => item.requestId).join(","),
                ...extra
            })}`,
            index: tab.index + 1,
            active: !G.downActive
        };
        chrome.tabs.create(arg, (tab) => {
            // 循环获取tab.id 的状态 准备就绪 重置任务状态
            const interval = setInterval(() => {
                chrome.tabs.get(tab.id, (tab) => {
                    if (chrome.runtime.lastError || tab.status == "complete") {
                        clearInterval(interval);
                        catDownloadIsProcessing = false;
                    }
                });
            });
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
    const size = getData().size;
    size > 0 ? $tips.hide() : $tips.show().html(i18n.noData);
    $currentCount.text(currentCount ? `[${currentCount}]` : "");
    $allCount.text(allCount ? `[${allCount}]` : "");
    const id = $('.TabShow').attr("id");
    if (id != "mediaList" && id != "allMediaList") {
        $tips.hide();
        $down.hide();
    } else if ($down.is(":hidden")) {
        $down.show();
    }
    // 更新图标
    $(".faviconFlag").each(function () {
        const data = getData(this.getAttribute("requestId"));
        if (data && data.webUrl && favicon.has(data.webUrl)) {
            this.setAttribute("src", favicon.get(data.webUrl));
            this.classList.remove("faviconFlag");
        }
    });
    size >= 2 ? mergeDownButton() : $mergeDown.attr('disabled', true);
}
// 检查是否符合条件 更改 合并下载 按钮状态
function mergeDownButtonCheck(data) {
    if (!data.type) {
        return isMediaExt(data.ext);
    }
    return isMediaExt(data.ext) || data.type.startsWith("video") || data.type.startsWith("audio") || data.type.endsWith("octet-stream");
}
function mergeDownButton() {
    const [checkedData, maxSize] = getCheckedData();
    if (checkedData.length != 2 || (!G.isFirefox && maxSize > G.chromeLimitSize)) {
        // $mergeDown.hide();
        $mergeDown.attr('disabled', true);
        return;
    }
    if (checkedData.every(mergeDownButtonCheck) || checkedData.every(data => isM3U8(data))) {
        // $mergeDown.show();
        $mergeDown.removeAttr('disabled');
    }
}
// 获取当前标签 所有选择的文件
function getCheckedData() {
    const checkedData = [];
    let maxSize = 0;
    getData().forEach(function (data) {
        if (data.checked) {
            const size = data._size ?? 0;
            maxSize = size > maxSize ? size : maxSize;
            checkedData.push(data);
        }
    });
    return [checkedData, maxSize];
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

// 更新底部按钮高度
function updateDownHeight() {
    $(".container").css("margin-bottom", ($down[0].offsetHeight + 2) + "px");
}

function base64ToHex(base64) {
    let binaryString;
    try {
        binaryString = atob(base64);
    } catch (error) {
        console.error("Invalid Base64 string:", error, base64);
        return false;
    }
    let hexString = '';
    for (let i = 0; i < binaryString.length; i++) {
        let hex = binaryString.charCodeAt(i).toString(16);
        if (hex.length === 1) {
            hex = '0' + hex;
        }
        hexString += hex;
    }
    return hexString;
}