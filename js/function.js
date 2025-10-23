/**
 * 小于10的数字前面加0
 * @param {Number} date 
 * @returns {String|Number}
 */
function appendZero(date) {
    return parseInt(date) < 10 ? `0${date}` : date;
}

/**
 * 秒转格式化成时间
 * @param {Number} sec 
 * @returns {String}
 */
function secToTime(sec) {
    let hour = (sec / 3600) | 0;
    let min = ((sec % 3600) / 60) | 0;
    sec = (sec % 60) | 0;
    let time = hour > 0 ? hour + ":" : "";
    time += min.toString().padStart(2, '0') + ":";
    time += sec.toString().padStart(2, '0');
    return time;
}

/**
 * 字节转换成大小
 * @param {Number} byte 大小
 * @returns {String} 格式化后的文件大小
 */
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

/**
 * Firefox download API 无法下载 data URL
 * @param {String} url 
 * @param {String} fileName 文件名
 */
function downloadDataURL(url, fileName) {
    let link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    link = null;
}

/**
 * 判断变量是否为空
 * @param {Object|String} obj 判断的变量
 * @returns {Boolean}
 */
function isEmpty(obj) {
    return (typeof obj == "undefined" ||
        obj == null ||
        obj == "" ||
        obj == " ")
}

/**
 * 修改请求头
 * @param {Object} data 请求头数据
 * @param {Function} callback 
 */
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

/**
 * 指定标签页修改 urlFilter请求头
 * @param {Object} data 需要修改请求头的对象数组
 * @param {*} callBack 回调函数
 * @param {*} tabId 需要修改的tabId
 */
function setHeaders(data, callBack, tabId = -1) {
    if (!tabId == -1) {
        tabId = G.tabId;
    }
    const rules = { removeRuleIds: [], addRules: [] };
    if (!Array.isArray(data)) {
        data = [data];
    }
    for (let item of data) {
        if (!item.requestHeaders) { continue; }
        const rule = {
            "id": parseInt(item.requestId),
            "action": {
                "type": "modifyHeaders",
                "requestHeaders": Object.keys(item.requestHeaders).map(key => ({ header: key, operation: "set", value: item.requestHeaders[key] }))
            },
            "condition": {
                "resourceTypes": ["xmlhttprequest", "media", "image"],
                "tabIds": [tabId],
                "urlFilter": item.url
            }
        }
        if (item.cookie) {
            rule.action.requestHeaders.push({ header: "Cookie", operation: "set", value: item.cookie });
        }
        rules.removeRuleIds.push(parseInt(item.requestId));
        rules.addRules.push(rule);
    }
    chrome.declarativeNetRequest.updateSessionRules(rules, () => {
        callBack && callBack();
    });
}

/**
 * 等待全局变量G初始化完成
 * @param {Function} callback 
 * @param {Number} sec
 */
function awaitG(callback, sec = 0) {
    const timer = setInterval(() => {
        if (G.initSyncComplete && G.initLocalComplete) {
            clearInterval(timer);
            callback();
        }
    }, sec);
}

/**
 * 分割字符串 不分割引号内的内容
 * @param {String} text 需要处理的文本
 * @param {String} separator 分隔符
 * @returns {String} 返回分割后的字符串
 */
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

