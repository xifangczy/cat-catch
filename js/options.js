//////////////////////初始化//////////////////////
var Ext = new Array();
Ext = JSON.parse(localStorage['Ext']);
for(var i = 0; i < Ext.length; i++){
    $('#ExtTd').append(GethtmlExt(Ext[i].ext,Ext[i].size));
}

var Type = new Array();
Type = JSON.parse(localStorage['Type']);
for(var i = 0; i < Type.length; i++){
    $('#ExtTy').append(GethtmlType(Type[i].Type));
}

if(localStorage['repeat'] == "true"){
    $('#repeat').attr("checked","checked");
}

$('#repeatReg').val(localStorage['repeatReg']);

if(localStorage['Debug'] == "true"){
    $('#Debug').attr("checked","checked");
}

if(localStorage['TitleName'] == "true"){
    $('#TitleName').attr("checked","checked");
}

/////////////////////事件绑定/////////////////////
//新增格式
$('#AddExt').bind("click", function(){
    $('#ExtTd').append(GethtmlExt());
    
    //删除
    $('#RemoveExt*').bind("click", function(){
        $(this).parent().remove();
    });
});

//新增MIME类型
$('#AddType').bind("click", function(){
    $('#ExtTy').append(GethtmlType());
    
    //删除
    $('#RemoveType*').bind("click", function(){
        $(this).parent().remove();
    });
});

//获得html_格式
function GethtmlExt(){
    var ext = arguments[0] ? arguments[0]: '';
    var size = arguments[1] ? arguments[1]: '0';
    return '<tr><td><input type="text" class="ext" placeholder="扩展名" value="'+ext+'"></td><td class="TdSize"><input type="text" class="size" placeholder="大小限制" value="'+size+'"></td><td class="SizeButton">kb</td><td id="RemoveExt" class="RemoveButton">X</td></tr>';
}

//获得html_Type
function GethtmlType(){
    var Type = arguments[0] ? arguments[0]: '';
    return '<tr><td><input type="text" class="Type" placeholder="MIME类型" value="'+Type+'"></td><td id="RemoveType" class="RemoveButton">X</td></tr>';
}

//提示
function Prompt(str,sec){
    $('#TempntcText').html(str);
    $('.tempntc').fadeIn(500).delay(sec).fadeOut(500);
}

//删除格式
$('#RemoveExt*').bind("click", function(){
    $(this).parent().remove();
});

//删除类型
$('#RemoveType*').bind("click", function(){
    $(this).parent().remove();
});


//保存
$('#SaveExt').bind("click", function(){
    var Type = new Array();
    var Ext = new Array();
    var success = true;
    $('#ExtTd tr').each(function(i){
        Tempext = $(this).find('.ext').val();
        if(Tempext == null || Tempext == undefined || Tempext == ''){
            Prompt('扩展名为空',1000);
            success = false;
            return false;
        }
        
        
        Tempsize = $(this).find('.size').val();
        if(Tempsize == null || Tempsize == undefined || Tempsize == ''){
            Tempsize = 0;
            $(this).find('.size').val('0');
        }
        Ext[i] = {"ext":Tempext,"size":Tempsize};
    });
    
    $('#ExtTy tr').each(function(i){
        Tempext = $(this).find('.Type').val();
        if(Tempext == null || Tempext == undefined || Tempext == ''){
            Prompt('MIME类型为空',1000);
            success = false;
            return false;
        }
        Type[i] = {"Type":Tempext};
    });
    
    if(success){
        //转为字符串储存
        localStorage['Ext'] = JSON.stringify(Ext);
        localStorage['Type'] = JSON.stringify(Type);
        Prompt('已保存',1000);
    }
    localStorage['repeatReg'] = $('#repeatReg').val();
});

//去除重复选项
$('#repeat').bind("click", function(){
    if(!$(this).prop("checked")){
        $('#repeat').removeAttr("checked");
        localStorage['repeat'] = false;
    }else{
        $('#repeat').attr("checked","true");
        localStorage['repeat'] = true;
    }
});

//调试模式
$('#Debug').bind("click", function(){
    if(!$(this).prop("checked")){
        $('#Debug').removeAttr("checked");
        localStorage['Debug'] = false;
    }else{
        $('#Debug').attr("checked","true");
        localStorage['Debug'] = true;
    }
});

//使用网页标题做文件名
$('#TitleName').bind("click", function(){
    if(!$(this).prop("checked")){
        $('#TitleName').removeAttr("checked");
        localStorage['TitleName'] = false;
    }else{
        $('#TitleName').attr("checked","true");
        localStorage['TitleName'] = true;
    }
});

//重置
$('#ResetExt').bind("click", function(){
    delete localStorage['Ext'];
    delete localStorage['repeatReg'];
    delete localStorage['repeat'];
    delete localStorage['Debug'];
    delete localStorage['Type'];
    delete localStorage['TitleName'];
    location.reload();
});