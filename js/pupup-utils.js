// 复制选项
function copyLink(data) {
    let text = data.url;
    if (data.parsing == "m3u8") {
        text = G.copyM3U8;
    } else if (data.parsing == "mpd") {
        text = G.copyMPD;
    } else {
        text = G.copyOther;
    }
    return templates(text, data);
}
function isM3U8(data) {
    return (
        data.ext == "m3u8" ||
        data.ext == "m3u" ||
        data.type?.endsWith("/vnd.apple.mpegurl") ||
        data.type?.endsWith("/x-mpegurl") ||
        data.type?.endsWith("/mpegurl") ||
        data.type?.endsWith("/octet-stream-m3u8")
    )
}
function isMPD(data) {
    return (data.ext == "mpd" ||
        data.type == "application/dash+xml"
    )
}
function isJSON(data) {
    return (data.ext == "json" ||
        data.type == "application/json" ||
        data.type == "text/json"
    )
}
function isPicture(data) {
    return (data.type?.startsWith("image/") ||
        data.ext == "jpg" ||
        data.ext == "png" ||
        data.ext == "jpeg" ||
        data.ext == "bmp" ||
        data.ext == "gif" ||
        data.ext == "webp" ||
        data.ext == "svg"
    )
}
function isMediaExt(ext) {
    return ['ogg', 'ogv', 'mp4', 'webm', 'mp3', 'wav', 'm4a', '3gp', 'mpeg', 'mov', 'm4s', 'aac'].includes(ext);
}
function isMedia(data) {
    return isMediaExt(data.ext) || data.type?.startsWith("video/") || data.type?.startsWith("audio/");
}
/**
 * ari2a RPC发送一套资源
 * @param {object} data 资源对象
 * @param {Function} success 成功运行函数
 * @param {Function} error 失败运行函数
 */
function aria2AddUri(data, success, error) {
    const json = {
        "jsonrpc": "2.0",
        "id": "cat-catch-" + data.requestId,
        "method": "aria2.addUri",
        "params": []
    };
    if (G.aria2RpcToken) {
        json.params.push(`token:${G.aria2RpcToken}`);
    }
    const params = { out: data.downFileName };
    if (G.enableAria2RpcReferer) {
        params.header = [];
        params.header.push(G.userAgent ? G.userAgent : navigator.userAgent);
        if (data.requestHeaders?.referer) {
            params.header.push("Referer: " + data.requestHeaders.referer);
        }
        if (data.cookie) {
            params.header.push("Cookie: " + data.cookie);
        }
        if (data.requestHeaders?.authorization) {
            params.header.push("Authorization: " + data.requestHeaders.authorization);
        }
    }
    json.params.push([data.url], params);
    fetch(G.aria2Rpc, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(json)
    }).then(response => {
        return response.json();
    }).then(data => {
        success && success(data);
    }).catch(errMsg => {
        error && error(errMsg);
    });
}