var BG = chrome.extension.getBackgroundPage();
var tabid;
chrome.windows.getCurrent(function(wnd){
    chrome.tabs.getSelected(wnd.id, function(tab){
        tabid = tab.id;
        var id="tabid"+tab.id;
        ShowMedia(BG.mediaurls[id]);
    });
});

//html5播放器允许格式
function isPlay(ext){
    var arr = ['ogg','ogv','mp4','webm','mp3','wav','m3u8'];
    if(arr.indexOf(ext) > -1){
        return '<img src="img/play.png" class="ico" id="play">';
    }
    return '';
}

//监听数据
chrome.runtime.onMessage.addListener(function(data){
    if(data.tabid == tabid){
        $('#tempntc').hide();
        AddMedia(data);
    }
});

function ShowMedia(data){
    if(data==undefined || data.length==0){
        $('#tempntc').fadeIn(500);
        return;
    }
    for(var i = 0; i < data.length; i++){
        AddMedia(data[i]);
    }
}

function AddMedia(data){
    //网页标题做文件名
    if(localStorage['TitleName'] == "true"){
        if( data.ext ){
            DownName = data.title + '.' + data.ext;
        }else{
            DownName = data.title;
        }
        
    }else{
        DownName = data.name;
    }
    
    //截取文件名长度
    fullname = data.name;
    if(fullname.length >= 50){
        fullname = fullname.replace(/\.[^.\/]+$/, "");
        name = fullname.substr(0,22) + '...' +fullname.substr(-20)+ '.' + data.ext;
    }else{
        name = fullname;
    }
    
    //添加html
    /*
        <div class="panel panel-default">
            <div class="panel-heading">
                <span></span>
                <img src="img/download.png" class="ico" id="download" />
                <img src="img/play.png" class="ico" id="play" />
                <img src="img/copy.png" class="ico" id="copy" />
                <span class="size">
                </span>
            </div>
            <div class="url">
                <a href="" target="_blank" download=""></a>
            </div>
        </div>
    */
    if( data.type == 'application/octet-stream' ){
        data.size = '[stream]';
    }
    var html = '<div class="panel panel-default"><div class="panel-heading">';
    html += '<span>'+name+'</span>';
    html += '<img src="img/download.png" class="ico" id="download">';
    html += isPlay(data.ext);
    html += '<img src="img/copy.png" class="ico" id="copy">';
    html += '<span class="size">'+data.size+'</span>';
    html += '</div><div class="url"><a href="'+data.url+'" target="_blank" download="'+DownName+'">'+data.url+'</a></div></div>';
    $('#medialist').append(html);
    
    //显示完整地址
    $('#medialist .panel-heading').off().on('click',function(){
        id = $(this).next();
        $(id).toggle();
    });
    
    //复制
    $('#medialist #copy').off().on('click',function(){
        url = $(this).parents().find('.url a').attr('href');
        var text = $('<input id="copy_tmp" value="'+url+'" />');
        $('body').append(text);
        text.select();
        document.execCommand('Copy');
        $('#copy_tmp').remove();
        $('#tempntc').html('已复制到剪贴板').fadeIn(500).delay(500).fadeOut(500);
        return false;
    });
    
    //下载
    $('#medialist #download').off().on('click',function(){
        id = $(this).parents().find('.url a');
        var theEvent = document.createEvent("MouseEvent");
        theEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        $(id)[0].dispatchEvent(theEvent);
        return false;
    });
    
    //播放
    $('#medialist #play').off().on('click',function(){ 
        url = $(this).parents().find('.url a').attr('href');
        $('video').attr('src',url);
        $('#player').show();
        
        //播放关闭按钮
        $('#CloseBtn').bind("click", function(){
            $('video').attr('src','');
            $('#player').hide();
            return false;
        });
        return false;
    });
}