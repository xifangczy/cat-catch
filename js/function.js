// 追加0
function appendZero(date) {
    return parseInt(date) < 10 ? `0${date}` : date;
}
// 秒转换成时间
function secToTime(sec) {
    let hour = (sec / 3600) | 0;
    let min = ((sec % 3600) / 60) | 0;
    sec = (sec % 60) | 0;
    let time = hour > 0 ? hour + ":" : "";
    time += min.toString().padStart(2, '0') + ":";
    time += sec.toString().padStart(2, '0');
    return time;
}
// 字节转换成大小
function byteToSize(byte) {
    if (!byte || byte < 1024) { return 0; }
    if (byte < 1024 * 1024) {
        return (byte / 1024).toFixed(1) + "KB";
    } else if (byte < 1024 * 1024 * 1024) {
        return (byte / 1024 / 1024).toFixed(1) + "MB";
    } else {
        return (byte / 1024 / 1024 / 1024).toFixed(1) + "GB";
    }
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

// 修改请求头
function setRequestHeaders(data = {}, callback = undefined) {
    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] });
    chrome.tabs.getCurrent(function (tabs) {
        const rules = { removeRuleIds: [tabs ? tabs.id : 1] };
        if (Object.keys(data).length) {
            rules.addRules = [{
                "id": tabs ? tabs.id : 1,
                "priority": tabs ? tabs.id : 1,
                "action": {
                    "type": "modifyHeaders",
                    "requestHeaders": Object.keys(data).map(key => ({ header: key, operation: "set", value: data[key] }))
                },
                "condition": {
                    "resourceTypes": ["xmlhttprequest", "media", "image"],
                }
            }];
            if (tabs) {
                rules.addRules[0].condition.tabIds = [tabs.id];
            } else {
                // initiatorDomains 只支持 chrome 101+ firefox 113+
                if (G.version < 101 || (G.isFirefox && G.version < 113)) {
                    callback && callback();
                    return;
                }
                const domain = G.isFirefox
                    ? new URL(chrome.runtime.getURL("")).hostname
                    : chrome.runtime.id;
                rules.addRules[0].condition.initiatorDomains = [domain];
            }
        }
        chrome.declarativeNetRequest.updateSessionRules(rules, function () {
            callback && callback();
        });
    });
}

function awaitG(callback, sec = 0) {
    const timer = setInterval(() => {
        if (G.initSyncComplete && G.initLocalComplete) {
            clearInterval(timer);
            callback();
        }
    }, sec);
}

// 分割字符串
function splitString(text, separator) {
    text = text.trim();
    if (text.length == 0) { return []; }
    const parts = [];
    let inQuotes = false;
    let inSingleQuotes = false;
    let start = 0;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === separator && !inQuotes && !inSingleQuotes) {
            parts.push(text.slice(start, i));
            start = i + 1;
        } else if (text[i] === '"' && !inSingleQuotes) {
            inQuotes = !inQuotes;
        } else if (text[i] === "'" && !inQuotes) {
            inSingleQuotes = !inSingleQuotes;
        }
    }
    parts.push(text.slice(start));
    return parts;
}

