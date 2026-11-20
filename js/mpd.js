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
// var mpdContent; // mpd文件内容
var m3u8Content = "";   //m3u8内容
var mediaInfo = "" // 媒体文件信息

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message == "getM3u8") {
        sendResponse({ m3u8Content, mediaInfo });
    }
});

function init() {
    loadCSS();
    if (_url) {
        fetch(_url)
            .then(response => response.text())
            .then(function (text) {
                // mpdContent = text;
                // parseMPD(mpdContent);
                parseMPD(text);
                $("#mpd_url").text(_url).attr("href", _url);
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
            chrome.tabs.create({ url: "m3u8.html?getMpdId=" + tabs.id });
        });
    });
}

/**
 * 判断DRM 有 cenc (urn:mpeg:dash:mp4protection:2011) 或 DRM 系统 (urn:uuid:SystemID) 的 ContentProtection
 * 清单里不一定带 pssh 不能用它判断
 * @param {String} mpdContent mpd文件内容
 * @returns {Array|Boolean} DRM 名称 (不知道是哪种时为空数组) 没有 DRM 返回 false
 */
function isDRM(mpdContent) {
    const xmlDoc = new DOMParser().parseFromString(mpdContent, "application/xml");
    let names = false;
    for (const protection of xmlDoc.getElementsByTagName("ContentProtection")) {
        const schemeIdUri = (protection.getAttribute("schemeIdUri") ?? "").toLowerCase();
        if (schemeIdUri != "urn:mpeg:dash:mp4protection:2011" && !schemeIdUri.startsWith("urn:uuid:")) { continue; }
        names = names || new Set();
        const name = getDrmName(schemeIdUri);
        name && names.add(name);
    }
    return names && [...names];
}
function parseMPD(mpdContent) {
    $("#loading").hide(); $("#main").show();
    mpdJson = mpdParser.parse(mpdContent, { manifestUri: _url });

    const drmInfo = isDRM(mpdContent);
    // 受 DRM 保护 不能下载 只显示提示
    if (drmInfo) {
        $("#main").hide();
        $("#loading").show();
        $("#loading .optionBox").html(`<b>${drmText(drmInfo)}</b>`);
        return;
    }

    for (let key in mpdJson.playlists) {
        // 名字来自清单 按文字写入 帧率和分辨率清单里可以不写
        $("#mpdVideoLists").append($("<option>").val(key).text(`${mpdJson.playlists[key].attributes.NAME
            } | ${(mpdJson.playlists[key].attributes.BANDWIDTH / 1024).toFixed(1)
            } kbps |  ${mpdJson.playlists[key].attributes["FRAME-RATE"]?.toFixed(1) ?? "-"
            } fps |  ${mpdJson.playlists[key].attributes.RESOLUTION?.width ?? "-"
            } x ${mpdJson.playlists[key].attributes.RESOLUTION?.height ?? "-"
            }`));
    }
    for (let key in mpdJson.mediaGroups.AUDIO.audio) {
        for (let index in mpdJson.mediaGroups.AUDIO.audio[key].playlists) {
            let item = mpdJson.mediaGroups.AUDIO.audio[key].playlists[index];
            // console.log(item);
            $("#mpdAudioLists").append($("<option>").val(`${key}$-bmmmd-$${index}`).text(`${key} | ${item.attributes.NAME} | ${item.attributes.BANDWIDTH / 1000}Kbps`));
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
    $("#count").html(i18n("m3u8Info", [items.segments.length, secToTime(mpdJson.duration)]));
    items.segments.length > 0 && $("#tips").html('initialization: <input type="text" value="' + items.segments[0].map.resolvedUri + '" spellcheck="false" readonly="readonly" class="width100">');
    $("#info").html(getInfo(type));
}

function getInfo(type = "audio") {
    // 返回值会被当成 HTML 显示 (本页和 m3u8 解析器) 选项的文字来自清单 需要转义
    const text = type == "audio" ? i18n.audio + ": " + $("#mpdAudioLists").find("option:selected").text() : i18n.video + ": " + $("#mpdVideoLists").find("option:selected").text();
    return escapeHtml(text);
}