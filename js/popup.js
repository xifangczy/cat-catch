chrome.storage.local.get("MediaData", function (items) {
    if (items.MediaData === undefined) { return; }
    for (var i = 0; i < items.MediaData.length; i++) {
        AddMedia(items.MediaData[i]);
    };
    UItoggle();
});

//监听数据
chrome.runtime.onMessage.addListener(function (MediaData, sender, sendResponse) {
    AddMedia(MediaData);
    UItoggle();
});

function AddMedia(data) {
    //文件名是否为空
    if (data.name === undefined || data.name == '') {
        data.name = data.title + '.' + data.ext;
    }

    //截取文件名长度
    trimName = data.name;
    if (data.name.length >= 43) {
        trimName = data.name.replace(/\.[^.\/]+$/, "");
        trimName = trimName.substr(0, 13) + '...' + trimName.substr(-20) + '.' + data.ext;
    }

    //添加下载文件名
    DownFileName = data.name;
    if (Options.TitleName) {
        DownFileName = data.ext ? data.title + '.' + data.ext : data.title;
    }

    //添加html
    /*
        <div class="panel panel-default">
            <div class="panel-heading">
                <span></span>
                <input type="checkbox" class="DownCheck" checked="true"/>
                <img src="img/download.png" class="ico" id="download" />
                <img src="img/play.png" class="ico" id="play" />
                <img src="img/copy.png" class="ico" id="copy" />
                <span class="size">
                </span>
            </div>
            <div class="url">来自: ...<br> URL: ...<br>
                <a href="" target="_blank" download=""></a>
            </div>
        </div>
    */
    var html = '<div class="panel"><div class="panel-heading">';
    html += '<span>' + trimName + '</span>';
    if (data.ext == 'm3u8') {
        html += '<img src="img/parsing.png" class="ico" id="m3u8">';
    }
    html += '<input type="checkbox" class="DownCheck" checked="true"/>';
    html += '<img src="img/download.png" class="ico" id="download">';
    if (isPlay(data.ext) || Options.Potplayer) {
        html += '<img src="img/play.png" class="ico" id="play">';
    }
    html += '<img src="img/copy.png" class="ico" id="copy">';
    if (data.type != 'application/octet-stream' || data.size != 0) {
        html += '<span class="size">' + data.size + 'MB</span>';
    }
    html += '</div><div class="url">';
    if (data.webInfo) {
        html += '来自: ' + data.webInfo.title + '<br>URL: ' + data.webInfo.url + '<br>';
    }
    html += '<a href="' + data.url + '" target="_blank" download="' + DownFileName + '">' + data.url + '</a></div>';
    html += '</div>';

    ////////////////////////绑定事件////////////////////////
    html = $(html);
    html.click(function () {
        $(this).find(".url").toggle();
    });
    //点击复制网址
    html.find('#copy').click(function () {
        navigator.clipboard.writeText(data.url);
        $("#tempntc").html("已复制到剪贴板").fadeIn(500).delay(500).fadeOut(500);
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
        if (Options.Potplayer) {
            // chrome.tabs.create({url: 'potplayer://' + url});
            window.location.href = 'potplayer://' + data.url;
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
    $('#medialist').append(html);
}

$(function () {
    //下载选中文件
    $('#DownFile').click(function () {
        var FileNum = $(':checked').size();
        if (FileNum >= 10 && !confirm("共 " + FileNum + "个文件，是否确认下载?")) {
            return;
        }
        $(':checked').each(function () {
            $(this).siblings('#download').click();
        });
    });
    //复制选中文件
    $('#AllCopy').click(function () {
        var url = '';
        $(':checked').each(function () {
            url += $(this).parents('.panel').find('.url a').attr('href') + "\n";
        });
        navigator.clipboard.writeText(url);
        $('#tempntc').html('已复制到剪贴板').fadeIn(500).delay(500).fadeOut(500);
    });
    //全选
    $('#AllSelect').click(function () {
        $('#medialist input').each(function () {
            $(this).attr("checked", true);
        });
    });
    //反选
    $('#ReSelect').click(function () {
        $('#medialist input').each(function () {
            $(this).attr('checked', !$(this).prop('checked'));
        });
    });
    //清空
    $('#Clear').click(function () {
        chrome.storage.local.clear("MediaData");
        chrome.action.setBadgeText({ text: '' });
        chrome.action.setTitle({ title: "还没闻到味儿~" });
        location.reload();
    });
    //到页面底部
    $("#ToBottom").click(function () {
        $(document).scrollTop($(document).height());
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
function isPlay(ext) {
    var arr = ['ogg', 'ogv', 'mp4', 'webm', 'mp3', 'wav', 'flv', 'm4a'];
    if (arr.indexOf(ext) > -1) {
        return true;
    }
    return false;
}

//取消提示 3个以上显示操作按钮
function UItoggle() {
    var length = $('#medialist #download').length;
    if (length > 0) {
        $('#tempntc').hide();
    }
    if (length >= 3) {
        $('#down').show();
        $('.DownCheck').show();
    }
    if (length >= 20) {
        $('#ToBottom').show();
    }
}

