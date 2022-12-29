/*公共函数*/
// 秒转换成时间
function secToTime(sec) {
    let time = "";
    let hour = Math.floor(sec / 3600);
    let min = Math.floor((sec % 3600) / 60);
    sec = Math.floor(sec % 60);
    if (hour > 0) {
        time = hour + ":";
    }
    if (min < 10) {
        time += "0";
    }
    time += min + ":";
    if (sec < 10) {
        time += "0";
    }
    time += sec;
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
function templatesFunction(text, action, arg = "") {
    if (isEmpty(text)) { return "" };
    text = text.toString();
    action = action.trim();
    arg = arg.split(",");
    arg = arg.map(item => {
        item = item.trim();
        if (item[0] == "'" || item[0] == '"') {
            item = item.slice(1);
        }
        const length = item.length - 1;
        if (item[length] == "'" || item[length] == '"') {
            item = item.slice(0, length);
        }
        return item;
    });
    if (action == "slice") {
        return text.slice(...arg);
    }
    if (action == "replace") {
        return text.replace(...arg);
    }
    if (action == "replaceAll") {
        return text.replaceAll(...arg);
    }
    if (action == "regexp") {
        arg = new RegExp(...arg);
        const result = text.match(arg);
        if (result && result.length >= 2) {
            text = "";
            for (let i = 1; i < result.length; i++) {
                text += result[i].trim();
            }
        }
        return text;
    }
    if (action == "exists") {
        if (text) {
            return arg[0].replaceAll("*", text);
        }
        if (arg[1]) {
            return arg[1].replaceAll("*", text);
        }
        return "";
    }
    if (action == "to") {
        if(arg[0] == "base64"){
            return window.Base64 ? Base64.encode(text) : btoa(unescape(encodeURIComponent(text)));
        }
        if(arg[0] == "urlEncode"){
            return encodeURIComponent(text);
        }
        if(arg[0] == "lowerCase"){
            return text.toLowerCase();
        }
        if(arg[0] == "upperCase"){
            return text.toUpperCase();
        }
    }
    return text;
}
function templates(text, data) {
    // 旧标签
    text = text.replaceAll("$url$", data.url);
    text = text.replaceAll("$referer$", data.referer ?? data.initiator);
    text = text.replaceAll("$title$", data.title);
    // 新标签
    text = text.replaceAll("${url}", data.url);
    if (data.referer) {
        text = text.replaceAll("${referer}", data.referer);
    }
    text = text.replaceAll("${initiator}", data.referer ? data.referer : data.initiator);
    text = text.replaceAll("${webUrl}", data.webUrl);
    text = text.replaceAll("${title}", data.title);
    // 日期
    const date = new Date();
    data.days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
    data.now = Date.now();
    function appendZero(date) {
        return parseInt(date) < 10 ? `0${date}` : date;
    }
    text = text.replaceAll("${now}", data.now);
    text = text.replaceAll("${year}", date.getFullYear());
    text = text.replaceAll("${month}", appendZero(date.getMonth() + 1));
    text = text.replaceAll("${date}", appendZero(date.getDate()));
    text = text.replaceAll("${day}", data.days);
    text = text.replaceAll("${hours}", appendZero(date.getHours()));
    text = text.replaceAll("${minutes}", appendZero(date.getMinutes()));
    text = text.replaceAll("${seconds}", appendZero(date.getSeconds()));
    data.fullDate = `${date.getFullYear()}-${appendZero(date.getMonth() + 1)}-${appendZero(date.getDate())}`;
    text = text.replaceAll("${fullDate}", data.fullDate);
    data.time = `${appendZero(date.getHours())}'${appendZero(date.getMinutes())}'${appendZero(date.getSeconds())}`;
    text = text.replaceAll("${time}", data.time);
    // fullFileName
    data.fullFileName = new URL(data.url).pathname.split("/").pop();
    data.fullFileName = isEmpty(data.fullFileName) ? "NULL" : data.fullFileName;
    text = text.replaceAll("${fullFileName}", data.fullFileName);
    // fileName
    data.fileName = data.fullFileName.split(".");
    data.fileName.length > 1 && data.fileName.pop();
    data.fileName = data.fileName.join(".");
    data.fileName = isEmpty(data.fileName) ? "NULL" : data.fileName;
    text = text.replaceAll("${fileName}", data.fileName);
    // ext
    if (!data.ext) {
        data.ext = data.fullFileName.split(".");
        data.ext = data.ext.length == 1 ? "NULL" : data.ext[data.ext.length - 1];
        data.ext = isEmpty(data.ext) ? "NULL" : data.ext;
    }
    text = text.replaceAll("${ext}", data.ext);
    //函数支持
    text = text.replace(/\$\{(fullFileName|fileName|ext|title|referer|url|now|fullDate|time|initiator|webUrl) ?\| ?(slice|replace|replaceAll|regexp|exists|to) ?:([^\}]+)\}/g, function (original, tag, action, arg) {
        return templatesFunction(data[tag], action, arg);
    });
    return text;
}