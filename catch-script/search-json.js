const _parse = JSON.parse;
JSON.parse = function () {
    let data = _parse.apply(this, arguments);
    findMedia(data, undefined);
    return data;
}
async function findMedia(data, raw) {
    for (let key in data) {
        if (typeof data[key] == "object") {
            findMedia(data[key], data);
            continue;
        }
        if (typeof data[key] == "string" && /^[\w]+:\/\/.+/i.test(data[key])) {
            let ext;
            try { ext = new URL(data[key]); } catch (e) { continue; }
            ext = ext.pathname.split(".");
            if (ext.length == 1) { continue; }
            ext = ext[ext.length - 1];
            if (ext == "m3u8" || ext == "m3u" || ext == "mpd") {
                window.postMessage({ type: "addMedia", url: data[key], href: location.href });
            }
        }
    }
}