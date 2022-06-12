//获取m3u8_url
var m3u8_url = new RegExp("[?]m3u8_url=([^\n]*)").exec(window.location.href)[1];

//获取m3u8参数
var m3u8_arg = new RegExp("\\.m3u8\\?([^\n]*)").exec(m3u8_url);
if (m3u8_arg) {
    m3u8_arg = m3u8_arg[1];
}

$("#m3u8_url").attr("href", m3u8_url).html(m3u8_url)

var BasePath;
var RootPath;
var m3u8_content;
var tsLists = [];    //储存所有ts链接
var errorTsLists = [];   // 下载错误的ts链接
var m3u8FileName = GetFileName(m3u8_url);
var m3u8KEY = "";
var m3u8IV = "";

function GetFileName(url) {
    url = url.toLowerCase();
    let str = url.split("?");
    str = str[0].split("/");
    str = str[str.length - 1].split("#");
    return str[0].split(".")[0];
}
//获取url内容
$.ajax({
    url: m3u8_url, async: true, success: function (result) {
        $("#m3u8").show();
        BasePath = getManifestUrlBase();
        RootPath = getManifestUrlRoot();
        m3u8_content = result;
        show_list();
    }, error: function (result) {
        console.log(result);
        $("#loading").show();
        $("#m3u8").hide();
        $("#loading .optionBox").html(`获取m3u8内容失败, 请尝试手动下载 <a href="${m3u8_url}">${m3u8_url}</a>`);
    }
});

//基本文件目录
function getManifestUrlBase(decode = true) {
    let url_decode = decode ? decodeURIComponent(m3u8_url) : m3u8_url;
    url_decode = url_decode.split("?")[0];
    let parts = url_decode.split("/");
    parts.pop();
    return parts.join("/") + "/";
}

//根目录
function getManifestUrlRoot() {
    let Path = m3u8_url.split("/");
    return Path[0] + "//" + Path[2];
}

//修复url路劲
function fixUrl(url) {
    if (/^[\w]+:\/\/.+/i.test(url)) {
        return url;
    }
    if (url[0] == "/") {
        return RootPath + url;
    }
    return BasePath + url;
}
function GetFile(str) {
    str = str.split("?")[0];
    return str.split("/").pop();
}

function show_list(format = "") {
    let count = 0;
    tsCount = 0;
    let ExistKey = false;
    let textarea = "";
    tsList = [];
    $("#media_file").val("");
    $("#tips").html("");
    let m3u8_split = m3u8_content.split("\n");
    for (let line of m3u8_split) {
        if (line == "\n" || line == "\r" || line == "" || line == " ") {
            continue;
        }
        //重要信息
        if (line.includes("#EXT-X-MAP")) {
            ExistKey = true;
            let MapURI = /URI="(.*)"/.exec(line);
            if (MapURI && MapURI[1]) {
                MapURI = fixUrl(MapURI[1]);
                $("#tips").append('#EXT-X-MAP URI: <input type="text" value="' + MapURI + '" spellcheck="false">');
                count++; line = MapURI;
            }
        }
        if (line.includes("#EXT-X-KEY")) {
            ExistKey = true;
            let KeyURL = /URI="([^"]*)"/.exec(line);
            if (KeyURL && KeyURL[1]) {
                KeyURL = fixUrl(KeyURL[1]);
                $("#tips").append('#EXT-X-KEY URI: <input type="text" value="' + KeyURL + '" spellcheck="false">');
                count++; line = KeyURL;
                // 下载Key文件
                $.ajax({
                    url: KeyURL,
                    xhrFields: { responseType: "arraybuffer" }
                }).done(function (responseData) {
                    m3u8KEY = responseData;
                });
            }
        }
        if (line.includes("IV=") && line.includes("#EXT-X-KEY")) {
            ExistKey = true;
            let KeyIV = /IV=([^,\n]*)/.exec(line);
            if (KeyIV && KeyIV[1]) {
                m3u8IV = KeyIV[1];
                $("#tips").append('#IV: <input type="text" value="' + KeyIV[1] + '" spellcheck="false">');
            }
        }

        //ts文件
        if (!line.includes("#")) {
            count++;
            line = fixUrl(line);
            //判断是否m3u8
            if (line.includes(".m3u8")) {
                $("#m3u8").hide();
                $("button").hide();
                $("#more_m3u8").show();
                $("#next_m3u8").append(
                    '<p><a href="/m3u8.html?m3u8_url=' + line + '">' + GetFile(line) + "</a></p>"
                );
                continue;
            }
            //格式化
            line = line.replace("\n", "").replace("\r", "");
            let results = new RegExp("[?]([^\n]*)").exec(line);
            if (!results && m3u8_arg) {
                line = line + "?" + m3u8_arg;
            }
            tsLists.push(line);
            if (format != "") {
                line = format.replace("$url$", line);
            }
            textarea = textarea + line + "\n";
        }
    }
    $("#media_file").val(textarea);
    if (ExistKey) { $("#tips").show(); }
    $("#count").html("共" + count + "个文件");
    $('#loading').hide();
}

