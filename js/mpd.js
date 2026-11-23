// url 参数解析
const params = new URL(location.href).searchParams;
const _url = params.get("url");
// const _referer = params.get("referer");
const _requestHeaders = params.get("requestHeaders");
const _title = params.get("title");
const _fileName = params.get("filename");

// 修改当前标签下的所有xhr的requestHeaders
let requestHeaders = JSONparse(_requestHeaders);
setRequestHeaders(requestHeaders, () => { awaitG(init); });

var mpdJson = {}; // 解析器json结果
var mpdXml = {}; // 解析器xml结果
// var mpdContent; // mpd文件内容
var m3u8Content = "";   //m3u8内容
var mediaInfo = "" // 媒体文件信息
const m3u8Data = {};    // 按 video / audio 储存转换好的 m3u8 供 m3u8 解析器读取
const segmentKeys = new Map();  // 分片整段加密的密钥信息 Representation id => { uri, iv }
const keyContent = new Map();   // 取到的密钥 密钥地址 => Promise

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message == "getM3u8") {
        sendResponse({ m3u8Content, mediaInfo });
    }
    // 指定读取视频或音频
    if (message?.Message == "getM3u8") {
        sendResponse(m3u8Data[message.type]);
    }
});

function init() {
    loadCSS();
    if (_url) {
        loadManifest(_url)
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
    $("#videoToM3u8, #audioToM3u8").click(async function () {
        const type = this.id == "audioToM3u8" ? "audio" : "video";
        await toM3u8(type);
        // $("#media_file").html(m3u8Content); return;
        chrome.tabs.getCurrent(function (tabs) {
            chrome.tabs.create({ url: getM3u8Url(tabs.id, type) });
        });
    });
    // 视频和音频一起下载 交给在线ffmpeg合并
    $("#mpdMerge button").click(async function () {
        await toM3u8("video");
        await toM3u8("audio");
        const options = { ffmpeg: "merge", quantity: 2, taskId: Date.parse(new Date()), autoDown: 1, autoClose: 1 };
        chrome.tabs.getCurrent(function (tabs) {
            chrome.tabs.create({ url: getM3u8Url(tabs.id, "audio", { ...options, isMaster: 1 }), index: tabs.index + 1, active: G.isMobile });
            chrome.tabs.create({ url: getM3u8Url(tabs.id, "video", { ...options, isMaster: 0 }), index: tabs.index + 1, active: G.isMobile });
        });
    });
}

/**
 * 把选中的视频或音频转成 m3u8 储存在 m3u8Data 供 m3u8 解析器读取
 * @param {String} type video / audio
 */
async function toM3u8(type) {
    let index = $("#mpdVideoLists").val();
    let items = mpdJson.playlists[index];
    if (type == "audio") {
        index = $("#mpdAudioLists").val();
        let temp = index.split("$-bmmmd-$");
        index = temp[0];
        let index2 = temp[1];
        items = mpdJson.mediaGroups.AUDIO.audio[index].playlists[index2];
    }
    mediaInfo = getInfo(type);
    m3u8Content = "#EXTM3U\n";
    m3u8Content += "#EXT-X-VERSION:3\n";
    m3u8Content += "#EXT-X-TARGETDURATION:" + items.targetDuration + "\n";
    m3u8Content += "#EXT-X-MEDIA-SEQUENCE:0\n";
    m3u8Content += "#EXT-X-PLAYLIST-TYPE:VOD\n";
    // 分片整段加密 初始化分片也是加密的 EXT-X-KEY 要放在 EXT-X-MAP 之前
    const segmentKey = segmentKeys.get(items.attributes.NAME);
    if (segmentKey) {
        // 密钥在本页面取好 (这里带着资源的请求头) 取不到时留下地址 由 m3u8 解析器提示
        const content = await getKey(segmentKey.uri);
        m3u8Content += `#EXT-X-KEY:METHOD=AES-128,URI="${content ? "data:application/octet-stream;base64," + content : segmentKey.uri}",IV=${segmentKey.iv}\n`;
    }
    m3u8Content += '#EXT-X-MAP:URI="' + items.segments[0].map.resolvedUri + '"\n';
    for (let key in items.segments) {
        m3u8Content += "#EXTINF:" + items.segments[key].duration + ",\n"
        m3u8Content += items.segments[key].resolvedUri + "\n";
    }
    m3u8Content += "#EXT-X-ENDLIST";
    m3u8Data[type] = { m3u8Content, mediaInfo };
}

/**
 * m3u8 解析器的地址
 * @param {Number} tabId 本页面的 tabId
 * @param {String} type video / audio
 * @param {Object} options 其他参数
 */
function getM3u8Url(tabId, type, options = {}) {
    // 标题和文件名原样交给 m3u8 解析器
    const names = { ...(_title ? { title: _title } : {}), ...(_fileName ? { filename: _fileName } : {}) };
    return "m3u8.html?" + new URLSearchParams({ getMpdId: tabId, mpdType: type, ...names, ...options });
}

/**
 * 查找分片整段加密 (ISO/IEC 23009-4 的 AES-128 CBC) 的密钥信息 SharePoint / Teams 录屏使用这种加密
 * 加密方式和 HLS 的 AES-128 相同 转成 m3u8 时带上 EXT-X-KEY 就能解密
 * @param {String} mpdContent mpd文件内容
 */
function getSegmentKeys(mpdContent) {
    const xmlDoc = new DOMParser().parseFromString(mpdContent, "application/xml");
    for (const representation of xmlDoc.getElementsByTagName("Representation")) {
        const id = representation.getAttribute("id");
        // 加密信息在 Representation 或它所在的 AdaptationSet
        const protection = [...representation.children, ...representation.parentNode.children].find(function (item) {
            return item.localName == "ContentProtection" && item.getAttribute("schemeIdUri") == "urn:mpeg:dash:sea:2012";
        });
        if (!id || !protection) { continue; }
        const encryption = protection.getElementsByTagNameNS("*", "SegmentEncryption")[0];
        const period = protection.getElementsByTagNameNS("*", "CryptoPeriod");
        // 只处理整个视频使用同一个密钥和IV的情况
        if (encryption?.getAttribute("schemeIdUri") != "urn:mpeg:dash:sea:aes128-cbc:2013" || period.length != 1) { continue; }
        const iv = period[0].getAttribute("IV");
        const uri = period[0].getAttribute("keyUriTemplate")?.replaceAll("$RepresentationID$", id);
        if (!uri || /\$\w+\$/.test(uri) || !/^0x[\da-f]{32}$/i.test(iv)) { continue; }
        try {
            segmentKeys.set(id, { uri: new URL(uri.replaceAll("$$", "$"), _url).href, iv: iv });
        } catch (e) { continue; }
    }
}

/**
 * 下载密钥
 * @param {String} uri 密钥地址
 * @returns {Promise<String|Boolean>} base64 编码的密钥 失败为 false
 */
function getKey(uri) {
    if (!keyContent.has(uri)) {
        keyContent.set(uri, fetch(uri)
            .then(response => response.ok ? response.arrayBuffer() : Promise.reject(response.status))
            .then(buffer => buffer.byteLength == 16 && btoa(String.fromCharCode(...new Uint8Array(buffer))))
            .catch(function (error) { console.log(error); return false; }));
    }
    return keyContent.get(uri);
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
        let pssh = protection.getElementsByTagName("cenc:pssh")[0];
        if (!pssh) {
            pssh = protection.getElementsByTagName("mspr:pro")[0];
        }

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
/**
 * 下载清单 取不到时显示原因 (之前会一直停在 "载入中")
 * 失败后不再往下走 所以失败时返回的 Promise 不会有结果
 * @param {String} url 清单地址
 * @returns {Promise<String>} 清单内容
 */
function loadManifest(url) {
    const TIMEOUT = 30000;
    return new Promise(function (resolve) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT);
        let content = "";
        fetch(url, { signal: controller.signal }).then(async function (response) {
            content = await response.text();
            if (!response.ok) { throw new Error(`HTTP ${response.status}`); }
            resolve(content);
        }).catch(function (error) {
            showError(controller.signal.aborted ? new Error(`Timeout (${TIMEOUT / 1000}s)`) : error, content);
        }).finally(() => clearTimeout(timer));
    });
}
/**
 * 清单取不到 / 解析不了 时在页面上显示原因
 * @param {Error} error
 * @param {String} content 服务器返回的内容 显示开头一段 方便看出是登录过期还是别的问题
 */
function showError(error, content = "") {
    console.log(error);
    $("#main").hide(); $("#loading").show();
    const box = $("#loading .optionBox").empty();
    box.append($("<b>").text(`${i18n.dataFetchFailed}: ${error?.message ?? error}`));
    const head = String(content).trim().slice(0, 300);
    head && box.append($("<div>").css({ "margin-top": "10px", "white-space": "pre-wrap", "word-break": "break-all" }).text(head));
}
// 解析并显示清单 解析出错时显示原因
function parseMPD(mpdContent) {
    try {
        readMPD(mpdContent);
    } catch (error) {
        showError(error, mpdContent);
    }
}
function readMPD(mpdContent) {
    $("#loading").hide(); $("#main").show();
    mpdJson = mpdParser.parse(mpdContent, { manifestUri: _url });
    getSegmentKeys(mpdContent);

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
    // 视频和音频都有 可以一起下载合并
    $("#mpdVideoLists option").length && $("#mpdAudioLists option").length && $("#mpdMerge").show();
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
    segmentKeys.has(items.attributes.NAME) && $("#count").append(` (${i18n.encryptionAlgorithm}: AES-128)`);
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