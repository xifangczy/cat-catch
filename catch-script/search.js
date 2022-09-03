console.log("start search.js");
const DEBUG = false;

// 拦截JSON.parse 分析内容
const _JSONparse = JSON.parse;
JSON.parse = function () {
    let data = _JSONparse.apply(this, arguments);
    findMedia(data);
    return data;
}
async function findMedia(data, raw = undefined, depth = 0) {
    DEBUG && console.log(data);
    for (let key in data) {
        if (typeof data[key] == "object") {
            if (depth > 10) { continue; }  // 防止死循环 最大深度10
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
            if (data[key].substr(0, 7) == "#EXTM3U") {
                isFullM3u8(data[key]) && toUrl(data[key]);
                continue;
            }
            if (data[key].substr(0, 34) == "data:application/vnd.apple.mpegurl") {
                let text = data[key].substr(0, 34);
                if (text.substr(0, 8) == ";base64,") {
                    text = window.atob(text.substr(8));
                }
                toUrl(text);
                continue;
            }
        }
    }
}

// 拦截 XHR 分析内容
const _xhrOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method) {
    method = method.toUpperCase();
    this.addEventListener("readystatechange", function (event) {
        if (this.status != 200 || this.response == "" || typeof this.response != "string") { return; }
        DEBUG && console.log(this);
        if (this.response.substr(0, 34) == "data:application/vnd.apple.mpegurl") {
            let text = this.response.substr(34);
            if (text.substr(0, 8) == ";base64,") {
                text = window.atob(text.substr(8));
            }
            toUrl(text);
            return;
        }
        if (this.responseURL.substr(0, 34) == "data:application/vnd.apple.mpegurl") {
            let text = this.responseURL.substr(34);
            if (text.substr(0, 8) == ";base64,") {
                text = window.atob(text.substr(8));
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
            if (this.response.substr(0, 7) == "#EXTM3U") {
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
    response.text()
        .then(text => {
            if (text == "") { return; }
            DEBUG && console.log(text);
            let isJson = isJSON(text);
            if (isJson) {
                findMedia(isJson);
                return;
            }
            if (text.substr(0, 7) == "#EXTM3U") {
                if (init.method == undefined || (init.method && init.method.toUpperCase() == "GET")) {
                    window.postMessage({ type: "addMedia", url: input, href: location.href, ext: "m3u8" });
                    return;
                }
                isFullM3u8(text) && toUrl(text);
                return;
            }
            if (text.substr(0, 34) == "data:application/vnd.apple.mpegurl") {
                let text = text.substr(0, 34);
                if (text.substr(0, 8) == ";base64,") {
                    text = window.atob(text.substr(8));
                }
                toUrl(text);
                return;
            }
        });
    return clone;
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
    if (ext == "m3u8" || ext == "m3u" || ext == "mpd") {
        return ext;
    }
    return false;
}
function toUrl(text, ext = "m3u8") {
    let url = URL.createObjectURL(new Blob([new TextEncoder("utf-8").encode(text)]));
    window.postMessage({ type: "addMedia", url: url, href: location.href, ext: ext });
}