// 模板 函数 实现
function templatesFunction(text, action, data) {
    text = isEmpty(text) ? "" : text.toString();
    action = splitString(action, "|");
    for (let item of action) {
        let action = item.trim();   // 函数
        let arg = [];   //参数
        // 查找 ":" 区分函数与参数
        const colon = item.indexOf(":");
        if (colon != -1) {
            action = item.slice(0, colon).trim();
            arg = splitString(item.slice(colon + 1).trim(), ",").map(item => {
                return item.trim().replace(/^['"]|['"]$/g, "");
            });
        }
        // 字符串不允许为空 除非 exists find prompt函数
        if (isEmpty(text) && !["exists", "find", "prompt"].includes(action)) { return "" };
        // 参数不能为空 除非 filter prompt函数
        if (arg.length == 0 && !["filter", "prompt"].includes(action)) { return text }

        if (action == "slice") {
            text = text.slice(...arg);
        } else if (action == "replace") {
            text = text.replace(...arg);
        } else if (action == "replaceAll") {
            text = text.replaceAll(...arg);
        } else if (action == "regexp") {
            const result = text.match(new RegExp(...arg));
            text = "";
            if (result && result.length >= 2) {
                for (let i = 1; i < result.length; i++) {
                    if (result[i]) {
                        text += result[i].trim();
                    }
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
            } else if (arg[0] == "trim") {
                text = text.trim();
            } else if (arg[0] == "filter") {
                text = stringModify(text.trim());
            }
        } else if (action == "find") {
            text = "";
            if (data.pageDOM) {
                try {
                    text = data.pageDOM.querySelector(arg[0]).innerHTML;
                } catch (e) { text = ""; }
            }
        } else if (action == "filter") {
            text = stringModify(text, arg[0]);
        } else if (action == "prompt") {
            text = window.prompt("", text);
        }
    }
    return text;
}
function templates(text, data) {
    if (isEmpty(text)) { return ""; }
    // fullFileName
    try {
        data.fullFileName = new URL(data.url).pathname.split("/").pop();
    } catch (e) {
        data.fullFileName = 'NULL';
    }
    // fileName
    data.fileName = data.fullFileName.split(".");
    data.fileName.length > 1 && data.fileName.pop();
    data.fileName = data.fileName.join(".");
    // ext
    if (isEmpty(data.ext)) {
        data.ext = data.fullFileName.split(".");
        data.ext = data.ext.length == 1 ? "" : data.ext[data.ext.length - 1];
    }
    const date = new Date();
    let _data = {
        // 资源信息
        url: data.url ?? "",
        referer: data.requestHeaders?.referer ?? "",
        origin: data.requestHeaders?.origin ?? "",
        initiator: data.requestHeaders?.referer ? data.requestHeaders.referer : data.initiator,
        webUrl: data.webUrl ?? "",
        title: data._title ?? data.title,
        pageDOM: data.pageDOM,
        cookie: data.cookie ?? "",

        // 时间相关
        year: date.getFullYear(),
        month: appendZero(date.getMonth() + 1),
        date: appendZero(date.getDate()),
        day: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()],
        fullDate: `${date.getFullYear()}-${appendZero(date.getMonth() + 1)}-${appendZero(date.getDate())}`,
        time: `${appendZero(date.getHours())}'${appendZero(date.getMinutes())}'${appendZero(date.getSeconds())}`,
        hours: appendZero(date.getHours()),
        minutes: appendZero(date.getMinutes()),
        seconds: appendZero(date.getSeconds()),
        now: Date.now(),

        // 文件名
        fullFileName: data.fullFileName ? data.fullFileName : "",
        fileName: data.fileName ? data.fileName : "",
        ext: data.ext ?? "",

        // 全局变量
        mobileUserAgent: G.MobileUserAgent,
        userAgent: G.userAgent ? G.userAgent : navigator.userAgent,
    }
    _data = { ...data, ..._data };
    text = text.replace(reTemplates, function (original, tag, action) {
        tag = tag.trim();
        if (action) {
            return templatesFunction(_data[tag], action.trim(), _data);
        }
        return _data[tag] ?? original;
    });

    return text;
}
// 从url中获取文件名
function getUrlFileName(url) {
    let pathname = new URL(url).pathname;
    let filename = pathname.split("/").pop();
    return filename ? filename : "NULL";
}
/**
 * 解析json字符串 解析错误返回默认值
 * @param {string} str json字符串
 * @param {object} error 解析错误返回的默认值
 * @returns {object} 返回解析后的对象
 */
function JSONparse(str, error = {}) {
    if (!str) { return error; }
    try {
        return JSON.parse(str);
    } catch (e) {
        return error;
    }
}