//格式化
$("#format").click(function () {
    let formatStr = $("#formatStr").val();
    show_list(formatStr);
});
//下载 文本格式 按钮
$("#DownText").click(function () {
    var txt = $("#media_file").val();
    txt = encodeURIComponent(txt);
    chrome.downloads.download({
        url: "data:text/plain," + txt
    });
});
//UrlDecode编码 按钮
$("#UrlDecode").click(function () {
    BasePath = getManifestUrlBase(false);
    show_list();
});
//刷新还原 按钮
$("#Refresh").click(function () {
    BasePath = getManifestUrlBase();
    $("#formatStr").val('wget "$url$"');
    show_list();
});
//把远程文件替换成本地文件
$("#DownFixm3u8").click(function () {
    $("#media_file").val("");
    let textarea = "";
    let m3u8_split = m3u8_content.split("\n");
    for (let line of m3u8_split) {
        if (line.includes("URI=")) {
            let KeyURL = /URI="(.*)"/.exec(line);
            if (KeyURL && KeyURL[1]) {
                KeyURL = GetFile(KeyURL[1]);
                line = line.replace(/URI="(.*)"/, 'URI="' + KeyURL + '"');
            }
        }
        if (!line.includes("#")) {
            line = GetFile(line);
        }
        textarea = textarea + line + "\n";
    }
    $("#media_file").val(textarea);
});

// 下载m3u8并合并
$("#AllDownload").click(function () {
    $("#progress").html(`等待下载中...`);
    let tsList = tsLists;
    let tsCount = tsList.length;
    let tsIndex = 0;
    let tsThread = 10;
    let tsBuffer = [];
    errorTsList = [];
    let isEncrypted = false;
    const decryptor = new AESDecryptor();

    if(m3u8KEY != ""){
        decryptor.expandKey(m3u8KEY);
        isEncrypted = true;
    }
    let tsInterval = setInterval(function () {
        if (tsIndex >= tsCount) {
            clearInterval(tsInterval);
            downloadTs(tsBuffer);
        }
        if (tsThread > 0 && tsIndex < tsCount) {
            tsIndex++;
            tsThread--;
            $.ajax({
                url: tsList[tsIndex],
                xhrFields: { responseType: "arraybuffer" }
            }).fail(function () {
                errorTsList.push(tsList[tsIndex]);
            }).done(function (responseData) {
                if(isEncrypted){
                    let iv = m3u8IV || new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, tsIndex]);
                    responseData = decryptor.decrypt(responseData, 0, iv.buffer || iv, true);
                }
                tsBuffer.push(responseData);
                $("#progress").html(`${tsIndex}/${tsCount}`);
                tsThread++;
            });
        }
    }, 100);
});
function downloadTs(tsBuffer) {
    let fileBlob = new Blob(tsBuffer, { type: "video/mp4" });
    chrome.downloads.download({
        url: URL.createObjectURL(fileBlob),
        filename: `${m3u8FileName}.mp4`
    });
}