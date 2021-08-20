//正则
var EXTINF = new RegExp("#EXTINF:(.*),");

//获取m3u8_url参数
var results = new RegExp('[\?]m3u8_url=([^\n]*)').exec(window.location.href);
var url = results[1];

//获取m3u8的参数
results = new RegExp('\\.m3u8\\?([^\n]*)').exec(url);
if(results){
    var m3u8_arg = results[1];
}
$('#m3u8_url').html(url);

//获取url内容
var html = $.ajax({url:url,async:false}).responseText;
html = html.split("\n");

//基本文件目录
var getManifestUrlBase = function(URL_flag) {
    var url_decode = decodeURIComponent(url);
    if(!URL_flag){
        url_decode = url;
    }
	url_decode = url_decode.split("?")[0];
	var parts = url_decode.split('/');
	parts.pop();
	return parts.join('/') + '/';
}
//根目录
var getManifestUrlRoot = function() {
	var Path = url.split("/");
	return Path[0] + '//' + Path[2];
}
var BasePath = getManifestUrlBase(true);
var RootPath = getManifestUrlRoot();

//验证是否远程文件
var isRelative = function(url) {
	var r = new RegExp('^(?:[a-z]+:)?//', 'i');
	return !r.test(url);
}

//写入textarea
var add_textarea = function(str){
    //ts文件加参数
    results = new RegExp('[\?]([^\n]*)').exec(str);
    if(!results && m3u8_arg){
        str = str + '?' +m3u8_arg;
    }
	link = $('#html').text() + str + "\n";
	$('#html').text(link);
}

var add_next_m3u8 = function(str){
	$('#next_m3u8').append('<p><a href="/m3u8.html?m3u8_url='+str+'">'+str+'</a></p>');
}

//链接列表
var show_list = function(str){
	if(str === undefined){ str = '' }
	var num = 0;
	$('#html').text('');
	for(i in html) {
		var link = html[i];
		
		//密钥
		if (link.indexOf('URI=') != -1) {
			var re = /URI="(.*)"/.exec(link);
			$('#key').html('，该媒体已加密，请注意下载key文件');
			$('.ffmpeg').html('ffmpeg合并ts命令: ffmpeg -allowed_extensions ALL -i xxx.m3u8 -vcodec copy -acodec copy xxx.mp4');
            
			KeyURL = re[1];
			if (isRelative(KeyURL)) {
				if (KeyURL[0] == '/'){
					KeyURL = RootPath + KeyURL;
				}else{
					KeyURL = BasePath + KeyURL;
				}
			}
            
			add_textarea(str + KeyURL);
		}
		
		//ts文件
		if (link.indexOf('#') == -1 && link !== '') {
			if (isRelative(link)) {
				if (link[0] == '/'){
					link = RootPath + link;
				}else{
					link = BasePath + link;
				}
			}
			$('#num').html(++num);
			add_textarea(str + link);
			
			//判断是否m3u8
			if (link.indexOf('.m3u8') != -1) {
				$('#textarea').hide();
				$('button').hide();
				$('#next_m3u8_tr').show();
				add_next_m3u8(link);
			}
		}
	}
}
show_list();

//文本 格式 按钮
$('#Text').bind("click", function(){
	show_list();
});

//wget 格式 按钮
$('#WgetText').bind("click", function(){
	show_list('wget ');
});

//aria2 格式 按钮
$('#Aria2Text').bind("click", function(){
	show_list('aria2c -c -s10 -x10 ');
});

//下载 文本格式 按钮
$('#DownText').bind("click", function(){
	show_list();
	var txt = $('#html').html().toString();
	txt = encodeURIComponent(txt);
	var a = document.createElement('a');
	a.href = "data:application/json," + txt;
	a.setAttribute('download', 'm3u8.txt');
	a.dispatchEvent(new MouseEvent('click'));
});

//UrlDecode编码 按钮
$('#UrlDecode').bind("click", function(){
    BasePath = getManifestUrlBase(false);
	show_list();
});

//刷新还原 按钮
$('#Refresh').bind("click", function(){
    BasePath = getManifestUrlBase(true);
	show_list();
});