/**
 * 模板的函数处理
 * @param {String} text 文本
 * @param {String} action 函数名
 * @param {Object} data 填充的数据
 * @returns {String} 返回处理后的字符串
 */
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
        } else if (action == "prepend") {
            text = arg[0] + text;
        } else if (action == "concat") {
            text = text + arg[0];
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
                if (text) { text = text.trim(); }
            } else if (arg[0] == "filter") {
                if (text) { text = text.trim(); }
                text = stringModify(text);
            }
        } else if (action == "find") {
            text = "";
            if (data.pageDOM) {
                try {
                    text = data.pageDOM.querySelector(arg[0]).innerText?.trim();
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

/**
 * 模板替换
 * @param {String} text 标签模板
 * @param {Object} data 填充的数据
 * @returns {String} 返回填充后的字符串
 */
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
    const trimData = {
        // 资源信息
        url: data.url ?? "",
        referer: data.requestHeaders?.referer ?? "",
        origin: data.requestHeaders?.origin ?? "",
        initiator: data.requestHeaders?.referer ? data.requestHeaders.referer : data.initiator,
        webUrl: data.webUrl ?? "",
        title: data._title ?? data.title,
        pageDOM: data.pageDOM,
        cookie: data.cookie ?? "",
        tabId: data.tabId ?? 0,

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
        timestamp: new Date().toISOString(),

        // 文件名
        fullFileName: data.fullFileName ? data.fullFileName : "",
        fileName: data.fileName ? data.fileName : "",
        ext: data.ext ?? "",

        // 全局变量
        mobileUserAgent: G.MobileUserAgent,
        userAgent: G.userAgent ? G.userAgent : navigator.userAgent,
    }
    const _data = { ...data, ...trimData };
    text = text.replace(reTemplates, function (original, tag, action) {
        tag = tag.trim();
        // 特殊标签 data 返回所有数据
        if (tag == 'data') { return JSON.stringify(trimData); }
        if (action) {
            return templatesFunction(_data[tag], action.trim(), _data);
        }
        return _data[tag] ?? original;
    });

    return text;
}

/**
 * 从url中获取文件名
 * @param {String} url 
 * @returns {String} 文件名
 */
function getUrlFileName(url) {
    let pathname = new URL(url).pathname;
    let filename = pathname.split("/").pop();
    return filename ? filename : "NULL";
}

/**
 * 解析json字符串 尝试修复键名没有双引号 解析错误返回默认值
 * @param {string} str json字符串
 * @param {object} error 解析错误返回的默认值
 * @param {number} attempt 尝试修复次数
 * @returns {object} 返回解析后的对象
 */
function JSONparse(str, error = {}, attempt = 0) {
    if (!str) { return error; }
    try {
        return JSON.parse(str);
    } catch (e) {
        if (attempt === 0) {
            // 第一次解析失败，修正字符串后递归调用
            reJSONparse.lastIndex = 0;
            const fixedStr = str.replace(reJSONparse, '$1"$2"$3');
            return JSONparse(fixedStr, error, ++attempt);
        } else {
            // 第二次解析仍然失败，返回 error 对象
            return error;
        }
    }
}

/**
 * ArrayBuffer转Blob 大于2G的做切割
 * @param {ArrayBuffer|Uint8Array} buffer 原始数据
 * @param {Object} options Blob配置
 * @returns {Blob} 返回Blob对象
 */
function ArrayBufferToBlob(buffer, options = {}) {
    if (buffer instanceof Blob) {
        return buffer;
    }
    if (buffer instanceof Uint8Array) {
        buffer = buffer.buffer;
    }
    if (!buffer.byteLength) {
        return new Blob();
    }
    if (!buffer instanceof ArrayBuffer) {
        return new Blob();
    }
    if (buffer.byteLength >= 2 * 1024 * 1024 * 1024) {
        const MAX_CHUNK_SIZE = 1024 * 1024 * 1024;
        let offset = 0;
        const blobs = [];
        while (offset < buffer.byteLength) {
            const chunkSize = Math.min(MAX_CHUNK_SIZE, buffer.byteLength - offset);
            const chunk = buffer.slice(offset, offset + chunkSize);
            blobs.push(new Blob([chunk]));
            offset += chunkSize;
        }
        return new Blob(blobs, options);
    }
    return new Blob([buffer], options);
}


/**
 * 清理冗余数据
 */
function clearRedundant() {
    chrome.tabs.query({}, function (tabs) {
        const allTabId = new Set(tabs.map(tab => tab.id));

        if (!cacheData.init) {
            // 清理 缓存数据
            let cacheDataFlag = false;
            for (let key in cacheData) {
                if (!allTabId.has(Number(key))) {
                    cacheDataFlag = true;
                    delete cacheData[key];
                }
            }
            cacheDataFlag && (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        }

        // 清理
        G.urlMap.forEach((_, key) => {
            !allTabId.has(key) && G.urlMap.delete(key);
        });

        // 清理脚本
        G.scriptList.forEach(function (scriptList) {
            scriptList.tabId.forEach(function (tabId) {
                if (!allTabId.has(tabId)) {
                    scriptList.tabId.delete(tabId);
                }
            });
        });

        if (!G.initLocalComplete) { return; }

        // 清理 declarativeNetRequest 模拟手机
        chrome.declarativeNetRequest.getSessionRules(function (rules) {
            let mobileFlag = false;
            for (let item of rules) {
                if (item.condition.tabIds) {
                    // 如果tabIds列表都不存在 则删除该条规则
                    if (!item.condition.tabIds.some(id => allTabId.has(id))) {
                        mobileFlag = true;
                        item.condition.tabIds.forEach(id => G.featMobileTabId.delete(id));
                        chrome.declarativeNetRequest.updateSessionRules({
                            removeRuleIds: [item.id]
                        });
                    }
                } else if (item.id == 1) {
                    // 清理预览视频增加的请求头
                    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] });
                }
            }
            mobileFlag && (chrome.storage.session ?? chrome.storage.local).set({ featMobileTabId: Array.from(G.featMobileTabId) });
        });
        // 清理自动下载
        let autoDownFlag = false;
        G.featAutoDownTabId.forEach(function (tabId) {
            if (!allTabId.has(tabId)) {
                autoDownFlag = true;
                G.featAutoDownTabId.delete(tabId);
            }
        });
        autoDownFlag && (chrome.storage.session ?? chrome.storage.local).set({ featAutoDownTabId: Array.from(G.featAutoDownTabId) });

        G.blockUrlSet = new Set([...G.blockUrlSet].filter(x => allTabId.has(x)));

        if (G.requestHeaders.size >= 10240) {
            G.requestHeaders.clear();
        }
    });
    // G.referer.clear();
    // G.blackList.clear();
    // G.temp.clear();
}

