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
    $(`<style>${G.css}</style>`).appendTo("head");
    if (_url) {
        fetch(_url)
            .then(response => response.text())
            .then(function (text) {
                // mpdContent = text;
                // parseMPD(mpdContent);
                parseMPD(text);
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

// 加密类型
function getEncryptionType(schemeIdUri) {
    if (schemeIdUri.includes("edef8ba9-79d6-4ace-a3c8-27dcd51d21ed")) {
        return "Widevine";
    } else if (schemeIdUri.includes("9a04f079-9840-4286-ab92-e65be0885f95")) {
        return "Microsoft PlayReady";
    } else if (schemeIdUri.includes("94ce86fb-07ff-4f43-adb8-93d2fa968ca2")) {
        return "Apple FairPlay";
    } else {
        return "Unknown";
    }
}
// 判断DRM
function isDRM(mpdContent) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(mpdContent, "application/xml");
    let drmInfo = new Map();
    const contentProtections = xmlDoc.getElementsByTagName("ContentProtection");
    for (let i = 0; i < contentProtections.length; i++) {
        const protection = contentProtections[i];
        const schemeIdUri = protection.getAttribute("schemeIdUri");
        const pssh = protection.getElementsByTagName("cenc:pssh")[0];

        if (schemeIdUri && pssh) {
            if (!drmInfo.has(schemeIdUri)) {
                drmInfo.set(schemeIdUri, pssh.textContent);
            }
        }
    }
    return Array.from(drmInfo.entries()).map(([schemeIdUri, pssh]) => ({
        schemeIdUri,
        pssh,
        encryptionType: getEncryptionType(schemeIdUri)
    }));
}
function parseMPD(mpdContent) {
    $("#loading").hide(); $("#main").show();
    mpdJson = mpdParser.parse(mpdContent, { manifestUri: _url });

    const drmInfo = isDRM(mpdContent);
    if (drmInfo.length > 0) {
        $("#loading").show();
        $("#loading .optionBox").html(`<b>${i18n.DRMerror}</b><br><br>`);
        drmInfo.map(item => {
            $("#loading .optionBox").append(`<b>${item.encryptionType}</b><input value="${item.pssh}" style="width: 100%;"/>`);
        });
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
    $("#count").html(i18n("m3u8Info", [items.segments.length, secToTime(mpdJson.duration)]));
    items.segments.length > 0 && $("#tips").html('initialization: <input type="text" value="' + items.segments[0].map.resolvedUri + '" spellcheck="false" readonly="readonly" class="width100">');
    $("#info").html(getInfo(type));
}

function getInfo(type = "audio") {
    if (type == "audio") {
        return i18n.audio + ": " + $("#mpdAudioLists").find("option:selected").text();
    } else {
        return i18n.video + ": " + $("#mpdVideoLists").find("option:selected").text();
    }
}