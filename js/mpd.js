// url 参数解析
const params = new URL(location.href).searchParams;
const _url = params.get("url");
// const _referer = params.get("referer");
const _requestHeaders = params.get("requestHeaders");
const _title = params.get("title");

// 修改当前标签下的所有xhr的requestHeaders
let requestHeaders = JSONparse(_requestHeaders);
setRequestHeaders(requestHeaders, () => { awaitG(init); });

var mpdJson = {}; // 解析器json结果
var mpdXml = {}; // 解析器xml结果
var mpdContent; // mpd文件内容
var m3u8Content = "";   //m3u8内容
var mediaInfo = "" // 媒体文件信息

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message == "getM3u8") {
        sendResponse({ m3u8Content, mediaInfo });
    }
});

function init() {
    $(`<style>${G.css}</style>`).appendTo("head");
    if (_url) {
        fetch(_url)
            .then(response => response.text())
            .then(function (text) {
                mpdContent = text;
                parseMPD(mpdContent);
                $("#mpd_url").html(_url).attr("href", _url);
            });
    } else {
        $("#loading").hide();
        $("#mpdCustom").show();
        $("#parse").click(function () {
            let url = $("#mpdUrl").val().trim();;
            url = "mpd.html?url=" + encodeURIComponent(url);
            let referer = $("#referer").val().trim();;
            if (referer) { url += "&requestHeaders=" + JSON.stringify({ referer: referer }); }
            chrome.tabs.update({ url: url });
        });
    }

    $("#mpdVideoLists, #mpdAudioLists").change(function () {
        let type = this.id == "mpdVideoLists" ? "video" : "audio";
        showSegment(type, $(this).val());
    });
    $("#getVideo, #getAudio").click(function () {
        let type = "video";
        let index = $("#mpdVideoLists").val();
        if (this.id == "getAudio") {
            type = "audio";
            index = $("#mpdAudioLists").val();
        }
        showSegment(type, index);
    });
    $("#videoToM3u8, #audioToM3u8").click(function () {
        let index = $("#mpdVideoLists").val();
        let items = mpdJson.playlists[index];
        let type = "video";
        if (this.id == "audioToM3u8") {
            index = $("#mpdAudioLists").val();
            let temp = index.split("$-bmmmd-$");
            index = temp[0];
            let index2 = temp[1];
            items = mpdJson.mediaGroups.AUDIO.audio[index].playlists[index2];
            type = "audio";
        }
        mediaInfo = getInfo(type);
        m3u8Content = "#EXTM3U\n";
        m3u8Content += "#EXT-X-VERSION:3\n";
        m3u8Content += "#EXT-X-TARGETDURATION:" + items.targetDuration + "\n";
        m3u8Content += "#EXT-X-MEDIA-SEQUENCE:0\n";
        m3u8Content += "#EXT-X-PLAYLIST-TYPE:VOD\n";
        m3u8Content += '#EXT-X-MAP:URI="' + items.segments[0].map.resolvedUri + '"\n';
        for (let key in items.segments) {
            m3u8Content += "#EXTINF:" + items.segments[key].duration + ",\n"
            m3u8Content += items.segments[key].resolvedUri + "\n";
        }
        m3u8Content += "#EXT-X-ENDLIST";
        // $("#media_file").html(m3u8Content); return;
        chrome.tabs.getCurrent(function (tabs) {
            chrome.tabs.create({ url: "m3u8.html?getId=" + tabs.id });
        });
    });
}

function parseMPD() {
    $("#loading").hide(); $("#main").show();
    mpdJson = mpdParser.parse(mpdContent, { manifestUri: _url });
    mpdXml = $(mpdContent);
    console.log(mpdJson);
    if (mpdXml.find("contentprotection").length > 0) {
        $("#loading").show();
        $("#loading .optionBox").html("媒体有DRM保护, 可能无法下载和播放. 暂无加密分析以及解密功能, 请复制mpd文件地址, 使用第三方工具下载.");
    }
    for (let key in mpdJson.playlists) {
        $("#mpdVideoLists").append(`<option value='${key}'>${mpdJson.playlists[key].attributes.NAME
            } | ${(mpdJson.playlists[key].attributes.BANDWIDTH / 1024).toFixed(1)
            } kbps |  ${mpdJson.playlists[key].attributes["FRAME-RATE"].toFixed(1)
            } fps |  ${mpdJson.playlists[key].attributes.RESOLUTION.width
            } x ${mpdJson.playlists[key].attributes.RESOLUTION.height
            }</option>`);
    }
    for (let key in mpdJson.mediaGroups.AUDIO.audio) {
        for (let index in mpdJson.mediaGroups.AUDIO.audio[key].playlists) {
            let item = mpdJson.mediaGroups.AUDIO.audio[key].playlists[index];
            // console.log(item);
            $("#mpdAudioLists").append(`<option value='${key}$-bmmmd-$${index}'>${key} | ${item.attributes.NAME} | ${item.attributes.BANDWIDTH / 1000}Kbps</option>`);
        }
    }
    $("#info").html(getInfo("video"));
    showSegment("video", 0);
}

function showSegment(type, index) {
    let textarea = "";
    let items;
    if (type == "video") {
        items = mpdJson.playlists[index];
    } else {
        let temp = index.split("$-bmmmd-$");
        index = temp[0];
        let index2 = temp[1];
        items = mpdJson.mediaGroups.AUDIO.audio[index].playlists[index2];
    }
    for (let key in items.segments) {
        textarea += items.segments[key].resolvedUri + "\n\n";
    }
    $("#media_file").html(textarea);
    $("#count").html("共 " + items.segments.length + " 个文件" + "，总时长: " + secToTime(mpdJson.duration));
    items.segments.length > 0 && $("#tips").html('initialization: <input type="text" value="' + items.segments[0].map.resolvedUri + '" spellcheck="false" readonly="readonly" class="width100">');
    $("#info").html(getInfo(type));
}

function getInfo(type = "audio") {
    if (type == "audio") {
        return "音频: " + $("#mpdAudioLists").find("option:selected").text();
    } else {
        return "视频: " + $("#mpdVideoLists").find("option:selected").text();
    }
}