/**
 * 替换掉文件名中的特殊字符 包含路径
 * @param {String} str 需要处理的文本
 * @param {String} text 需要替换的文本
 * @returns {String} 返回替换后的字符串
 */
function stringModify(str, text) {
    if (!str) { return str; }
    str = filterFileName(str, text);
    return str.replaceAll("\\", "&bsol;").replaceAll("/", "&sol;");
}

/**
 * 替换掉文件名中的特殊字符 不包含路径
 * @param {String} str 需要处理的文本
 * @param {String} text 需要替换的文本
 * @returns {String} 返回替换后的字符串
 */
function filterFileName(str, text) {
    if (!str) { return str; }
    reFilterFileName.lastIndex = 0;
    str = str.replaceAll(/\u200B/g, "").replaceAll(/\u200C/g, "").replaceAll(/\u200D/g, "");
    str = str.replace(reFilterFileName, function (match) {
        return text || {
            '<': '&lt;',
            '>': '&gt;',
            ':': '&colon;',
            '"': '&quot;',
            '|': '&vert;',
            '?': '&quest;',
            '*': '&ast;',
            '~': '_'
        }[match];
    });

    // 前后不能是 “.”
    if (str.endsWith(".")) {
        str = str + "catCatch";
    }
    if (str.startsWith(".")) {
        str = "catCatch" + str;
    }
    return str;
}

/**
 * 展平嵌套对象的函数
 * @param {Object} obj 参数对象
 * @param {String} prefix 前缀
 * @returns 嵌套对象扁平化
 */
function flattenObject(obj, prefix = '') {
    let result = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            const newKey = prefix ? `${prefix}[${key}]` : key;
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // 递归处理嵌套对象
                Object.assign(result, flattenObject(value, newKey));
            } else {
                // 处理基本类型和数组
                result[newKey] = value;
            }
        }
    }
    return result;
}

/**
 * 发送数据到本地
 * @param {String} action 发送类型
 * @param {Object|Srting} data 发送的数据
 * @param {Number} tabId 发送数据的标签页ID
 */
