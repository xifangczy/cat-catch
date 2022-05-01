//////////////////////初始化//////////////////////
chrome.storage.sync.get(["Ext", "Debug", "TitleName", "AutoClear", "Potplayer", "MoreType"], function (items) {
    items.Ext.forEach(function (item) {
        $('#ExtTd').append(GethtmlExt(item.ext, item.size));
    });
    $('#Debug').attr("checked", items.Debug);
    $('#TitleName').attr("checked", items.TitleName);
    $('#AutoClear').val(items.AutoClear);
    $('#Potplayer').attr("checked", items.Potplayer);
    $('#MoreType').attr("checked", items.MoreType);
});

//新增格式
$('#AddExt').bind("click", function () {
    $('#ExtTd').append(GethtmlExt());
});

//获得html_格式
function GethtmlExt() {
    var ext = arguments[0] ? arguments[0] : '';
    var size = arguments[1] ? arguments[1] : '0';
    var html = '<tr><td><input type="text" class="ext" placeholder="扩展名" value="' + ext + '">';
    html += '</td><td class="TdSize"><input type="number" class="size" placeholder="大小限制" value="' + size + '">';
    html += '</td><td class="SizeButton">kb</td><td class="RemoveButton">X</td></tr>';
    html = $(html);
    html.find('.RemoveButton').click(function () {
        html.remove();
        SaveExt();
    });
    html.find('.ext').blur(function () {
        SaveExt();
    });
    html.find('.size').click(function () {
        SaveExt();
    });
    return html;
}

//调试模式
$('#Debug').bind("click", function () {
    chrome.storage.sync.set({ "Debug": $(this).prop("checked") });
});

//使用网页标题做文件名
$('#TitleName').bind("click", function () {
    chrome.storage.sync.set({ "TitleName": $(this).prop("checked") });
});

//使用PotPlayer预览
$('#Potplayer').bind("click", function () {
    chrome.storage.sync.set({ "Potplayer": $(this).prop("checked") });
});

//包含application/octet-stream文件
$('#MoreType').bind("click", function () {
    chrome.storage.sync.set({ "MoreType": $(this).prop("checked") });
});

//失去焦点 保存自动清理数
$('#AutoClear').blur(function () {
    chrome.storage.sync.set({ "AutoClear": $(this).val() });
});

//重置
$('#ResetExt').bind("click", function () {
    chrome.storage.sync.set({
        "Ext": defaultExt,
        "Debug": defaultDebug,
        "TitleName": defaultTitleName,
        "AutoClear": defaultAutoClear,
        "Potplayer": defaultPotplayer,
        "MoreType": defaultMoreType
    });
    location.reload();
});

//提示
function Prompt(str) {
    $('#TempntcText').html(str);
    $('.tempntc').fadeIn(500).delay(1000).fadeOut(500);
}

//保存
function SaveExt() {
    var Ext = new Array();
    $('#ExtTd tr').each(function () {
        Tempext = $(this).find('.ext').val();
        if (Tempext == null || Tempext === undefined || Tempext == '' || Tempext == ' ') {
            return true;
        }
        Tempsize = $(this).find('.size').val();
        if (Tempsize == null || Tempsize === undefined || Tempsize == '') {
            Tempsize = 0;
        }
        Ext.push({ ext: Tempext, size: Tempsize });
    });
    chrome.storage.sync.set({ "Ext": Ext });
    // location.reload();
}