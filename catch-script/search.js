console.log("start search-json.js");

const _parse = JSON.parse;
JSON.parse = function () {
    let data = _parse.apply(this, arguments);
    findMedia(data, undefined);
    return data;
}
async function findMedia(data, raw) {
    for (let key in data) {
        // console.log(data[key]);
        if (typeof data[key] == "object") {
            findMedia(data[key], data);
            continue;
        }
        if (typeof data[key] == "string") {
            if (/^[\w]+:\/\/.+/i.test(data[key])) {
                let ext;
                try { ext = new URL(data[key]); } catch (e) { continue; }
                ext = ext.pathname.split(".");
                if (ext.length == 1) { continue; }
                ext = ext[ext.length - 1];
                if (ext == "m3u8" || ext == "m3u" || ext == "mpd") {
                    // console.log(data[key]);
                    window.postMessage({ type: "addMedia", url: data[key], href: location.href, ext: ext });
                }
                continue;
            }
            if (data[key].substr(0, 7) == "#EXTM3U") {
                if (isFullM3u8(data[key])) {
                    let m3u8Url = URL.createObjectURL(new Blob([new TextEncoder("utf-8").encode(data[key])]));
                    window.postMessage({ type: "addMedia", url: m3u8Url, href: location.href, ext: "m3u8" });
                }
                continue;
            }
        }
    }
}

function isFullM3u8(text) {
    let tsLists = text.split("\n");
    for (let ts of tsLists) {
        if (ts.includes("#")) { continue; }
        if (/^[\w]+:\/\/.+/i.test(ts)) {
            return true;
        }
        return false;
    }
}

// const _xhrOpen = XMLHttpRequest.prototype.open;
// XMLHttpRequest.prototype.open = function(event){
//     this.addEventListener("readystatechange", function (event) {
//         console.log(this);
//     });
//     _xhrOpen.apply(this, arguments);
// }