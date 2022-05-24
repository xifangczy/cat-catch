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
//获取url内容
$.ajax({
    url: m3u8_url, async: true, success: function (result) {
        $("#m3u8").show();
        BasePath = getManifestUrlBase();
        RootPath = getManifestUrlRoot();
        m3u8_content = result;
        show_list();
    }, error: function () {
        $("#loading").show();
        $("#m3u8").hide();
        $("#loading .optionBox").html("获取m3u8内容失败");
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
    let ExistKey = false;
    let textarea = "";
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
            let MapURI = /URI="(.*)"/.exec(line)[1];
            MapURI = fixUrl(MapURI);
            $("#tips").append('#EXT-X-MAP URI: <input type="text" value="' + MapURI + '" spellcheck="false">');
            count++; line = MapURI;
        }
        if (line.includes("#EXT-X-KEY")) {
            ExistKey = true;
            let KeyURL = /URI="([^"]*)"/.exec(line)[1];
            KeyURL = fixUrl(KeyURL);
            $("#tips").append('#EXT-X-KEY URI: <input type="text" value="' + KeyURL + '" spellcheck="false">');
            count++; line = KeyURL;
        }
        if (line.includes("IV=") && line.includes("#EXT-X-KEY")) {
            ExistKey = true;
            let KeyIV = /IV=([^,\n]*)/.exec(line)[1];
            $("#tips").append('#IV: <input type="text" value="' + KeyIV + '" spellcheck="false">');
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
            if (format != "") {
                line = format.replace("$url$", line);
            }
            let results = new RegExp("[?]([^\n]*)").exec(line);
            if (!results && m3u8_arg) {
                line = line + "?" + m3u8_arg;
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
            let KeyURL = /URI="(.*)"/.exec(line)[1];
            KeyURL = GetFile(KeyURL);
            line = line.replace(/URI="(.*)"/, 'URI="' + KeyURL + '"');
        }
        if (!line.includes("#")) {
            line = GetFile(line);
        }
        textarea = textarea + line + "\n";
    }
    $("#media_file").val(textarea);
});