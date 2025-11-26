// const CATCH_SEARCH_ONLY = true;
(function __CAT_CATCH_CATCH_SCRIPT__() {
    const isRunningInWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
    const CATCH_SEARCH_DEBUG = false; // 开发调试日志
    // 防止 console.log 被劫持
    if (!isRunningInWorker && CATCH_SEARCH_DEBUG && console.log.toString() != 'function log() { [native code] }') {
        const newIframe = top.document.createElement("iframe");
        newIframe.style.display = "none";
        top.document.body.appendChild(newIframe);
        window.console.log = newIframe.contentWindow.console.log;
    }
    // 防止 window.postMessage 被劫持
    const _postMessage = self.postMessage;

    // console.log("start search.js");
    const filter = new Set();
    const reKeyURL = /URI="(.*)"/;
    const dataRE = /^data:(application|video|audio)\//i;
    const joinBaseUrlTask = [];
    const baseUrl = new Set();
    const regexVimeo = /^https:\/\/[^\.]*\.vimeocdn\.com\/exp=.*\/playlist\.json\?/i;
    const videoSet = new Set();
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    extractBaseUrl(location.href);

    // Worker
    const _Worker = Worker;
    self.Worker = function (scriptURL, options) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', scriptURL, false);
            xhr.send();
            if (xhr.status === 200) {
                const blob = new Blob([`(${__CAT_CATCH_CATCH_SCRIPT__.toString()})();`, xhr.response], { type: 'text/javascript' });
                const newWorker = new _Worker(URL.createObjectURL(blob), options);
                newWorker.addEventListener("message", function (event) {
                    if (event.data?.action == "catCatchAddKey" || event.data?.action == "catCatchAddMedia") {
                        postData(event.data);
                    }
                });
                return newWorker;
            }
        } catch (error) {
            return new _Worker(scriptURL, options);
        }
        return new _Worker(scriptURL, options);
    }
    self.Worker.toString = function () {
        return _Worker.toString();
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
                    const ext = getExtension(data[key]);
                    if (ext) {
                        const url = data[key].startsWith("//") ? (location.protocol + data[key]) : data[key];
                        extractBaseUrl(url);
                        postData({ action: "catCatchAddMedia", url: url, href: location.href, ext: ext });
                    }
                    continue;
                }
                if (data[key].substring(0, 7).toUpperCase() == "#EXTM3U") {
                    toUrl(data[key]);
                    continue;
                }
                if (dataRE.test(data[key].substring(0, 17))) {
                    const text = getDataM3U8(data[key]);
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

            // 处理viemo
            this.responseURL.includes("vimeocdn.com") && vimeo(this.responseURL, this.response);

            // 查找疑似key
            if (this.responseType === "arraybuffer" && this.response?.byteLength) {
                if (this.response.byteLength === 16 || this.response.byteLength === 32) {
                    postData({ action: "catCatchAddKey", key: this.response, href: location.href, ext: "key" });
                }
                if (this.responseURL.includes(".ts")) {
                    extractBaseUrl(this.responseURL);
                }
            }
            if (typeof this.response == "object") {
                findMedia(this.response);
                return;
            }
            if (this.response == "" || typeof this.response != "string") { return; }

            if (dataRE.test(this.response)) {
                const text = getDataM3U8(this.response);
                text && toUrl(text);
                return;
            }
            if (dataRE.test(this.responseURL)) {
                const text = getDataM3U8(this.responseURL);
                text && toUrl(text);
                return;
            }
            if (isUrl(this.response)) {
                const ext = getExtension(this.response);
                ext && postData({ action: "catCatchAddMedia", url: this.response, href: location.href, ext: ext });
                return;
            }
            const responseUpper = this.response.toUpperCase();
            if (responseUpper.includes("#EXTM3U")) {
                if (responseUpper.substring(0, 7) == "#EXTM3U") {
                    if (method == "GET") {
                        toUrl(addBaseUrl(getBaseUrl(this.responseURL), this.response));
                        postData({ action: "catCatchAddMedia", url: this.responseURL, href: location.href, ext: "m3u8" });
                        return;
                    }
                    toUrl(this.response);
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
            // dash DRM
            // if (responseUpper.includes("<MPD") && responseUpper.includes("</MPD>")) {
            //     _postMessage({
            //         action: "catCatchDashDRMMedia",
            //         url: this.responseURL,
            //         data: this.response,
            //         href: location.href
            //     });
            //     return;
            // }
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
        let response;
        try {
            response = await _fetch.apply(this, arguments);
        } catch (error) {
            console.error("Fetch error:", error);
            throw error; // Re-throw the error if necessary
        }
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
                        toUrl(addBaseUrl(getBaseUrl(input), text));
                        postData({ action: "catCatchAddMedia", url: input, href: location.href, ext: "m3u8" });
                        return;
                    }
                    toUrl(text);
                    return;
                }
                if (dataRE.test(text.substring(0, 17))) {
                    const data = getDataM3U8(text);
                    data && toUrl(data);
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
            CATCH_SEARCH_DEBUG && console.log(this, start, end, data);
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

    //#region TypedArray.prototype.subarray
    const createSubarrayWrapper = (originalSubarray) => {
        return function (start, end) {
            const data = originalSubarray.apply(this, arguments);
            CATCH_SEARCH_DEBUG && console.log(this, start, end, data);
            if (data.byteLength == 16) {
                const uint8 = new _Uint8Array(data);
                const isValid = Array.from(uint8).every(item => typeof item == "number" && item <= 255);
                isValid && postData({ action: "catCatchAddKey", key: uint8.buffer, href: location.href, ext: "key" });
            }
            return data;
        }
    }
    // Int8Array.prototype.subarray
    const _Int8ArraySubarray = Int8Array.prototype.subarray;
    Int8Array.prototype.subarray = createSubarrayWrapper(_Int8ArraySubarray);
    Int8Array.prototype.subarray.toString = function () {
        return _Int8ArraySubarray.toString();
    }
    // Uint8Array.prototype.subarray
    const _Uint8ArraySubarray = Uint8Array.prototype.subarray;
    Uint8Array.prototype.subarray = createSubarrayWrapper(_Uint8ArraySubarray);
    Uint8Array.prototype.subarray.toString = function () {
        return _Uint8ArraySubarray.toString();
    }
    //#endregion

    // window.btoa / window.atob
    const _btoa = btoa;
    btoa = function (data) {
        const base64 = _btoa.apply(this, arguments);
        CATCH_SEARCH_DEBUG && console.log(base64, data, base64.length);
        if (base64.length == 24 && base64.substring(22, 24) == "==") {
            postData({ action: "catCatchAddKey", key: base64, href: location.href, ext: "base64Key" });
        }
        if (data.substring(0, 7).toUpperCase() == "#EXTM3U") {
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
        if (data.substring(0, 7).toUpperCase() == "#EXTM3U") {
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
        CATCH_SEARCH_DEBUG && console.log(data, this, arguments);
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
    // const _DataView = DataView;
    // DataView = new Proxy(_DataView, {
    //     construct(target, args) {
    //         let instance = new target(...args);
    //         // 劫持常用的set方法
    //         for (const methodName of ['setInt8', 'setUint8', 'setInt16', 'setUint16', 'setInt32', 'setUint32']) {
    //             if (typeof instance[methodName] !== 'function') {
    //                 continue;
    //             }
    //             instance[methodName] = new Proxy(instance[methodName], {
    //                 apply(target, thisArg, argArray) {
    //                     const result = Reflect.apply(target, thisArg, argArray);
    //                     if (thisArg.byteLength == 16) {
    //                         postData({ action: "catCatchAddKey", key: thisArg.buffer, href: location.href, ext: "key" });
    //                     }
    //                     return result;
    //                 }
    //             });
    //         }
    //         CATCH_SEARCH_DEBUG && console.log(target.name, args, instance);
    //         if (instance.byteLength == 16 && instance.buffer.byteLength == 16) {
    //             postData({ action: "catCatchAddKey", key: instance.buffer, href: location.href, ext: "key" });
    //         }
    //         if (instance.byteLength == 256 || instance.byteLength == 128 || instance.byteLength == 32) {
    //             const _buffer = isRepeatedExpansion(instance.buffer, 16);
    //             if (_buffer) {
    //                 postData({ action: "catCatchAddKey", key: _buffer, href: location.href, ext: "key" });
    //             }
    //         }
    //         if (instance.byteLength == 32) {
    //             const key = instance.buffer.slice(0, 16);
    //             postData({ action: "catCatchAddKey", key: key, href: location.href, ext: "key" });
    //         }
    //         return instance;
    //     }
    // });

    const _DataView = DataView;
    DataView = function () {
        // 创建原始 DataView 实例
        const instance = new _DataView(...arguments);
        // 劫持常用的 set 方法
        for (const methodName of ['setInt8', 'setUint8', 'setInt16', 'setUint16', 'setInt32', 'setUint32']) {
            if (typeof instance[methodName] !== 'function') {
                continue;
            }
            const originalMethod = instance[methodName];
            instance[methodName] = function (...args) {
                const result = originalMethod.apply(this, args);
                // 在方法调用后检查条件
                if (this.byteLength === 16) {
                    postData({ action: "catCatchAddKey", key: this.buffer, href: location.href, ext: "key" });
                }
                return result;
            };
        }
        CATCH_SEARCH_DEBUG && console.log(_DataView.name, arguments, instance);
        // 根据 byteLength 条件发送数据
        if (instance.byteLength === 16 && instance.buffer.byteLength === 16) {
            postData({ action: "catCatchAddKey", key: instance.buffer, href: location.href, ext: "key" });
        }
        if (instance.byteLength === 256 || instance.byteLength === 128 || instance.byteLength === 32) {
            const _buffer = isRepeatedExpansion(instance.buffer, 16);
            if (_buffer) {
                postData({ action: "catCatchAddKey", key: _buffer, href: location.href, ext: "key" });
            }
        }
        if (instance.byteLength === 32) {
            const key = instance.buffer.slice(0, 16);
            postData({ action: "catCatchAddKey", key: key, href: location.href, ext: "key" });
        }
        return instance;
    }
    DataView.toString = function () {
        return _DataView.toString();
    }

    // escape
    const _escape = escape;
    escape = function (str) {
        CATCH_SEARCH_DEBUG && console.log(str);
        if (str?.length && str.length == 24 && str.substring(22, 24) == "==") {
            postData({ action: "catCatchAddKey", key: str, href: location.href, ext: "base64Key" });
        }
        return _escape(str);
    }
    escape.toString = function () {
        return _escape.toString();
    }

    // indexOf
    const _indexOf = String.prototype.indexOf;
    String.prototype.indexOf = function (searchValue, fromIndex) {
        const out = _indexOf.apply(this, arguments);
        // CATCH_SEARCH_DEBUG && console.log(this, searchValue, fromIndex, out);
        if (searchValue === '#EXTM3U' && out !== -1) {
            const data = this.substring(fromIndex);
            toUrl(data);
        }
        return out;
    }
    String.prototype.indexOf.toString = function () {
        return _indexOf.toString();
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
        CATCH_SEARCH_DEBUG && console.log(target.name, args, instance);
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

    // join
    const _arrayJoin = Array.prototype.join;
    Array.prototype.join = function () {
        const data = _arrayJoin.apply(this, arguments);
        // CATCH_SEARCH_DEBUG && console.log(data, this, arguments);
        if (data.substring(0, 7).toUpperCase() == "#EXTM3U") {
            toUrl(data);
        }
        if (data.length == 24) {
            // 判断是否是base64
            CATCH_SEARCH_DEBUG && console.log(data, this, arguments);
            base64Regex.test(data) && postData({ action: "catCatchAddKey", key: data, href: location.href, ext: "base64Key" });
        }
        return data;
    }
    Array.prototype.join.toString = function () {
        return _arrayJoin.toString();
    }

    function isUrl(str) {
        return (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("//"));
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
    function TsProtocol(text) {
        let tsLists = text.split("\n");
        for (let i in tsLists) {
            if (tsLists[i][0] == "#") { continue; }
            if (tsLists[i].startsWith("//")) {
                tsLists[i] = location.protocol + tsLists[i];
            }
        }
        // return tsLists.join("\n");
        return _arrayJoin.call(tsLists, "\n");
    }
    function getBaseUrl(url) {
        let bashUrl = url.split("/");
        bashUrl.pop();
        // return baseUrl.join("/") + "/";
        return _arrayJoin.call(bashUrl, "/") + "/";
    }
    function addBaseUrl(baseUrl, m3u8Text) {
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
                if (ts.startsWith("/")) {
                    // url根目录
                    const urlSplit = baseUrl.split("/");
                    ts = urlSplit[0] + "//" + urlSplit[2] + ts;
                } else {
                    ts = baseUrl + ts;
                }
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
        try {
            if (str.startsWith("//")) {
                str = location.protocol + str;
            }
            ext = new URL(str);
        } catch (e) { return undefined; }
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
        if (!text) { return; }
        // 处理ts地址无protocol
        text = TsProtocol(text);
        if (isFullM3u8(text)) {
            let url = URL.createObjectURL(new Blob([new TextEncoder("utf-8").encode(text)]));
            postData({ action: "catCatchAddMedia", url: url, href: location.href, ext: ext });
            return;
        }
        baseUrl.forEach((url) => {
            url = URL.createObjectURL(new Blob([new TextEncoder("utf-8").encode(addBaseUrl(url, text))]));
            postData({ action: "catCatchAddMedia", url: url, href: location.href, ext: ext });
        });
        joinBaseUrlTask.push((url) => {
            url = URL.createObjectURL(new Blob([new TextEncoder("utf-8").encode(addBaseUrl(url, text))]));
            postData({ action: "catCatchAddMedia", url: url, href: location.href, ext: ext });
        });
    }
    function getDataM3U8(text) {
        text = text.substring(text.indexOf('/') + 1);
        const mimeTypes = ["vnd.apple.mpegurl", "x-mpegurl", "mpegurl"];

        const matchedType = mimeTypes.find(type =>
            text.toLowerCase().startsWith(type)
        );

        if (!matchedType) return false;
        const remainingText = text.slice(matchedType.length + 1);
        const [prefix, data] = remainingText.split(/,(.+)/);

        return prefix.toLowerCase() === 'base64'
            ? _atob(data)
            : remainingText;
    }
    function postData(data) {
        let value = data.url ? data.url : data.key;
        if (value instanceof ArrayBuffer || value instanceof Array) {
            if (value.byteLength == 0) { return; }
            if (data.action == "catCatchAddKey") {
                // 判断是否ftyp
                const uint8 = new _Uint8Array(value);
                if ((uint8[4] === 0x73 || uint8[4] === 0x66) && uint8[5] == 0x74 && uint8[6] == 0x79 && uint8[7] == 0x70) {
                    return;
                }
            }
            data.key = ArrayToBase64(value);
            value = data.key;
        }
        /**
         * AAAAAAAA... 空数据
         */
        if (data.action == "catCatchAddKey" && (data.key.startsWith("AAAAAAAAAAAAAAAAAAAA"))) {
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
    function extractBaseUrl(url) {
        let urlSplit = url.split("/");
        urlSplit.pop();
        urlSplit = urlSplit.join("/") + "/";
        if (!baseUrl.has(urlSplit)) {
            joinBaseUrlTask.forEach(fn => fn(urlSplit));
            baseUrl.add(urlSplit);
        }
    }

    // vimeo json 翻译为 m3u8
    async function vimeo(originalUrl, json) {
        if (!json || !regexVimeo.test(originalUrl) || videoSet.has(originalUrl)) return;

        const data = isJSON(json);
        if (!data?.base_url || !data?.video) return;

        videoSet.add(originalUrl);

        try {
            const url = new URL(originalUrl);
            const pathBase = url.pathname.substring(0, url.pathname.lastIndexOf('/')) + "/";
            const baseURL = new URL(url.origin + pathBase + data.base_url).href;

            let M3U8List = ["#EXTM3U", "#EXT-X-INDEPENDENT-SEGMENTS", "#EXT-X-VERSION:3"];

            const toM3U8 = (stream) => {
                if (!stream.segments || stream.segments.length == 0) return null;
                let M3U8 = [
                    "#EXTM3U",
                    "#EXT-X-VERSION:3",
                    `#EXT-X-TARGETDURATION:${stream.duration}`,
                    "#EXT-X-MEDIA-SEQUENCE:0",
                    "#EXT-X-PLAYLIST-TYPE:VOD"
                ];
                if (stream.init_segment) {
                    M3U8.push(`#EXT-X-MAP:URI="data:application/octet-stream;base64,${stream.init_segment}"`);
                } else if (stream.init_segment_url) {
                    M3U8.push(`#EXT-X-MAP:URI="${baseURL}${stream.base_url}${stream.init_segment_url}"`);
                }
                for (const segment of stream.segments) {
                    M3U8.push(`#EXTINF:${segment.end - segment.start},`);
                    M3U8.push(`${baseURL}${stream.base_url}${segment.url}`);
                }
                M3U8.push("#EXT-X-ENDLIST");
                return URL.createObjectURL(
                    new Blob([new TextEncoder("utf-8").encode(_arrayJoin.call(M3U8, "\n"))])
                );
            }

            if (data.video) {
                for (const stream of data.video) {
                    const blobUrl = toM3U8(stream);
                    if (!blobUrl) continue;
                    M3U8List.push(`#EXT-X-STREAM-INF:BANDWIDTH=${stream.bitrate},RESOLUTION=${stream.width}x${stream.height},CODECS="${stream.codecs}"`);
                    M3U8List.push(blobUrl);
                }
            }
            if (data.audio) {
                for (const stream of data.audio) {
                    const blobUrl = toM3U8(stream);
                    if (!blobUrl) continue;
                    M3U8List.push(`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${stream.id}",NAME="${stream.bitrate}",URI="${blobUrl}"`);
                }
            }
            const blobUrl = URL.createObjectURL(
                new Blob([new TextEncoder("utf-8").encode(_arrayJoin.call(M3U8List, "\n"))])
            );
            postData({ action: "catCatchAddMedia", url: blobUrl, href: location.href, ext: "m3u8" });

        } catch (e) {
            CATCH_SEARCH_DEBUG && console.error("Error processing Vimeo stream:", e);
        }
    }
})();