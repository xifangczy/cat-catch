var BG = chrome.extension.getBackgroundPage();
var repeatReg = new RegExp(localStorage['repeatReg'],'g');
chrome.windows.getCurrent(function(wnd){
    chrome.tabs.getSelected(wnd.id, function(tab){
        var id="tabid"+tab.id;
        ShowMedia(BG.mediaurls[id]);
    });
});
function ShowMedia(data) {
    if(data==undefined || data.length==0){
        $('#tempntc').fadeIn(500);
        return;
    }
    
    var medialist=document.all("medialist");
    for(var i = 0; i < data.length; i++){
        fullname = data[i].name;
        if(fullname.length >= 40){
            fullname = fullname.replace(/\.[^.\/]+$/, "");
            name = fullname.substr(0,13) + '...' +fullname.substr(-20)+ '.' + data[i].ext;
        }else{
            name = fullname;
        }
        if( data[i].type == "application/octet-stream" ){
            $('#medialist').append('<li class="medialistLoop" id="Media_'+i+'"><span class="number">' + (i+1) + '.</span><span>' + name +'</span><div class="Size" style="width:50px;right:40px;">[stream]</div><div class="copyblock" title="复制" style="right:20px;"></div><div class="downblock" title="下载"></div></li>');
        }else{
            $('#medialist').append('<li class="medialistLoop" id="Media_'+i+'"><span class="number">' + (i+1) + '.</span><span>' + name +'</span><div class="Size">'+data[i].size+'</div><div class="copyblock" title="复制"></div><div class="playblock" title="播放"></div><div class="downblock" title="下载"></div></li>');
        }
        $('#medialist').append('<li class="mediaDown" id="Media_'+i+'_Down"><a href="'+data[i].url+'" target="_blank" download="'+fullname+'">'+data[i].url+'</a></li>');
    }
    ///////////////绑定事件////////////////
    //复制
    $('.copyblock').bind("click", function(){
        id = '#'+$(this).parent().attr("id")+'_Down a';
        url = $(id).attr("href");
        //CopyLink(url);
        var text = $('<input id="copy" value="'+url+'" />');
        $('body').append(text);
        text.select();
        document.execCommand('Copy');
        $('#copy').remove();
        $('#tempntc').html('已复制到剪贴板').fadeIn(500).delay(500).fadeOut(500);
        return false;
    });
    //下载
    $('.downblock').bind("click", function(){
        id = '#'+$(this).parent().attr("id")+'_Down a';
        //jquery trigger 无效
        var theEvent = document.createEvent("MouseEvent");
        theEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        $(id)[0].dispatchEvent(theEvent);
        return false;
    });
    //播放
    $('.playblock').bind("click", function(){
        id = '#'+$(this).parent().attr("id")+'_Down a';
        url = $(id).attr("href");
        $('#player').empty();
        //去掉开始参数
        // url=url.replace(repeatReg,"");
        url=url.replace(/(fs|start|begin)=[0-9]+/g,"");
        //播放器所需
        url+="?";
        url=encodeURIComponent(url+"&nvhnocache=1");
        play = "<embed width='100%' height='70%' src='player/NetMediaPlayer.swf' allowfullscreen='true' allowscriptaccess='always' flashvars='autostart=true&amp;showstop=true&amp;usefullscreen=true&amp;file="+url+"' /><input id='CloseBtn' type='button' title='关闭播放器' value='关闭' />";
        $('#player').append(play);
        
        //播放关闭按钮
        $('#CloseBtn').bind("click", function(){
            $('#player').empty();
            return false;
        });
        return false;
    });
    //显示完整地址
    $('.medialistLoop').bind("click", function(){
        id = '#'+$(this).attr("id")+'_Down';
        if($(id).is(":hidden")){
            $(id).show();
        }else{
            $(id).hide();
        }
    });
}