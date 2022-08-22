// url 参数解析
const params = new URL(location.href).searchParams;
var _url = params.get("url");
const _referer = params.get("referer");
const _title = params.get("title");

var _mpdJson = {}; // 解析器json结果
var currentIndex = 0;   //当前选择的视频
var _fragments = []; // 储存切片对象
const initData = new Map(); // 储存map的url
const saveBuffer = [];

$(function () {
    // 如果存在Referer修改当前标签下的所有xhr的Referer
    chrome.tabs.getCurrent(function (tabs) {
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
                parseMPD(text);
                $("#mpd_url").html(_url).attr("href", _url);
            });
    });

    $("#mpdLists").change(function () {
        currentIndex = $(this).val();
        showSegment();
    });

    $("#mergeDown").click(function () {
        downSegments();
    });
});

function downinitData() {
    for (let item of _mpdJson.playlists) {
        let mapUrl = item.segments[0].map.resolvedUri;
        $.ajax({
            url: mapUrl,
            xhrFields: { responseType: "arraybuffer" },
            timeout: 30000
        }).done(function (responseData) {
            initData.set(mapUrl, responseData);
        });
    }
}

function parseMPD(text) {
    $("#loading").hide(); $("#main").show();
    _mpdJson = mpdParser.parse(text, { manifestUri: _url });
    downinitData();
    // console.log(_mpdJson);
    for (let key in _mpdJson.playlists) {
        $("#mpdLists").append(`<option value='${key}'>
            ${(_mpdJson.playlists[key].attributes.BANDWIDTH / 1024).toFixed(1)} kbps | 
            ${_mpdJson.playlists[key].attributes["FRAME-RATE"].toFixed(1)} fps | 
            ${_mpdJson.playlists[key].attributes.RESOLUTION.height} x ${_mpdJson.playlists[key].attributes.RESOLUTION.width}
        </option>`);
    }
    showSegment();
}
function showSegment() {
    let textarea = "";
    for (let segment of _mpdJson.playlists[currentIndex].segments) {
        textarea += segment.resolvedUri + "\n";
    }
    $("#media_file").html(textarea);
    $("#count").html("共 " + _mpdJson.playlists[currentIndex].segments.length + " 个文件" + "，总时长: " + secToTime(_mpdJson.duration));
    $("#tips").html('initialization: <input type="text" value="' + _mpdJson.playlists[currentIndex].segments[0].map.resolvedUri + '" spellcheck="false" readonly="readonly">');
}

function downSegments() {
    downCurrentTs = 0;  // 当前进度
    _fragments = _mpdJson.playlists[currentIndex].segments;
    const _tsThread = parseInt($("#thread").val());  // 原始线程数量
    let tsThread = _tsThread;  // 线程数量
    let end = _fragments.length - 1;
    let index = -1; // 当前下载的索引
    const tsInterval = setInterval(function () {
        if (index == end && tsThread == _tsThread) {
            clearInterval(tsInterval);
            downVideo();
            return;
        }
        if (tsThread > 0 && index < end) {
            tsThread--;
            let curIndex = ++index;   // 当前下载的索引
            $.ajax({
                url: _fragments[curIndex].resolvedUri,
                xhrFields: { responseType: "arraybuffer" },
                timeout: 30000
            }).done(function (responseData) {
                saveBuffer[curIndex] = fixFragments(responseData, curIndex);
            }).always(function () {
                $("#progress").html(`${downCurrentTs++}/${_mpdJson.playlists[currentIndex].segments.length}`); // 进度显示
                tsThread++;
            });
        }
    }, 10);
}

function downVideo() {
    $("#progress").html(`下载中...`);
    let fileBlob = new Blob(saveBuffer, { type: "video/MP4" });
    chrome.downloads.download({
        url: URL.createObjectURL(fileBlob),
        filename: `${GetFileName(_url)}.mp4`
    });
}

// 处理切片
function fixFragments(responseData, index) {
    if (index == 0) {
        let initSegmentData = initData.get(_fragments[index].map.resolvedUri);
        let initLength = initSegmentData.byteLength;
        let newData = new Uint8Array(initLength + responseData.byteLength);
        newData.set(new Uint8Array(initSegmentData), 0);
        newData.set(new Uint8Array(responseData), initLength);
        responseData = newData.buffer;
    }
    return responseData;
}

// 获取文件名
function GetFile(str) {
    str = str.split("?")[0];
    if (str.substr(0, 5) != "data:" && str.substr(0, 4) != "skd:") {
        return str.split("/").pop();
    }
    return str;
}
// 获得不带扩展的文件名
function GetFileName(url) {
    if (G.TitleName && _title) {
        return _title;
    }
    url = GetFile(url);
    url = url.split(".");
    url.length > 1 && url.pop();
    return url.join(".");
}