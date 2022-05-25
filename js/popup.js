//填充数据
chrome.storage.local.get({ "MediaData": {} }, function (items) {
    if (items.MediaData === undefined) { return; }
    if (items.MediaData[G.tabIdStr] !== undefined) {
        for (let item of items.MediaData[G.tabIdStr]) {
            AddMedia(item);
        }
    }
    if (items.MediaData["tabId-1"] !== undefined) {
        for (let item of items.MediaData["tabId-1"]) {
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


function AddMedia(data) {
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
    let DownFileName = data.name;
    if (G.Options.TitleName) {
        DownFileName = data.ext ? data.title + '.' + data.ext : data.title;
    }

    //添加html
    /*
        <div class="panel panel-default">
            <div class="panel-heading">
                <span></span>
                <input type="checkbox" class="DownCheck hide" checked="true"/>
                <img src="img/parsing.png" class="ico" id="m3u8" title="解析"/>
                <img src="img/download.png" class="ico" id="download" title="下载"/>
                <img src="img/play.png" class="ico" id="play" title="预览"/>
                <img src="img/copy.png" class="ico" id="copy" title="复制地址"/>
                <span class="size"></span>
                <img src="${data.webInfo.favIconUrl}" class="webIco"/>
            </div>
            <div class="url hide">标题: ...<br> MIME: ...<br><div id="duration"></div>
                <a href="" target="_blank" download=""></a>
            </div>
            <video class="getMediaInfo hide"></video>
        </div>
    */
    let html = `
        <div class="panel">
            <div class="panel-heading">
                <span>${trimName}</span>
                <img src="img/parsing.png" class="ico ${isM3U8(data) ? "" : "hide"}" id="m3u8" title="解析"/>
                <input type="checkbox" class="DownCheck" checked="true"/>
                <img src="img/download.png" class="ico" id="download" title="下载"/>
                <img src="img/${G.Options.Potplayer ? "potplayer.png" : "play.png"}" class="ico ${isPlay(data) ? "" : "hide"}" id="play" title="预览"/>
                <img src="img/copy.png" class="ico" id="copy" title="复制地址"/>
                ${data.size != 0 ? `<span class="size">${data.size}MB</span>` : ""}
                ${data.webInfo?.favIconUrl && false ? `<img src="${data.webInfo.favIconUrl}" class="webIco"/>` : ""}
            </div>
            <div class="url hide">
                ${data.webInfo ? `标题: ${data.webInfo.title}<br>` : ""}
                MIME: ${data.type} <br>
                <div id="duration"></div>
                <a href="${data.url}" target="_blank" download="${DownFileName}">${data.url}</a>
            </div>
            <video class="getMediaInfo hide"></video>
        </div>`;

    ////////////////////////绑定事件////////////////////////
    html = $(html);
    //展开网址
    html.find('.panel-heading').click(function () {
        html.find(".url").toggle();
        //获取时长
        let getMediaInfo = html.find(".getMediaInfo");
        let durationNode = html.find("#duration");
        if (html.find(".url").is(":visible") && durationNode.html() == "") {
            getMediaInfo.attr('src', data.url);
            getMediaInfo[0].ondurationchange = function () {
                let duration = getMediaInfo[0].duration;
                if (duration) {
                    let h = Math.floor(duration / 3600 % 24);
                    let m = Math.floor(duration / 60 % 60);
                    let s = Math.floor((duration % 60));
                    durationNode.html("时长: " + String(h).padStart(2, 0) + ":" + String(m).padStart(2, 0) + ":" + String(s).padStart(2, 0));
                }
                getMediaInfo.removeAttr('src');
            }
        } else {
            getMediaInfo.removeAttr('src');
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
        chrome.downloads.download({
            url: data.url,
            filename: DownFileName
        });
        return false;
    });
    //播放
    html.find('#play').click(function () {
        if (G.Options.Potplayer) {
            window.open('potplayer://' + data.url);
        } else {
            $('video').attr('src', data.url);
            $('#player').show();
            $('#player').appendTo(html);
        }
        return false;
    });
    //解析m3u8
    html.find('#m3u8').click(function () {
        chrome.tabs.create({ url: '/m3u8.html?m3u8_url=' + data.url });
        return false;
    });
    //多选框
    html.find('input').click(function () {
        //防止绑定事件重叠
        html.find(".url").toggle();
        return true;
    });
    //添加页面
    if (data.tabId === -1) {
        $('#otherMediaList').append(html);
    } else {
        $('#mediaList').append(html);
    }
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
        let FileNum = $('.TabShow :checked').size();
        if (FileNum >= 10 && !confirm("共 " + FileNum + "个文件，是否确认下载?")) {
            return;
        }
        $('.TabShow :checked').each(function () {
            $(this).siblings('#download').click();
        });
    });
    //复制选中文件
    $('#AllCopy').click(function () {
        let count = $('.TabShow :checked').size();
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
        let tab = $("#mediaList").is(":visible") ? G.tabId : "-1";
        chrome.storage.local.get({ "MediaData": {} }, function (items) {
            delete items.MediaData["tabId" + tab];
            chrome.storage.local.set({ MediaData: items.MediaData });
        });
        chrome.runtime.sendMessage({ Message: "ClearIcon", tab: tab });
        location.reload();
    });
    //预览播放关闭按钮
    $('#CloseBtn').click(function () {
        $('video').removeAttr('src');
        $("#player").hide();
        $("#player").appendTo('body');
        return false;
    });
});

//html5播放器允许格式
function isPlay(data) {
    if (G.Options.Potplayer) { return true }
    let arr = ['ogg', 'ogv', 'mp4', 'webm', 'mp3', 'wav', 'flv', 'm4a'];
    if (arr.indexOf(data.ext) > -1) {
        return true;
    }
    return false;
}
function isM3U8(data) {
    if (data.ext == "m3u8" || data.type == "application/vnd.apple.mpegurl" || data.type == "application/x-mpegurl") {
        return true;
    }
    return false;
}

//取消提示 3个以上显示操作按钮
function UItoggle() {
    let length = $('.TabShow #download').length;
    if (length > 0) {
        $('#Tips').hide();
    } else {
        $('#Tips').show();
    }
    if (length >= 30) {
        $('#ToBottom').show();
    } else {
        $('#ToBottom').hide();
    }
    length = $('#mediaList .panel').length;
    $("#mediaQuantity").text(length);
    length = $('#otherMediaList .panel').length;
    $("#otherQuantity").text(length);
}

function Tips(text) {
    let Original = $('#Tips').html();
    $('#Tips').css("position", "fixed");
    $('#Tips').html(text).fadeIn(500).delay(200).fadeOut(500, function () {
        $(this).css("position", "static");
        $('#Tips').html(Original);
    });
}