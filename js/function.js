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
function downloadDataURL(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
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

// 模板 slice replace 实现
function templatesFunction(text, action, arg) {
    action = action.trim();
    arg = arg.split(",");
    arg = arg.map(item => {
        item = item.trim();
        item = item.replace(/"/g, "");
        item = item.replace(/'/g, "");
        return item;
    });
    if (action == "slice") {
        return text.slice(...arg);
    }
    if (action == "replace") {
        return text.replace(...arg);
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
    return text;
}
function templates(text, data) {
    // 旧标签
    text = text.replace(/\$url\$/g, data.url);
    text = text.replace(/\$referer\$/g, data.referer ?? data.initiator);
    text = text.replace(/\$title\$/g, data.title);
    // 新标签
    text = text.replace(/\${url\}/g, data.url);
    text = text.replace(/\${url ?\| ?([^:]+):([^}]+)}/g, function (text, action, arg) {
        return templatesFunction(data.url, action, arg);
    });
    text = text.replace(/\${referer\}/g, data.referer ?? data.initiator);
    text = text.replace(/\${title\}/g, data.title);
    text = text.replace(/\${title ?\| ?([^:]+):([^}]+)}/g, function (text, action, arg) {
        return templatesFunction(data.title, action, arg);
    });
    // 日期
    const date = new Date();
    text = text.replace(/\${year\}/g, date.getFullYear());
    text = text.replace(/\${month\}/g, date.getMonth() + 1);
    text = text.replace(/\${day\}/g, date.getDate());
    text = text.replace(/\${hours\}/g, date.getHours());
    text = text.replace(/\${minutes\}/g, date.getMinutes());
    text = text.replace(/\${seconds\}/g, date.getSeconds());
    text = text.replace(/\${date\}/g, `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`);
    text = text.replace(/\${time\}/g, `${date.getHours()}'${date.getMinutes()}'${date.getSeconds()}`);
    // fullfilename
    const fullfilename = new URL(data.url).pathname.split("/").pop();
    text = text.replace(/\${fullfilename\}/g, fullfilename);
    text = text.replace(/\${fullfilename ?\| ?([^:]+):([^}]+)}/g, function (text, action, arg) {
        return templatesFunction(fullfilename, action, arg);
    });
    // filename
    let filename = fullfilename.split(".");
    filename.length > 1 && filename.pop();
    filename = filename.join(".");
    filename = isEmpty(filename) ? "NULL" : filename;
    text = text.replace(/\${filename\}/g, filename);
    text = text.replace(/\${filename ?\| ?([^:]+):([^}]+)}/g, function (text, action, arg) {
        return templatesFunction(filename, action, arg);
    });
    // ext
    let ext = fullfilename.split(".");
    ext = ext.length == 1 ? "NULL" : ext[ext.length - 1];
    ext = isEmpty(ext) ? "NULL" : ext;
    text = text.replace(/\${ext\}/g, ext);
    text = text.replace(/\${ext ?\| ?([^:]+):([^}]+)}/g, function (text, action, arg) {
        return templatesFunction(ext, action, arg);
    });
    return text;
}