function send2local(action, data, tabId = 0) {
    return new Promise((resolve, reject) => {

        // 请求方式
        const option = { method: G.send2localMethod };

        // 处理替换模板
        let body = G.send2localBody;
        // 处理 addKey 请求
        if (action == 'addKey' || typeof data === 'string') {
            body = G.send2localBody.replaceAll('${data}', `"${data}"`);
            data = { tabId: tabId };
        }

        data.action = action;
        let postData = templates(body, data);

        // 转为对象
        postData = JSONparse(postData, { action, data, tabId });

        try {
            // 处理URL中的模板字符串并检查合法性
            let send2localURL = templates(G.send2localURL, data);
            send2localURL = new URL(send2localURL);

            // GET请求拼接参数
            if (option.method === 'GET') {
                const flattenedObj = flattenObject(postData);
                const urlParams = new URLSearchParams(flattenedObj);
                send2localURL.search = send2localURL.search
                    ? `${send2localURL.search}&${urlParams}`
                    : `?${urlParams}`;
            }
            // 非GET请求处理不同Content-Type
            else {
                const contentType = {
                    0: 'application/json;charset=utf-8',
                    1: 'multipart/form-data',
                    2: 'application/x-www-form-urlencoded',
                    3: 'text/plain'
                }[G.send2localType];
                option.headers = { 'Content-Type': contentType };

                switch (contentType) {
                    case 'application/json;charset=utf-8':
                        option.body = JSON.stringify(postData);
                        break;
                    case 'multipart/form-data':
                        const formData = new FormData();
                        const flattened = flattenObject(postData);
                        Object.entries(flattened).forEach(([key, value]) => {
                            formData.append(key, value);
                        });
                        option.body = formData;
                        delete option.headers['Content-Type']; // 浏览器自动生成boundary
                        break;
                    case 'application/x-www-form-urlencoded':
                        const flattenedObj = flattenObject(postData);
                        const urlParams = new URLSearchParams(flattenedObj);
                        option.body = urlParams.toString();
                        break;
                    case 'text/plain':
                        option.body = typeof postData === 'object'
                            ? JSON.stringify(postData)
                            : String(postData);
                        break;
                    default:
                        option.body = JSON.stringify(postData);
                        break;
                }
            }

            send2localURL = send2localURL.toString();
            fetch(send2localURL, option)
                .then(response => resolve(response))
                .catch(error => reject(error));
        } catch (e) {
            reject(e);
        }
    });
}

function isDamnUrl(url) {
    for (let key in G.damnUrl) {
        G.damnUrl[key].lastIndex = 0;
        if (G.damnUrl[key].test(url)) {
            return true;
        }
    }
    return false;
}

/**
 * 判断url是否在屏蔽网址中
 * @param {String} url 
 * @returns {Boolean}
 */
function isLockUrl(url) {
    for (let key in G.blockUrl) {
        if (!G.blockUrl[key].state) { continue; }
        G.blockUrl[key].url.lastIndex = 0;
        if (G.blockUrl[key].url.test(url)) {
            return true;
        }
    }
    return false;
}

/**
 * 关闭标签页 如果tabId为0 则关闭当前标签
 * 当前只有一个标签页面 创建新标签页 再关闭
 * @param {Number|Array} tabId 
 */
function closeTab(tabId = 0) {
    chrome.tabs.query({}, async function (tabs) {
        if (tabs.length === 1) {
            await chrome.tabs.create({ url: 'chrome://newtab' });
            tabId ? chrome.tabs.remove(tabId) : window.close();
        } else {
            tabId ? chrome.tabs.remove(tabId) : window.close();
        }
    });
}

/**
 * 打开解析器
 * @param {Object} data 资源对象
 * @param {Object} options 选项
 */
function openParser(data, options = {}) {
    chrome.tabs.get(G.tabId, function (tab) {
        const url = `/${data.parsing ? data.parsing : "m3u8"}.html?${new URLSearchParams({
            url: data.url,
            title: data.title,
            filename: data.downFileName,
            tabid: data.tabId == -1 ? G.tabId : data.tabId,
            initiator: data.initiator,
            requestHeaders: data.requestHeaders ? JSON.stringify(data.requestHeaders) : undefined,
            ...Object.fromEntries(Object.entries(options).map(([key, value]) => [key, typeof value === 'boolean' ? 1 : value])),
        })}`
        chrome.tabs.create({
            url: url,
            index: tab.index + 1,
            active: G.isMobile || !options.autoDown
        });
    });
}
/**
 * 加载CSS样式
 */
function loadCSS() {
    if (G.isMobile) {
        const mobileCssLink = document.createElement('link');
        mobileCssLink.rel = 'stylesheet';
        mobileCssLink.type = 'text/css';
        mobileCssLink.href = 'css/mobile.css';
        document.head.appendChild(mobileCssLink);
    }
    const styleElement = document.createElement('style');
    styleElement.textContent = G.css;
    document.head.appendChild(styleElement);
}

/**
 * 修建数据 不发送不必要的数据
 * @param {Object} originalData 原始数据
 * @returns {Object} 返回处理后的数据
 */
function trimData(originalData) {
    const data = { ...originalData };
    // 不发送HTML内容
    data.html = undefined;
    data.panelHeading = undefined;
    data.urlPanel = undefined;
    data.urlPanelShow = undefined;
    return data;
}