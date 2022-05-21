//正则
var EXTINF = new RegExp("#EXTINF:(.*),");

//获取m3u8_url参数
var results = new RegExp("[?]m3u8_url=([^\n]*)").exec(window.location.href);
var url = results[1];

//获取m3u8的参数
results = new RegExp("\\.m3u8\\?([^\n]*)").exec(url);
if (results) {
	var m3u8_arg = results[1];
}
$("#m3u8_url").attr("href", url).html(url)

//获取url内容
var html = $.ajax({ url: url, async: false }).responseText;
html = html.split("\n");

//基本文件目录
function getManifestUrlBase(URL_flag) {
	let url_decode = URL_flag ? decodeURIComponent(url) : url;
	url_decode = url_decode.split("?")[0];
	let parts = url_decode.split("/");
	parts.pop();
	return parts.join("/") + "/";
}
//根目录
function getManifestUrlRoot() {
	var Path = url.split("/");
	return Path[0] + "//" + Path[2];
};
var BasePath = getManifestUrlBase(true);
var RootPath = getManifestUrlRoot();

//验证是否远程文件
function isRelative(url) {
	var r = new RegExp("^(?:[a-z]+:)?//", "i");
	return !r.test(url);
}

//写入textarea
function add_textarea(str) {
	//ts文件加参数
	results = new RegExp("[?]([^\n]*)").exec(str);
	if (!results && m3u8_arg) {
		str = str + "?" + m3u8_arg;
	}
	link = $("#media_file").val() + str + "\n";
	$("#media_file").val(link);
}

function add_next_m3u8(link) {
	$("#next_m3u8").append(
		'<p><a href="/m3u8.html?m3u8_url=' + link + '">' + link + "</a></p>"
	);
}

//链接列表
function show_list(format) {
	if (format === undefined) {
		format = "";
	}
	var count = 0;
	var KeyURL = "";
	$("#media_file").val("");
	for (let link of html) {
		//密钥
		if (link.indexOf("URI=") != -1) {
			var re = /URI="(.*)"/.exec(link);

			KeyURL = re[1];
			if (isRelative(KeyURL)) {
				if (KeyURL[0] == "/") {
					KeyURL = RootPath + KeyURL;
				} else {
					KeyURL = BasePath + KeyURL;
				}
			}
		}

		//ts文件
		if (link.indexOf("#") == -1 && link !== "" && link !== " " && link !== "\n" && link !== "\r") {
			if (isRelative(link)) {
				if (link[0] == "/") {
					link = RootPath + link;
				} else {
					link = BasePath + link;
				}
			}
			count++;
			//判断是否m3u8
			if (link.indexOf(".m3u8") != -1) {
				$("#m3u8").hide();
				$("button").hide();
				$("#more_m3u8").show();
				add_next_m3u8(link);
				continue;
			}
			link = link.replace("\n", '');
			link = link.replace("\r", '');
			if (format != "") {
				link = format.replace("$url$", link);
			}
			add_textarea(link);
		}
	}
	$("#count").html("共" + count + "个文件");
	if (KeyURL !== "") {
		$(".keyUrl").show();
		$("#keyUrl").attr("href", KeyURL).html(KeyURL);
	}
	$('#loading').hide();
}
show_list();

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
$("#Downm3u8").click(function () {
	chrome.downloads.download({ url: url });
});

//UrlDecode编码 按钮
$("#UrlDecode").click(function () {
	BasePath = getManifestUrlBase(false);
	show_list();
});

//刷新还原 按钮
$("#Refresh").click(function () {
	BasePath = getManifestUrlBase(true);
	$("#formatStr").val('wget "$url$"');
	show_list();
});
