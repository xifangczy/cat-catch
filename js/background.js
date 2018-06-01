//初始化
if(typeof mediaurls==='undefined'){
    var mediaurls = new Array();
}
var Exts = new Array();

//通配符判断
var META_CHARACTERS = ['$', '^', '[', ']', '(', ')', '{', '}', '|', '+', '.', '\\'];
function wildcard(pattern,word){
    var result =  "^";
    for(var i=0;i<pattern.length;i++){
        var ch = pattern.charAt(i);
        if(metaSearch(ch)){
            result += "\\" + ch;
            continue;
        }else{
            switch (ch) {
                case '*':
                    result += ".*";
                    break;
                case '?':
                    result += ".{0,1}";
                    break;
                default:
                    result += ch;
            }
        }
    }
    result += "$";
    if(word.match(result) == null){
        return false;   
    }
    return true;
}
function metaSearch(ch){
    for(var metaCh in META_CHARACTERS){
        if(ch == metaCh ){
            return true;
        }
    }
    return false;
}

//响应开始(用来检测媒体文件地址大小等信息)
chrome.webRequest.onResponseStarted.addListener(
function(data){
	findMedia(data);
},
{urls: ["http://*/*", "https://*/*"]},
["responseHeaders"]);

var title = 'Null';  //网页标题

//开始判断
function findMedia(data){
	if(data.tabId==-1)//不是标签的请求则返回
		return;	
	var size = getHeaderValue("content-length", data);//获得文件大小
    var name = GetFileName(data.url);//获得文件名
    var ext = GetExt(name);//获得扩展名
    var contentType = getHeaderValue("content-type", data);
    /* 获得标题 */
    chrome.tabs.get(data.tabId, function(info){
        title = info.title;
    });
    //调试模式
    if(localStorage['Debug'] == "true"){
        console.log({name:name,url:data.url,size:size,ext:ext,type:contentType,tabid:data.tabId,title:title,all:data});
    }
    //得到设置的扩展名
    Exts = JSON.parse(localStorage['Ext']);

    var filter = false;//过滤器开关

    //判断后缀名
    for(var i = 0; i < Exts.length; i++){
        data_ext = Exts[i].ext.toLowerCase();
        if(data_ext.indexOf(ext)== -1){
            continue;
        }else if(Exts[i].size == 0 || size >= Exts[i].size*1024 || size == null){
            filter = true;
            break;
        }else{
            return;
        }
    }

    //判断MIME类型
    if(contentType != null && !filter){
        var Type = JSON.parse(localStorage['Type']);
        for(i = 0; i < Type.length; i++){
            mime_Type = Type[i].Type.toLowerCase();
            if( !wildcard(mime_Type, contentType) ){
                continue;
            }else{
                filter = true;
                break;
            }
        }
    }

    //查找附件
    var Disposition = getHeaderValue('Content-Disposition', data);
    if(Disposition){
        // var res = Disposition.match(/^(inline|attachment);\s*filename="?(.*?)"?\s*;?$/i);
        var res = Disposition.match(/filename="(.*?)"/);
        if(res && res[1]){
            name = decodeURIComponent(res[1]);    //编码
            name = GetFileName(name);
            ext  = GetExt(name);
            for(var i = 0; i < Exts.length; i++){
                data_ext = Exts[i].ext.toLowerCase();
                if(data_ext.indexOf(ext) != -1){
                    filter = true;
                    break;
                }
            }
        }
    }
    
    if(filter){
        var url = data.url;
        var dealurl = url;
        var id="tabid"+data.tabId;//记录当前请求所属标签的id
        //去除参数
        var repeatReg = new RegExp(localStorage['repeatReg'],'g');
        if(localStorage['repeat'] == "true"){
            dealurl = dealurl.replace(repeatReg,"");
        }
        if(mediaurls[id]==undefined)
            mediaurls[id]=[];
        for (var j = 0; j<mediaurls[id].length; j++) {
            var existUrl = mediaurls[id][j].url;
            //去除参数
            if(localStorage['repeat'] == "true"){
                existUrl = existUrl.replace(repeatReg,"");
            }
            if(existUrl==dealurl)//如果已有相同url则不重复记录
                return;
        }
        size=Math.round( 100 * size / 1024 / 1024 ) / 100 +"MB";
        var info={name:name,url:url,size:size,ext:ext,type:contentType,tabid:data.tabId,title:title};
        mediaurls[id].push(info);
        chrome.browserAction.setBadgeText({text:mediaurls[id].length.toString(),tabId:data.tabId});//数字提示
        chrome.browserAction.setTitle({title:"抓到"+mediaurls[id].length.toString()+"条资源",tabId:data.tabId});//文字提示
        chrome.runtime.sendMessage(info);//发送数据给popup
    }
}
function GetFileName(url){
	var str = url.split("?");//url按？分开
	str = str[0].split( "/" );//按/分开
	str = str[str.length-1].split( "#" );//按#分开
	return str[0].toLowerCase();//得到带后缀的名字
}
function GetExt(FileName){
	var str=FileName.split(".");
    if(str.length == 1){
        return null;
    }
	var ext = str[str.length-1];
    ext = ext.match(/[0-9a-zA-Z]*/);
    return ext[0].toLowerCase();
}
function getHeaderValue(name, data){
	name = name.toLowerCase();
	for (var i = 0; i<data.responseHeaders.length; i++) {
		if (data.responseHeaders[i].name.toLowerCase() == name) {
			return data.responseHeaders[i].value.toLowerCase();
		}
	}
	return null;
}

//标签更新，清除该标签之前记录
chrome.tabs.onUpdated.addListener( function( tabId, changeInfo ){
	if(changeInfo.status=="loading")//在载入之前清除之前记录
	{
		var id="tabid"+tabId;//记录当前请求所属标签的id
		if(mediaurls[id])
			mediaurls[id]=[];
    }
});

//标签关闭，清除该标签之前记录
chrome.tabs.onRemoved.addListener( function( tabId ){
	var id="tabid"+tabId;//记录当前请求所属标签的id
	if(mediaurls[id])
		delete mediaurls[id];
} );


