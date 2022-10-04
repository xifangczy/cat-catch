console.log("start search.js");
const CATCH_SEARCH_DEBUG = false;

// 拦截JSON.parse 分析内容
const _JSONparse = JSON.parse;
JSON.parse = function () {
    let data = _JSONparse.apply(this, arguments);
    findMedia(data);
    return data;
}
async function findMedia(data, raw = undefined, depth = 0) {
    CATCH_SEARCH_DEBUG && console.log(data);
    for (let key in data) {
        if (typeof data[key] == "object") {
            // 查找疑似key
            if (data[key] instanceof Array && data[key].length == 16) {
                let flag = true;
                for (let item of data[key]) {
                    if (typeof item != "number" || item > 255) { flag = false; break; }
                }
                if (flag) {
                    window.postMessage({ type: "addKey", key: data[key], href: location.href, ext: "key" });
                    continue;
                }
                continue;
            }
            if (depth > 25) { continue; }  // 防止死循环 最大深度
            if (!raw) { raw = data; }
            findMedia(data[key], raw, ++depth);
            continue;
        }
        if (typeof data[key] == "string") {
            if (isUrl(data[key])) {
                let ext = isParsing(data[key]);
                ext && window.postMessage({ type: "addMedia", url: data[key], href: location.href, ext: ext });
                continue;
            }
            if (data[key].substring(0, 7) == "#EXTM3U") {
                isFullM3u8(data[key]) && toUrl(data[key]);
                continue;
            }
            if (data[key].substring(0, 34) == "data:application/vnd.apple.mpegurl") {
                let text = data[key].substring(35);
                if (text.substring(0, 7) == "base64,") {
                    text = window.atob(text.substring(7));
                }
                toUrl(text);
                continue;
            }
            if (CATCH_SEARCH_DEBUG && data[key].includes("manifest")) {
                console.log(data);
            }
        }
    }
}

// 拦截 XHR 分析内容
const _xhrOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method) {
    method = method.toUpperCase();
    CATCH_SEARCH_DEBUG && console.log(this);
    this.addEventListener("readystatechange", function (event) {
        CATCH_SEARCH_DEBUG && console.log(this);
        if (this.status != 200) { return; }
        // 查找疑似key
        if (this.responseType == "arraybuffer" && this.response?.byteLength && this.response.byteLength == 16) {
            window.postMessage({ type: "addKey", key: this.response, href: location.href, ext: "key" });
        }
        if (this.response == "" || typeof this.response != "string") { return; }
        if (this.response.substring(0, 34) == "data:application/vnd.apple.mpegurl") {
            let text = this.response.substring(35);
            if (text.substring(0, 7) == "base64,") {
                text = window.atob(text.substring(7));
            }
            toUrl(text);
            return;
        }
        if (this.responseURL.substring(0, 34) == "data:application/vnd.apple.mpegurl") {
            let text = this.responseURL.substring(35);
            if (text.substring(0, 7) == "base64,") {
                text = window.atob(text.substring(7));
            }
            toUrl(text);
            return;
        }
        if (isUrl(this.response)) {
            let ext = isParsing(this.response);
            ext && window.postMessage({ type: "addMedia", url: this.response, href: location.href, ext: ext });
            return;
        }
        if (this.response.includes("#EXTM3U")) {
            if (this.response.substring(0, 7) == "#EXTM3U") {
                if (method == "GET") {
                    window.postMessage({ type: "addMedia", url: this.responseURL, href: location.href, ext: "m3u8" });
                    return;
                }
                isFullM3u8(this.response) && toUrl(this.response);
                return;
            }
            if (isJSON(this.response)) {
                if (method == "GET") {
                    window.postMessage({ type: "addMedia", url: this.responseURL, href: location.href, ext: "json" });
                    return;
                }
                toUrl(this.response, "json");
                return;
            }
        }
    });
    _xhrOpen.apply(this, arguments);
}

// 拦截 fetch 分析内容
const _fetch = window.fetch;
window.fetch = async function (input, init) {
    const response = await _fetch.apply(this, arguments);
    const clone = response.clone();
    CATCH_SEARCH_DEBUG && console.log(response);
    response.arrayBuffer()
        .then(arrayBuffer => {
            CATCH_SEARCH_DEBUG && console.log({ arrayBuffer, input });
            if (arrayBuffer.byteLength == 16) {
                window.postMessage({ type: "addKey", key: arrayBuffer, href: location.href, ext: "key" });
                return;
            }
            let text = new TextDecoder().decode(arrayBuffer);
            if (text == "") { return; }
            if (typeof input == "object") { input = input.url; }
            let isJson = isJSON(text);
            if (isJson) {
                findMedia(isJson);
                return;
            }
            if (text.substring(0, 7) == "#EXTM3U") {
                if (init.method == undefined || (init.method && init.method.toUpperCase() == "GET")) {
                    window.postMessage({ type: "addMedia", url: input, href: location.href, ext: "m3u8" });
                    return;
                }
                isFullM3u8(text) && toUrl(text);
                return;
            }
            if (text.substring(0, 34) == "data:application/vnd.apple.mpegurl") {
                let text = text.substring(35);
                if (text.substring(0, 7) == "base64,") {
                    text = window.atob(text.substring(7));
                }
                toUrl(text);
                return;
            }
            // if(/googlevideo\.com\/videoplayback.*&range=/i.test(input)){
            //     input = input.replace(/&range=[^&]*/, "");
            //     window.postMessage({ type: "addMedia", url: input, href: location.href, ext: "mp4" });
            //     return;
            // }
        });
    return clone;
}

// 拦截 Array.prototype.slice
const _slice = Array.prototype.slice;
Array.prototype.slice = function (start, end) {
    let data = _slice.apply(this, arguments);
    if (end == 16 && this.length == 32) {
        for (let item of data) {
            if (typeof item != "number" || item > 255) { return data; }
        }
        window.postMessage({ type: "addKey", key: data, href: location.href, ext: "key" });
    }
    return data;
}

function isUrl(str) {
    return /^http[s]*:\/\/.+/i.test(str);
}
function isFullM3u8(text) {
    let tsLists = text.split("\n");
    for (let ts of tsLists) {
        if (ts.includes("#")) { continue; }
        if (isUrl(ts)) { return true; }
        return false;
    }
    return false;
}
function isJSON(str) {
    if (typeof str == "object") {
        return str;
    }
    if (typeof str == "string") {
        try {
            return _JSONparse(str);
        } catch (e) { return false; }
    }
    return false;
}
function isParsing(str) {
    let ext;
    try { ext = new URL(str); } catch (e) { return undefined; }
    ext = ext.pathname.split(".");
    if (ext.length == 1) { return undefined; }
    ext = ext[ext.length - 1].toLowerCase();
    if (ext == "m3u8" ||
        ext == "m3u" ||
        ext == "mpd" ||
        ext == "mp4" ||
        ext == "mp3" ||
        ext == "key"
    ) { return ext; }
    return false;
}
function toUrl(text, ext = "m3u8") {
    let url = URL.createObjectURL(new Blob([new TextEncoder("utf-8").encode(text)]));
    window.postMessage({ type: "addMedia", url: url, href: location.href, ext: ext });
}