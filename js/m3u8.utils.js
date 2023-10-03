//获取m3u8参数
let _m3u8Arg = new RegExp("\\.m3u8\\?([^\n]*)").exec(_m3u8Url);
if (_m3u8Arg) {
    _m3u8Arg = _m3u8Arg[1];
}
let _m3u8Content;   // 储存m3u8文件内容
/* m3u8 解析工具 */
const hls = new Hls({
    enableWorker: false,
    debug: false
});  // hls.js 对象
const _fragments = []; // 储存切片对象
const keyContent = new Map(); // 储存key的内容
const initData = new Map(); // 储存map的url
const decryptor = new AESDecryptor(); // 解密工具 来自hls.js 分离出来的
let skipDecrypt = false; // 是否跳过解密
/* 下载相关 */
let downId = 0; // 下载id
let stopDownload = false; // 停止下载flag
let fileSize = 0; // 文件大小
let downDuration = 0; // 下载媒体得时长
let downCurrentTs = 0;    // 当前进度
let downTotalTs = 0;  // 需要下载的文件数量
const tsBuffer = []; // ts内容缓存
const errorTsList = []; // 下载错误ts序号列表
let fileStream = undefined; // 流式下载文件输出流
const downSet = {};   // 下载设置
/* 录制相关 */
let recorder = false; // 开关
let recorderIndex = 0;  // 下载索引
let recorderLast = "";  // 最后下载的url
/* mp4 转码工具 */
let transmuxer = undefined;
let transmuxerStatus = false;
let transmuxerheadEncode = undefined;
/* DOM */
const $fileSize = $("#fileSize");
const $progress = $("#progress");
const $fileDuration = $("#fileDuration");
// 默认设置
const allOption = {
    thread: 32,
    mp4: false,
    onlyAudio: false,
    saveAs: false,
    skipDecrypt: false,
    StreamSaver: false,
    ffmpeg: true,
    addParam: false,
};
// 写入ts链接
function writeText(text) {
    if (typeof text == "object") {
        let url = [];
        for (let key in text) {
            url.push(text[key].url + "\n");
        }
        $("#media_file").val(url.join("\n"));
        $("#media_file").data("type", "link");
        return;
    }
    $("#media_file").val(text);
    $("#media_file").data("type", "m3u8");
}
// 获取文件名
function GetFile(str) {
    str = str.split("?")[0];
    if (str.substr(0, 5) != "data:" && str.substr(0, 4) != "skd:") {
        return str.split("/").pop();
    }
    return str;
}
// 获得不带扩展的文件名
function GetFileName(url) {
    //hiaming 增加自定义名字功能
    if ($('#customFilename').val()) {
        return $('#customFilename').val().trim();
    }
    if (G.TitleName && _title) {
        if (_title.length >= 150) {
            return _title.substring(_title.length - 150);
        }
        return _title;
    }
    url = GetFile(url);
    url = url.split(".");
    url.length > 1 && url.pop();
    url = url.join(".");
    if (url.length >= 150) {
        url = url.substring(url.length - 150);
    }
    if (url.length == 0) {
        url = "NULL";
    }
    return stringModify(url);
}
// 获取扩展名
function GetExt(url) {
    let str = url.split(".");
    if (str.length == 1) {
        return undefined;
    }
    let ext = str[str.length - 1];
    ext = ext.match(/[0-9a-zA-Z]*/);
    return ext[0].toLowerCase();
}
// 按钮状态
function buttonState(obj = "#mergeTs", state = true) {
    if (state) {
        $(obj).prop("disabled", false).removeClass("no-drop");
        return;
    }
    $(obj).prop("disabled", true).addClass("no-drop");
}
// ArrayBuffer 转 16进制字符串
function ArrayBufferToHexString(buffer) {
    let binary = "";
    let bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += ('00' + bytes[i].toString(16)).slice(-2);
    }
    return binary;
}
// ArrayBuffer 转 Base64
function ArrayBufferToBase64(buffer) {
    let binary = "";
    let bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
// Base64 转 ArrayBuffer
function Base64ToArrayBuffer(base64) {
    let binary_string = atob(base64);
    let len = binary_string.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}
// 字符串 转 ArrayBuffer
function StringToArrayBuffer(str) {
    let bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i);
    }
    return bytes.buffer;
}
// 16进制字符串 转 ArrayBuffer
function HexStringToArrayBuffer(hex) {
    let typedArray = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function (h) {
        return parseInt(h, 16)
    }));
    return typedArray.buffer
}
// 字符串 转 Uint8Array
function StringToUint8Array(str) {
    str = str.replace("0x", "");
    return new Uint8Array(HexStringToArrayBuffer(str));
}
/* 修正mp4文件显示时长 */
function fixFileDuration(data, duration) {
    // duration = parseInt(duration);
    let mvhdBoxDuration = duration * 90000;
    function getBoxDuration(data, duration, index) {
        let boxDuration = "";
        index += 16;    // 偏移量 16 为timescale
        boxDuration += data[index].toString(16);
        boxDuration += data[++index].toString(16);
        boxDuration += data[++index].toString(16);
        boxDuration += data[++index].toString(16);
        boxDuration = parseInt(boxDuration, 16);
        boxDuration *= duration;
        return boxDuration;
    }
    for (let i = 0; i < data.length; i++) {
        // mvhd
        if (data[i] == 0x6D && data[i + 1] == 0x76 && data[i + 2] == 0x68 && data[i + 3] == 0x64) {
            mvhdBoxDuration = getBoxDuration(data, duration, i);   // 获得 timescale
            data[i + 11] = 0;   //删除创建日期
            i += 20;    // mvhd 偏移20 为duration
            data[i] = (mvhdBoxDuration & 0xFF000000) >> 24;
            data[++i] = (mvhdBoxDuration & 0xFF0000) >> 16;
            data[++i] = (mvhdBoxDuration & 0xFF00) >> 8;
            data[++i] = mvhdBoxDuration & 0xFF;
            continue;
        }
        // tkhd
        if (data[i] == 0x74 && data[i + 1] == 0x6B && data[i + 2] == 0x68 && data[i + 3] == 0x64) {
            i += 24;    // tkhd 偏移24 为duration
            data[i] = (mvhdBoxDuration & 0xFF000000) >> 24;
            data[++i] = (mvhdBoxDuration & 0xFF0000) >> 16;
            data[++i] = (mvhdBoxDuration & 0xFF00) >> 8;
            data[++i] = mvhdBoxDuration & 0xFF;
            continue;
        }
        // mdhd
        if (data[i] == 0x6D && data[i + 1] == 0x64 && data[i + 2] == 0x68 && data[i + 3] == 0x64) {
            let mdhdBoxDuration = getBoxDuration(data, duration, i);   // 获得 timescale
            i += 20;    // mdhd 偏移20 为duration
            data[i] = (mdhdBoxDuration & 0xFF000000) >> 24;
            data[++i] = (mdhdBoxDuration & 0xFF0000) >> 16;
            data[++i] = (mdhdBoxDuration & 0xFF00) >> 8;
            data[++i] = mdhdBoxDuration & 0xFF;
            continue;
        }
        //  mdat 之后是媒体数据 结束头部修改
        if (data[i] == 0x6D && data[i + 1] == 0x64 && data[i + 2] == 0x61 && data[i + 3] == 0x74) {
            return data;
        }
    }
    return data;
}
function isHexKey(str) {
    return /^[0-9a-fA-F]{32}$/.test(str);
}
// m3u8文件内容加入bashUrl
function addBashUrl(baseUrl, m3u8Text) {
    let m3u8_split = m3u8Text.split("\n");
    m3u8Text = "";
    for (let key in m3u8_split) {
        if (isEmpty(m3u8_split[key])) { continue; }
        if (m3u8_split[key].includes("URI=")) {
            let KeyURL = /URI="(.*)"/.exec(m3u8_split[key]);
            if (KeyURL && KeyURL[1] && !/^[\w]+:.+/i.test(KeyURL[1])) {
                m3u8_split[key] = m3u8_split[key].replace(/URI="(.*)"/, 'URI="' + baseUrl + KeyURL[1] + '"');
            }
        }
        if (!m3u8_split[key].includes("#") && !/^[\w]+:.+/i.test(m3u8_split[key])) {
            m3u8_split[key] = baseUrl + m3u8_split[key];
        }
        m3u8Text += m3u8_split[key] + "\n";
    }
    return m3u8Text;
}