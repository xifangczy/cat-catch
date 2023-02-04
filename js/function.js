// 追加0
function appendZero(date) {
    return parseInt(date) < 10 ? `0${date}` : date;
}
// 秒转换成时间
function secToTime(sec) {
    let time = "";
    let hour = Math.floor(sec / 3600);
    let min = Math.floor((sec % 3600) / 60);
    sec = Math.floor(sec % 60);
    if (hour > 0) {
        time = hour + ":";
    }
    time += appendZero(min) + ":";
    time += appendZero(sec);
    return time;
}
// 字节转换成大小
function byteToSize(byte) {
    if (!byte || byte < 1024) { return 0; }
    if (byte < 1024 * 1024) {
        return parseFloat((byte / 1024).toFixed(1)) + "KB";
    } else if (byte < 1024 * 1024 * 1024) {
        return parseFloat((byte / 1024 / 1024).toFixed(1)) + "MB";
    } else {
        return parseFloat((byte / 1024 / 1024 / 1024).toFixed(1)) + "GB";
    }
}
// 替换掉不允许的文件名称字符
function stringModify(str) {
    if (!str) { return str; }
    return str.replace(reStringModify, function (m) {
        return {
            "'": '&#39;',
            '\\': '&#92;',
            '/': '&#47;',
            ':': '&#58;',
            '*': '&#42;',
            '?': '&#63;',
            '"': '&quot;',
            '<': '&lt;',
            '>': '&gt;',
            '|': '&#124;',
            '~': '_'
        }[m];
    });
}
// Firefox download API 无法下载 data URL
function downloadDataURL(url, fileName) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    delete link;
}
// 判断是否为空
function isEmpty(obj) {
    return (typeof obj == "undefined" ||
        obj == null ||
        obj == "" ||
        obj == " ")
}

// 修改请求头Referer
function setReferer(referer, callback) {
    chrome.tabs.getCurrent(function (tabs) {
        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [tabs.id],
            addRules: [{
                "id": tabs.id,
                "action": {
                    "type": "modifyHeaders",
                    "requestHeaders": [{
                        "header": "Referer",
                        "operation": "set",
                        "value": referer
                    }]
                },
                "condition": {
                    "tabIds": [tabs.id],
                    "resourceTypes": ["xmlhttprequest"]
                }
            }]
        }, function () {
            callback && callback();
        });
    });
}
function deleteReferer(callback) {
    chrome.tabs.getCurrent(function (tabs) {
        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [tabs.id]
        }, function () {
            callback && callback();
        });
    });
}

// 模板 函数 实现
function templatesFunction(text, action) {
    text = isEmpty(text) ? "" : text.toString();
    action = action.trim().split("|");
    for (let item of action) {
        // 不使用 split(":") 方法 参数中 arg 可能包含 ":" 字符
        const temp = item.indexOf(":");
        if (temp == -1) { return ""; }
        let action = item.slice(0, temp).trim();
        let arg = item.slice(temp + 1).trim().split(",");
        arg = arg.map(item => {
            return item.trim().replace(/^['"]|['"]$/g, "");
        });
        if (isEmpty(text) && action != "exists") { return "" };
        if (action == "slice") {
            text = text.slice(...arg);
        } else if (action == "replace") {
            text = text.replace(...arg);
        } else if (action == "replaceAll") {
            text = text.replaceAll(...arg);
        } else if (action == "regexp") {
            arg = new RegExp(...arg);
            const result = text.match(arg);
            text = "";
            if (result && result.length >= 2) {
                for (let i = 1; i < result.length; i++) {
                    text += result[i].trim();
                }
            }
        } else if (action == "exists") {
            if (text) {
                text = arg[0].replaceAll("*", text);
                continue;
            }
            if (arg[1]) {
                text = arg[1].replaceAll("*", text);
                continue;
            }
            text = "";
        } else if (action == "to") {
            if (arg[0] == "base64") {
                text = window.Base64 ? Base64.encode(text) : btoa(unescape(encodeURIComponent(text)));
            } else if (arg[0] == "urlEncode") {
                text = encodeURIComponent(text);
            } else if (arg[0] == "urlDecode") {
                text = decodeURIComponent(text);
            } else if (arg[0] == "lowerCase") {
                text = text.toLowerCase();
            } else if (arg[0] == "upperCase") {
                text = text.toUpperCase();
            }
        } else {
            text = ""; break;
        }
    }
    return text;
}
function templates(text, data) {
    if (isEmpty(text)) { return ""; }
    // 日期
    const date = new Date();
    data.days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
    data.now = Date.now();
    data.fullDate = `${date.getFullYear()}-${appendZero(date.getMonth() + 1)}-${appendZero(date.getDate())}`;
    data.time = `${appendZero(date.getHours())}'${appendZero(date.getMinutes())}'${appendZero(date.getSeconds())}`;
    // fullFileName
    data.fullFileName = new URL(data.url).pathname.split("/").pop();
    // fileName
    data.fileName = data.fullFileName.split(".");
    data.fileName.length > 1 && data.fileName.pop();
    data.fileName = data.fileName.join(".");
    // ext
    if (isEmpty(data.ext)) {
        data.ext = data.fullFileName.split(".");
        data.ext = data.ext.length == 1 ? "" : data.ext[data.ext.length - 1];
    }
    // 标签
    const tags = {
        "$url$": data.url,
        "$referer$": data.referer ?? data.initiator,
        "$title$": data.title,
        "${url}": data.url ?? "",
        "${referer}": data.referer ?? "",
        "${initiator}": data.referer ? data.referer : data.initiator,
        "${webUrl}": data.webUrl ?? "",
        "${title}": data.title ?? "",
        "${now}": data.now,
        "${year}": date.getFullYear(),
        "${month}": appendZero(date.getMonth() + 1),
        "${date}": appendZero(date.getDate()),
        "${day}": data.days,
        "${hours}": appendZero(date.getHours()),
        "${minutes}": appendZero(date.getMinutes()),
        "${seconds}": appendZero(date.getSeconds()),
        "${fullDate}": data.fullDate,
        "${time}": data.time,
        "${fullFileName}": data.fullFileName ? data.fullFileName : "",
        "${fileName}": data.fileName ? data.fileName : "",
        "${ext}": data.ext ? data.ext : "",
        "${mobileUserAgent}": G.MobileUserAgent,
        "${userAgent}": G.userAgent ? G.userAgent : navigator.userAgent,
    }
    for (let key in tags) {
        text = text.replaceAll(key, tags[key]);
    }
    //函数支持
    text = text.replace(/\$\{(fullFileName|fileName|ext|title|referer|url|now|fullDate|time|initiator|webUrl|userAgent) ?\| ?([^}]+)\}/g, function (original, tag, action) {
        return templatesFunction(data[tag], action);
    });
    return text;
}