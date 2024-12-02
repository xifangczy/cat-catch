// const CATCH_SEARCH_ONLY = true;
(function __CAT_CATCH_CATCH_SCRIPT__() {
    const isRunningInWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
    const CATCH_SEARCH_DEBUG = false;
    // 防止 console.log 被劫持
    if (!isRunningInWorker && CATCH_SEARCH_DEBUG && console.log.toString() != 'function log() { [native code] }') {
        const newIframe = top.document.createElement("iframe");
        newIframe.style.width = 0;
        newIframe.style.height = 0;
        top.document.body.appendChild(newIframe);
        newIframe.contentWindow.document.write("<script>(window.catCatchLOG=function(){console.log(...arguments);})();</script>");
        window.console.log = newIframe.contentWindow.catCatchLOG;
    }
    // 防止 window.postMessage 被劫持
    const _postMessage = (isRunningInWorker ? self : window).postMessage;

    console.log("start search.js");
    const filter = new Set();
    const reKeyURL = /URI="(.*)"/;

    // Worker
    if (!isRunningInWorker) {
        const _Worker = Worker;
        window.Worker = function (scriptURL, options) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', scriptURL, false);
                xhr.send();
                if (xhr.status === 200) {
                    const blob = new Blob([`(${__CAT_CATCH_CATCH_SCRIPT__.toString()})();`, xhr.response], { type: 'text/javascript' });
                    const newWorker = new _Worker(URL.createObjectURL(blob), options);
                    newWorker.onmessage = function (event) {
                        if (event.data?.action == "catCatchAddKey" || event.data?.action == "catCatchAddMedia") {
                            postData(event.data);
                        }
                    }
                    return newWorker;
                }
            } catch (error) {
                return new _Worker(scriptURL, options);
            }
            return new _Worker(scriptURL, options);
        }
        window.Worker.toString = function () {
            return _Worker.toString();
        }
    }

    // JSON.parse
    const _JSONparse = JSON.parse;
    JSON.parse = function () {
        let data = _JSONparse.apply(this, arguments);
        findMedia(data);
        return data;
    }
    JSON.parse.toString = function () {
        return _JSONparse.toString();
    }

    async function findMedia(data, depth = 0) {
        CATCH_SEARCH_DEBUG && console.log(data);
        let index = 0;
        if (!data) { return; }
        if (data instanceof Array && data.length == 16) {
            const isKey = data.every(function (value) {
                return typeof value == 'number' && value <= 256
            });
            if (isKey) {
                postData({ action: "catCatchAddKey", key: data, href: location.href, ext: "key" });
                return;
            }
        }
        if (data instanceof ArrayBuffer && data.byteLength == 16) {
            postData({ action: "catCatchAddKey", key: data, href: location.href, ext: "key" });
            return;
        }
        for (let key in data) {
            if (index != 0) { depth = 0; } index++;
            if (typeof data[key] == "object") {
                // 查找疑似key
                if (data[key] instanceof Array && data[key].length == 16) {
                    const isKey = data[key].every(function (value) {
                        return typeof value == 'number' && value <= 256
                    });
                    isKey && postData({ action: "catCatchAddKey", key: data[key], href: location.href, ext: "key" });
                    continue;
                }
                if (depth > 10) { continue; }  // 防止死循环 最大深度
                findMedia(data[key], ++depth);
                continue;
            }
            if (typeof data[key] == "string") {
                if (isUrl(data[key])) {
                    let ext = getExtension(data[key]);
                    ext && postData({ action: "catCatchAddMedia", url: data[key], href: location.href, ext: ext });
                    continue;
                }
                if (data[key].substring(0, 7).toUpperCase() == "#EXTM3U") {
                    isFullM3u8(data[key]) && toUrl(data[key]);
                    continue;
                }
                if (data[key].substring(0, 17).toLowerCase() == "data:application/") {
                    const text = getDataM3U8(data[key].substring(17));
                    text && toUrl(text);
                    continue;
                }
                if (data[key].toLowerCase().includes("urn:mpeg:dash:schema:mpd")) {
                    toUrl(data[key], "mpd");
                    continue;
                }
                if (CATCH_SEARCH_DEBUG && data[key].includes("manifest")) {
                    console.log(data);
                }
            }
        }
    }

    // XHR
    const _xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method) {
        method = method.toUpperCase();
        CATCH_SEARCH_DEBUG && console.log(this);
        this.addEventListener("readystatechange", function (event) {
            CATCH_SEARCH_DEBUG && console.log(this);
            if (this.status != 200) { return; }
            // 查找疑似key
            if (this.responseType == "arraybuffer" && this.response?.byteLength && this.response.byteLength == 32) {
                console.log(this.response);
            }
            if (this.responseType == "arraybuffer" && this.response?.byteLength && this.response.byteLength == 16) {
                postData({ action: "catCatchAddKey", key: this.response, href: location.href, ext: "key" });
            }
            if (typeof this.response == "object") {
                findMedia(this.response);
                return;
            }
            if (this.response == "" || typeof this.response != "string") { return; }
            if (this.response.substring(0, 17).toLowerCase() == "data:application/") {
                const text = getDataM3U8(this.response.substring(17));
                text && toUrl(text);
                return;
            }
            if (this.responseURL.substring(0, 17).toLowerCase() == "data:application/") {
                const text = getDataM3U8(this.responseURL.substring(17));
                text && toUrl(text);
                return;
            }
            if (isUrl(this.response)) {
                const ext = getExtension(this.response);
                ext && postData({ action: "catCatchAddMedia", url: this.response, href: location.href, ext: ext });
                return;
            }
            if (this.response.toUpperCase().includes("#EXTM3U")) {
                if (this.response.substring(0, 7) == "#EXTM3U") {
                    if (method == "GET") {
                        toUrl(addBashUrl(getBashUrl(this.responseURL), this.response));
                        postData({ action: "catCatchAddMedia", url: this.responseURL, href: location.href, ext: "m3u8" });
                        return;
                    }
                    isFullM3u8(this.response) && toUrl(this.response);
                    return;
                }
                if (isJSON(this.response)) {
                    if (method == "GET") {
                        postData({ action: "catCatchAddMedia", url: this.responseURL, href: location.href, ext: "json" });
                        return;
                    }
                    toUrl(this.response, "json");
                    return;
                }
            }
            const isJson = isJSON(this.response);
            if (isJson) {
                findMedia(isJson);
                return;
            }
        });
        _xhrOpen.apply(this, arguments);
    }
    XMLHttpRequest.prototype.open.toString = function () {
        return _xhrOpen.toString();
    }

    // fetch
    const _fetch = fetch;
    fetch = async function (input, init) {
        const response = await _fetch.apply(this, arguments);
        const clone = response.clone();
        CATCH_SEARCH_DEBUG && console.log(response);
        response.arrayBuffer()
            .then(arrayBuffer => {
                CATCH_SEARCH_DEBUG && console.log({ arrayBuffer, input });
                if (arrayBuffer.byteLength == 16) {
                    postData({ action: "catCatchAddKey", key: arrayBuffer, href: location.href, ext: "key" });
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
                if (text.substring(0, 7).toUpperCase() == "#EXTM3U") {
                    if (init?.method == undefined || (init.method && init.method.toUpperCase() == "GET")) {
                        toUrl(addBashUrl(getBashUrl(input), text));
                        postData({ action: "catCatchAddMedia", url: input, href: location.href, ext: "m3u8" });
                        return;
                    }
                    isFullM3u8(text) && toUrl(text);
                    return;
                }
                if (text.substring(0, 17).toLowerCase() == "data:application/") {
                    const text = getDataM3U8(text.substring(0, 17));
                    text && toUrl(text);
                    return;
                }
            });
        return clone;
    }
    fetch.toString = function () {
        return _fetch.toString();
    }

    // Array.prototype.slice
    const _slice = Array.prototype.slice;
    Array.prototype.slice = function (start, end) {
        const data = _slice.apply(this, arguments);
        if (end == 16 && this.length == 32) {
            for (let item of data) {
                if (typeof item != "number" || item > 255) { return data; }
            }
            postData({ action: "catCatchAddKey", key: data, href: location.href, ext: "key" });
        }
        return data;
    }
    Array.prototype.slice.toString = function () {
        return _slice.toString();
    }

    // Int8Array.prototype.subarray
    const _subarray = Int8Array.prototype.subarray;
    Int8Array.prototype.subarray = function (start, end) {
        const data = _subarray.apply(this, arguments);
        if (data.byteLength == 16) {
            const uint8 = new _Uint8Array(data);
            for (let item of uint8) {
                if (typeof item != "number" || item > 255) { return data; }
            }
            postData({ action: "catCatchAddKey", key: uint8.buffer, href: location.href, ext: "key" });
        }
        return data;
    }
    Int8Array.prototype.subarray.toString = function () {
        return _subarray.toString();
    }

    // window.btoa / window.atob
    const _btoa = btoa;
    btoa = function (data) {
        const base64 = _btoa.apply(this, arguments);
        CATCH_SEARCH_DEBUG && console.log(base64, data, base64.length);
        if (base64.length == 24 && base64.substring(22, 24) == "==") {
            postData({ action: "catCatchAddKey", key: base64, href: location.href, ext: "base64Key" });
        }
        if (data.substring(0, 7).toUpperCase() == "#EXTM3U" && isFullM3u8(data)) {
            toUrl(data);
        }
        return base64;
    }
    btoa.toString = function () {
        return _btoa.toString();
    }
    const _atob = atob;
    atob = function (base64) {
        const data = _atob.apply(this, arguments);
        CATCH_SEARCH_DEBUG && console.log(base64, data, base64.length);
        if (base64.length == 24 && base64.substring(22, 24) == "==") {
            postData({ action: "catCatchAddKey", key: base64, href: location.href, ext: "base64Key" });
        }
        if (data.substring(0, 7).toUpperCase() == "#EXTM3U" && isFullM3u8(data)) {
            toUrl(data);
        }
        if (data.endsWith("</MPD>")) {
            toUrl(data, "mpd");
        }
        return data;
    }
    atob.toString = function () {
        return _atob.toString();
    }

    // fromCharCode
    const _fromCharCode = String.fromCharCode;
    let m3u8Text = '';
    String.fromCharCode = function () {
        const data = _fromCharCode.apply(this, arguments);
        if (data.length < 7) { return data; }
        if (data.substring(0, 7) == "#EXTM3U" || data.includes("#EXTINF:")) {
            m3u8Text += data;
            if (m3u8Text.includes("#EXT-X-ENDLIST")) {
                toUrl(m3u8Text.split("#EXT-X-ENDLIST")[0] + "#EXT-X-ENDLIST");
                m3u8Text = '';
            }
            return data;
        }
        const key = data.replaceAll("\u0010", "");
        if (key.length == 32) {
            postData({ action: "catCatchAddKey", key: key, href: location.href, ext: "key" });
        }
        return data;
    }
    String.fromCharCode.toString = function () {
        return _fromCharCode.toString();
    }

    // DataView
    const _DataView = DataView;
    DataView = new Proxy(_DataView, {
        construct(target, args) {
            let instance = new target(...args);
            instance.setInt32 = new Proxy(instance.setInt32, {
                apply(target, thisArg, argArray) {
                    Reflect.apply(target, thisArg, argArray);
                    if (thisArg.byteLength == 16) {
                        postData({ action: "catCatchAddKey", key: thisArg.buffer, href: location.href, ext: "key" });
                    }
                    return;
                }
            });
            if (instance.byteLength == 16 && instance.buffer.byteLength == 16) {
                postData({ action: "catCatchAddKey", key: instance.buffer, href: location.href, ext: "key" });
            }
            if (instance.byteLength == 256 || instance.byteLength == 128) {
                const _buffer = isRepeatedExpansion(instance.buffer, 16);
                if (_buffer) {
                    postData({ action: "catCatchAddKey", key: _buffer, href: location.href, ext: "key" });
                }
            }
            return instance;
        }
    });

    // escape
    const _escape = escape;
    escape = function (str) {
        if (str?.length && str.length == 24 && str.substring(22, 24) == "==") {
            postData({ action: "catCatchAddKey", key: str, href: location.href, ext: "base64Key" });
        }
        return _escape(str);
    }
    escape.toString = function () {
        return _escape.toString();
    }

    const uint32ArrayToUint8Array_ = (array) => {
        const newArray = new Uint8Array(16);
        for (let i = 0; i < 4; i++) {
            newArray[i * 4] = (array[i] >> 24) & 0xff;
            newArray[i * 4 + 1] = (array[i] >> 16) & 0xff;
            newArray[i * 4 + 2] = (array[i] >> 8) & 0xff;
            newArray[i * 4 + 3] = array[i] & 0xff;
        }
        return newArray;
    }
    const uint16ArrayToUint8Array_ = (array) => {
        const newArray = new Uint8Array(16);
        for (let i = 0; i < 8; i++) {
            newArray[i * 2] = (array[i] >> 8) & 0xff;
            newArray[i * 2 + 1] = array[i] & 0xff;
        }
        return newArray;
    }
    // findTypedArray
    const findTypedArray = (target, args) => {
        const isArray = Array.isArray(args[0]) && args[0].length === 16;
        const isArrayBuffer = args[0] instanceof ArrayBuffer && args[0].byteLength === 16;
        const instance = new target(...args);
        if (isArray || isArrayBuffer) {
            postData({ action: "catCatchAddKey", key: args[0], href: location.href, ext: "key" });
        } else if (instance.buffer.byteLength === 16) {
            if (target.name === 'Uint32Array') {
                postData({ action: "catCatchAddKey", key: uint32ArrayToUint8Array_(instance).buffer, href: location.href, ext: "key" });
            } else if (target.name === 'Uint16Array') {
                postData({ action: "catCatchAddKey", key: uint16ArrayToUint8Array_(instance).buffer, href: location.href, ext: "key" });
            } else {
                postData({ action: "catCatchAddKey", key: instance.buffer, href: location.href, ext: "key" });
            }
        }
        return instance;
    }
    // Uint8Array
    const _Uint8Array = Uint8Array;
    Uint8Array = new Proxy(_Uint8Array, {
        construct(target, args) {
            return findTypedArray(target, args);
        }
    });
    // Uint16Array
    const _Uint16Array = Uint16Array;
    Uint16Array = new Proxy(_Uint16Array, {
        construct(target, args) {
            return findTypedArray(target, args);
        }
    });
    // Uint32Array
    const _Uint32Array = Uint32Array;
    Uint32Array = new Proxy(_Uint32Array, {
        construct(target, args) {
            return findTypedArray(target, args);
        }
    });

    const _arrayJoin = Array.prototype.join;
    Array.prototype.join = function () {
        const data = _arrayJoin.apply(this, arguments);
        if (data.substring(0, 7).toUpperCase() == "#EXTM3U") {
            isFullM3u8(data) && toUrl(data);
        }
        return data;
    }
    Array.prototype.join.toString = function () {
        return _arrayJoin.toString();
    }

    function isUrl(str) {
        return (str.startsWith("http://") || str.startsWith("https://"));
    }
    function isFullM3u8(text) {
        let tsLists = text.split("\n");
        for (let ts of tsLists) {
            if (ts[0] == "#") { continue; }
            if (isUrl(ts)) { return true; }
            return false;
        }
        return false;
    }
    function getBashUrl(url) {
        let bashUrl = url.split("/");
        bashUrl.pop();
        // return bashUrl._arrayJoin("/") + "/";
        return bashUrl.join("/") + "/";
    }
    function addBashUrl(baseUrl, m3u8Text) {
        let m3u8_split = m3u8Text.split("\n");
        m3u8Text = "";
        for (let ts of m3u8_split) {
            if (ts == "" || ts == " " || ts == "\n") { continue; }
            if (ts.includes("URI=")) {
                let KeyURL = reKeyURL.exec(ts);
                if (KeyURL && KeyURL[1] && !isUrl(KeyURL[1])) {
                    ts = ts.replace(reKeyURL, 'URI="' + baseUrl + KeyURL[1] + '"');
                }
            }
            if (ts[0] != "#" && !isUrl(ts)) {
                ts = baseUrl + ts;
            }
            m3u8Text += ts + "\n";
        }
        return m3u8Text;
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
    function getExtension(str) {
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
            ext == "flv" ||
            ext == "key"
        ) { return ext; }
        return false;
    }
    function toUrl(text, ext = "m3u8") {
        let url = URL.createObjectURL(new Blob([new TextEncoder("utf-8").encode(text)]));
        postData({ action: "catCatchAddMedia", url: url, href: location.href, ext: ext });
    }
    function getDataM3U8(text) {
        const type = ["vnd.apple.mpegurl", "x-mpegurl", "mpegurl"];
        let isM3U8 = false;
        for (let item of type) {
            if (text.substring(0, item.length).toLowerCase() == item) {
                text = text.substring(item.length + 1);
                isM3U8 = true;
                break;
            }
        }
        if (!isM3U8) { return false; }
        if (text.substring(0, 7).toLowerCase() == "base64,") {
            return _atob(text.substring(7));
        }
        return text;
    }
    function postData(data) {
        let value = data.url ? data.url : data.key;
        if (value instanceof ArrayBuffer || value instanceof Array) {
            if (value.byteLength == 0) { return; }
            data.key = ArrayToBase64(value);
            value = data.key;
        }
        if (data.action == "catCatchAddKey" && data.key.startsWith("AAAAAAAAAAAAAAAAAAAA")) {
            return;
        }
        if (filter.has(value)) { return false; }
        filter.add(value);
        data.requestId = Date.now().toString() + filter.size;
        _postMessage(data);
    }
    function ArrayToBase64(data) {
        try {
            let bytes = new _Uint8Array(data);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += _fromCharCode(bytes[i]);
            }
            if (typeof _btoa == "function") {
                return _btoa(binary);
            }
            return _btoa(binary);
        } catch (e) {
            return false;
        }
    }
    function isRepeatedExpansion(array, expansionLength) {
        let _buffer = new _Uint8Array(expansionLength);
        array = new _Uint8Array(array);
        for (let i = 0; i < expansionLength; i++) {
            _buffer[i] = array[i];
            for (let j = i + expansionLength; j < array.byteLength; j += expansionLength) {
                if (array[i] !== array[j]) {
                    return false;
                }
            }
        }
        return _buffer.buffer;
    }
})();