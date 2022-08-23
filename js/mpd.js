// url 参数解析
const params = new URL(location.href).searchParams;
var _url = params.get("url");
const _referer = params.get("referer");
const _title = params.get("title");

var mpdJson = {}; // 解析器json结果
var mpdContent; // mpd文件内容
var m3u8Content = "";
var currentTabId;

$(function () {
    // 如果存在Referer修改当前标签下的所有xhr的Referer
    chrome.tabs.getCurrent(function (tabs) {
        currentTabId = tabs.id;
        if (_referer && !isEmpty(_referer)) {
            chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [tabs.id],
                addRules: [{
                    "id": tabs.id,
                    "action": {
                        "type": "modifyHeaders",
                        "requestHeaders": [{
                            "header": "Referer",
                            "operation": "set",
                            "value": _referer
                        }]
                    },
                    "condition": {
                        "tabIds": [tabs.id],
                        "resourceTypes": ["xmlhttprequest"]
                    }
                }]
            });
        }
        fetch(_url)
            .then(response => response.text())
            .then(function (text) {
                mpdContent = text;
                parseMPD(mpdContent);
                $("#mpd_url").html(_url).attr("href", _url);
            });
    });
    $("#mpdLists, #mpdAudioLists").change(function () {
        let type = this.id == "mpdLists" ? "video" : "audio";
        showSegment(type, $(this).val());
    });
    $("#getVideo, #getAudio").click(function () {
        let type = "video";
        let index = $("#mpdLists").val();
        if (this.id == "getAudio") {
            type = "audio";
            index = $("#mpdAudioLists").val();
        }
        showSegment(type, index);
    });
    $("#videoToM3u8, #audioToM3u8").click(function () {
        let index = $("#mpdLists").val();
        let items = mpdJson.playlists[index];
        if (this.id == "audioToM3u8") {
            index = $("#mpdAudioLists").val();
            items = mpdJson.mediaGroups.AUDIO.audio[index].playlists[0];
        }
        m3u8Content = "#EXTM3U\n";
        m3u8Content += "#EXT-X-VERSION:3\n";
        m3u8Content += "#EXT-X-TARGETDURATION:" + items.targetDuration + "\n";
        m3u8Content += "#EXT-X-MEDIA-SEQUENCE:0\n";
        m3u8Content += "#EXT-X-PLAYLIST-TYPE:VOD\n";
        m3u8Content += '#EXT-X-MAP:URI="' + items.segments[0].map.resolvedUri + '"\n';
        for (let item of items.segments) {
            m3u8Content += "#EXTINF:" + item.duration + ",\n"
            m3u8Content += item.resolvedUri + "\n";
        }
        m3u8Content += "#EXT-X-ENDLIST";
        // $("#media_file").html(m3u8Content); return;
        chrome.tabs.create({ url: "m3u8.html?getId=" + currentTabId }, function (tab) {
            chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
                if (message == "getM3u8") {
                    sendResponse(m3u8Content);
                }
            });
        });
    });
});

function parseMPD() {
    $("#loading").hide(); $("#main").show();
    mpdJson = mpdParser.parse(mpdContent, { manifestUri: _url });
    // console.log(mpdJson);
    for (let key in mpdJson.playlists) {
        $("#mpdLists").append(`<option value='${key}'>
            ${(mpdJson.playlists[key].attributes.BANDWIDTH / 1024).toFixed(1)} kbps | 
            ${mpdJson.playlists[key].attributes["FRAME-RATE"].toFixed(1)} fps | 
            ${mpdJson.playlists[key].attributes.RESOLUTION.width} x ${mpdJson.playlists[key].attributes.RESOLUTION.height}
        </option>`);
    }
    for (let key in mpdJson.mediaGroups.AUDIO.audio) {
        $("#mpdAudioLists").append(`<option value='${key}'>${key}</option>`);
    }
    showSegment("video", 0);
}

function showSegment(type, index) {
    let textarea = "";
    let items = type == "video" ? mpdJson.playlists[index] : mpdJson.mediaGroups.AUDIO.audio[index].playlists[0];
    for (let segment of items.segments) {
        textarea += segment.resolvedUri + "\n";
    }
    $("#media_file").html(textarea);
    $("#count").html("共 " + items.segments.length + " 个文件" + "，总时长: " + secToTime(mpdJson.duration));
    $("#tips").html('initialization: <input type="text" value="' + items.segments[0].map.resolvedUri + '" spellcheck="false" readonly="readonly">');
}