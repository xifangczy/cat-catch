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
let sidxMapping = null;         // 单文件写法 (SegmentBase) 各个文件的索引 取回来之后才有

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
    // 单文件的写法 初始化分片和各个分片是同一个文件里的不同位置
    const range = byterange => `${byterange.length}@${byterange.offset}`;
    const map = items.segments[0].map;
    if (map) {
        m3u8Content += '#EXT-X-MAP:URI="' + map.resolvedUri + '"' + (map.byterange ? `,BYTERANGE="${range(map.byterange)}"` : "") + '\n';
    }
    for (let key in items.segments) {
        m3u8Content += "#EXTINF:" + items.segments[key].duration + ",\n"
        if (items.segments[key].byterange) {
            m3u8Content += "#EXT-X-BYTERANGE:" + range(items.segments[key].byterange) + "\n";
        }
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
function parseMPD(mpdContent) {
    $("#loading").hide(); $("#main").show();
    mpdJson = mpdParser.parse(mpdContent, { manifestUri: _url, sidxMapping: sidxMapping ?? {} });
    // 单文件加索引的写法 (SegmentBase): 清单里只有一个文件地址 每个分片在文件里的位置记在文件自己的索引 (sidx) 里
    // 先把索引取回来 再解析一遍 才有分片
    if (!sidxMapping && sidxPlaylists().length) {
        $("#main").hide(); $("#loading").show();
        loadSidx().then(function (mapping) {
            sidxMapping = mapping;
            parseMPD(mpdContent);
        });
        return;
    }
    // 索引取不到的 整个文件当成一个分片
    for (const playlist of sidxPlaylists()) {
        playlist.segments = [{ resolvedUri: playlist.sidx.resolvedUri, duration: playlist.sidx.duration ?? mpdJson.duration ?? 0 }];
    }
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

// 还没有分片的单文件轨道 (视频 音频 都算)
function sidxPlaylists() {
    const list = [...(mpdJson.playlists ?? [])];
    for (const group of Object.values(mpdJson.mediaGroups?.AUDIO?.audio ?? {})) {
        list.push(...(group.playlists ?? []));
    }
    return list.filter(playlist => playlist.sidx && !(playlist.segments?.length));
}
/**
 * 解析 sidx (分片索引) 得到每个分片的大小和时长
 * 格式: 长度(4) "sidx"(4) 版本(1) 标志(3) 轨道(4) 时间单位(4) 最早时间(4|8) 第一个分片的偏移(4|8) 保留(2) 条数(2)
 *       每条 12 字节: 类型(1 位)+大小(31 位) 时长(32 位) SAP(32 位)
 * @param {ArrayBuffer} buffer 包含 sidx 的数据
 * @returns {Object|null} 和 mux.js 的 parseSidx 一样的结构 mpd-parser 用它来算分片
 */
function parseSidx(buffer) {
    const view = new DataView(buffer);
    let at = 0;
    // 给的范围里前面可能还有别的 box 找到 sidx
    while (at + 8 <= view.byteLength && view.getUint32(at + 4) != 0x73696478) {
        const size = view.getUint32(at);
        if (size < 8) { return null; }
        at += size;
    }
    if (at + 32 > view.byteLength) { return null; }
    const version = view.getUint8(at + 8);
    const result = { version: version, referenceId: view.getUint32(at + 12), timescale: view.getUint32(at + 16), references: [] };
    let pos = at + 20;
    if (version == 0) {
        result.earliestPresentationTime = view.getUint32(pos);
        result.firstOffset = view.getUint32(pos + 4);
        pos += 8;
    } else {
        result.earliestPresentationTime = Number(view.getBigUint64(pos));
        result.firstOffset = Number(view.getBigUint64(pos + 8));
        pos += 16;
    }
    const count = view.getUint16(pos + 2);
    pos += 4;
    for (let i = 0; i < count && pos + 12 <= view.byteLength; i++, pos += 12) {
        const first = view.getUint32(pos);
        result.references.push({ referenceType: first >>> 31, referencedSize: first & 0x7fffffff, subsegmentDuration: view.getUint32(pos + 4) });
    }
    return result.references.length ? result : null;
}
/**
 * 取回各个单文件轨道的索引
 * @returns {Promise<Object>} 交给 mpd-parser 的 sidxMapping 取不到的轨道不在里面
 */
async function loadSidx() {
    const mapping = {};
    await Promise.all(sidxPlaylists().map(async function (playlist) {
        const info = playlist.sidx;
        const key = mpdParser.generateSidxKey(info);
        if (!key || mapping[key] || !info.byterange) { return; }
        mapping[key] = null;
        try {
            const start = Number(info.byterange.offset);
            const response = await fetch(info.resolvedUri, { headers: { Range: `bytes=${start}-${start + Number(info.byterange.length) - 1}` } });
            // 服务器不支持范围请求时返回的是整个文件 不能拿来当索引
            if (response.status != 206) { return; }
            const sidx = parseSidx(await response.arrayBuffer());
            if (sidx) { mapping[key] = { sidxInfo: info, sidx: sidx }; }
        } catch (e) { console.log(e); }
    }));
    for (const key in mapping) {
        mapping[key] || delete mapping[key];
    }
    return mapping;
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
        // 单文件的写法 所有分片都是同一个地址 只列一次
        if (key > 0 && items.segments[key].resolvedUri == items.segments[key - 1].resolvedUri) { continue; }
        textarea += items.segments[key].resolvedUri + "\n\n";
    }
    $("#media_file").html(textarea);
    $("#count").html(i18n("m3u8Info", [items.segments.length, secToTime(mpdJson.duration)]));
    segmentKeys.has(items.attributes.NAME) && $("#count").append(` (${i18n.encryptionAlgorithm}: AES-128)`);
    items.segments.length > 0 && items.segments[0].map && $("#tips").html('initialization: <input type="text" value="' + items.segments[0].map.resolvedUri + '" spellcheck="false" readonly="readonly" class="width100">');
    $("#info").html(getInfo(type));
}

function getInfo(type = "audio") {
    if (type == "audio") {
        return i18n.audio + ": " + $("#mpdAudioLists").find("option:selected").text();
    } else {
        return i18n.video + ": " + $("#mpdVideoLists").find("option:selected").text();
    }
}