chrome.storage.local.get('MediaData', function(items){
    for(var i = 0; i < items.MediaData.length; i++){
        AddMedia(items.MediaData[i]);
    }
    UItoggle();
});

//监听数据
chrome.runtime.onMessage.addListener(function(MediaData, sender, sendResponse){
    AddMedia(MediaData);
    UItoggle();
});

function AddMedia(data){
    //文件名是否为空
    if(data.name == undefined || data.name == ''){
        data.name = data.title + '.' + data.ext;
    }

    //截取文件名长度
    trimName = data.name;
    if(data.name.length >= 43){
        trimName = data.name.replace(/\.[^.\/]+$/, "");
        trimName = trimName.substr(0,13) + '...' + trimName.substr(-20)+ '.' + data.ext;
    }

    //添加html
    /*
        <div class="panel panel-default">
            <div class="panel-heading">
                <span></span>
                <input type="checkbox" class="DownCheck" checked="true"/>
                <img src="img/download.png" class="ico" id="download" />
                <img src="img/play.png" class="ico" id="play" />
                <img src="img/copy.png" class="ico" id="copy" />
                <span class="size">
                </span>
            </div>
            <div class="url">来自: ...<br> url: ...<br>
                <a href="" target="_blank" download=""></a>
            </div>
        </div>
    */
    if( data.type == 'application/octet-stream'){
        data.size = '[stream]';
    }
    if(data.size == "0MB"){
        data.size = '';
    }
    var html = '<div class="panel"><div class="panel-heading">';
    html += '<span>' + trimName + '</span>';
    if(data.ext == 'm3u8'){
        html += '<img src="img/parsing.png" class="ico" id="m3u8">';
    }
    html += '<input type="checkbox" class="DownCheck" checked="true"/>';
    html += '<img src="img/download.png" class="ico" id="download">';
    if( isPlay(data.ext) ){
        html += '<img src="img/play.png" class="ico" id="play">';
    }
    html += '<img src="img/copy.png" class="ico" id="copy">';
    html += '<span class="size">' + data.size + '</span>';
    html += '</div><div class="url">';
    if(data.webInfo){
        html += '来自: '+data.webInfo.title+'<br>URL: ' + data.webInfo.url+'<br>';
    }
    html += '<a href="' + data.url + '" target="_blank" download="' + data.DownFileName + '">' + data.url + '</a></div>';
    html += '</div>';
    $('#medialist').append(html);

    //显示完整地址
    $('#medialist .panel-heading').off().on('click',function(){
        id = $(this).next();
        $(id).toggle();
        return true;
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
        var url = $(this).parents().find('.url a').attr('href');
        var fileName = $(this).parents().find('.url a').attr('download');
        chrome.downloads.download({
            url: url,
            filename: fileName
        });
        return false;
    });
    //播放
    $('#medialist #play').off().on('click',function(){
        var url = $(this).parents().find('.url a').attr('href');
        $('#player').appendTo(  $(this).parent().parent() );
        $('video').attr('src',url);
        $('#player').show();
       
       //播放关闭按钮
        $('#CloseBtn').bind("click", function(){
            $('video').removeAttr('src');
            $("#player").hide();
            $('#player').appendTo('body');
            return false;
        });
        return false;
    });
	//解析m3u8
    $('#medialist #m3u8').off().on('click',function(){ 
		var url = $(this).parents().find('.url a').attr('href');
		chrome.tabs.create({ url: '/m3u8.html?m3u8_url='+url });
		return false;
    });
    //多选框
    $('.DownCheck').off().on('click',function(w){
        //防止显示网完整地址
        id = $(this).parent().next();
        $(id).toggle();
        return true;
    });
    //下载选中文件
    $('#DownFile').off().on('click',function(){  
        var TempNum = 0;
        var DownFlage = true;
        $('#medialist input').each(function(){
           if( $(this).prop('checked') ){
            TempNum++;
           }
        });
        if(TempNum >= 20){
            if(!confirm("共"+TempNum+"个文件，是否确认下载?")){
                DownFlage = false;
            }
        }
        if(DownFlage){
            $('#medialist input').each(function(){
                if( $(this).prop('checked') ){
                    $(this).siblings('#download').click();
                }
            });
        }
        return false;
    });
    //复制选中文件
    $('#AllCopy').off().on('click',function(){
        var text = $('<textarea id="copy_tmp"></textarea>');
        var url = '';
        $('#medialist input').each(function(){
           if( $(this).prop('checked') ){
               url += $(this).parents().find('.url a').attr('href') + "\n";
           }
        });
        $(text).val(url);
        $('body').append(text);
        text.select();
        document.execCommand('Copy');
        $('#copy_tmp').remove();
        $('#tempntc').html('已复制到剪贴板').fadeIn(500).delay(500).fadeOut(500);
        return false;
    });
    //全选
    $('#AllSelect').off().on('click',function(){
        $('#medialist input').each(function(){
           $(this).attr("checked",'true');
        });
        return false;
    });
    //反选
    $('#ReSelect').off().on('click',function(){
        $('#medialist input').each(function(){
           if( $(this).prop('checked') ){
               $(this).attr('checked',false);
           }else{
               $(this).attr('checked',true);
           }
        });
        return false;
    });
    //清空
    $('#Clear').off().on('click',function(){
        chrome.storage.local.clear("MediaData");
        chrome.action.setBadgeText({text: ''});
        chrome.action.setTitle({title: "还没闻到味儿~"});
        location.reload();
        return false;
    });
    //到页面底部
    $("#ToBottom").off().on('click',function(){
        $(document).scrollTop($(document).height());
    });
}

//html5播放器允许格式
function isPlay(ext){
    var arr = ['ogg','ogv','mp4','webm','mp3','wav','flv','m4a'];
    if(arr.indexOf(ext) > -1){
        return true;
    }
    return false;
}

//取消提示 3个以上显示操作按钮
function UItoggle(){
    var length = $('#medialist #download').length;
    if( length >= 20 ){
        $('#ToBottom').show();
    }
    if( length >= 3 ){
        $('#down').show();
        $('.DownCheck').show();
    }
    if( length > 0 ){
        $('#tempntc').hide();
    }
}

