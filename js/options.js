//////////////////////初始化//////////////////////
chrome.storage.sync.get("Ext", function(items) {
    for(var i = 0; i < items.Ext.length; i++){
        $('#ExtTd').append(GethtmlExt(items.Ext[i].ext,items.Ext[i].size));
    }
    //删除格式
    $('#RemoveExt*').bind("click", function(){
        $(this).parent().remove();
        SaveExt();
    });
    //失去焦点自动保存
    $('.ext').blur(function(){
        SaveExt();
    });
});

chrome.storage.sync.get("Debug", function(items) {
    if(items.Debug){
        $('#Debug').attr("checked","checked");
    }
});

chrome.storage.sync.get("TitleName", function(items) {
    if(items.TitleName){
        $('#TitleName').attr("checked","checked");
    }
});

chrome.storage.sync.get("AutoClear", function(items) {
    $('#AutoClear').val(items.AutoClear);
});

/////////////////////事件绑定/////////////////////
//新增格式
$('#AddExt').bind("click", function(){
    $('#ExtTd').append(GethtmlExt());
    
    //删除
    $('#RemoveExt*').bind("click", function(){
        $(this).parent().remove();
        SaveExt();
    });
    //失去焦点自动保存
    $('.ext').blur(function(){
        SaveExt();
    });
});

//获得html_格式
function GethtmlExt(){
    var ext = arguments[0] ? arguments[0]: '';
    var size = arguments[1] ? arguments[1]: '0';
    return (
        '<tr><td><input type="text" class="ext" placeholder="扩展名" value="' +
        ext +
        '"></td><td class="TdSize"><input type="number" class="size" placeholder="大小限制" value="' +
        size +
        '"></td><td class="SizeButton">kb</td><td id="RemoveExt" class="RemoveButton">X</td></tr>'
    );
}

//调试模式
$('#Debug').bind("click", function(){
    chrome.storage.sync.set({"Debug": $(this).prop("checked")});
});

//使用网页标题做文件名
$('#TitleName').bind("click", function(){
    chrome.storage.sync.set({"TitleName": $(this).prop("checked")});
});

//失去焦点 保存自动清理数
$('#AutoClear').blur(function(){
    chrome.storage.sync.set({"AutoClear": $(this).val()});
});

//重置
$('#ResetExt').bind("click", function(){
    chrome.storage.sync.set({"Ext": defaultExt});
    chrome.storage.sync.set({"Debug": defaultDebug});
    chrome.storage.sync.set({"TitleName": defaultTitleName});
    chrome.storage.sync.set({"AutoClear": defaultAutoClear});
    location.reload();
});

//提示
function Prompt(str,sec){
    $('#TempntcText').html(str);
    $('.tempntc').fadeIn(500).delay(sec).fadeOut(500);
}

//保存
function SaveExt(){
    var Ext = new Array();
    $('#ExtTd tr').each(function(){
        Tempext = $(this).find('.ext').val();
        if(Tempext == null || Tempext == undefined || Tempext == ''){
            return true;
        }
        Tempsize = $(this).find('.size').val();
        if(Tempsize == null || Tempsize == undefined || Tempsize == ''){
            Tempsize = 0;
            $(this).find('.size').val('0');
        }
        Ext.push({ext:Tempext,size:Tempsize});
    });
    console.log(Ext);
    chrome.storage.sync.set({"Ext": Ext});
    location.reload();
}