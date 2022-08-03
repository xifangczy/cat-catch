////////////////////// 填充数据 //////////////////////
chrome.storage.sync.get(G.OptionLists, function (items) {
    if (items.Ext === undefined || items.Type === undefined || items.Regex === undefined) {
        location.reload();
    }
    for (let item of items.Ext) {
        $("#extList").append(Gethtml("Ext", { ext: item.ext, size: item.size, state: item.state }));
    }
    for (let item of items.Type) {
        $("#typeList").append(Gethtml("Type", { type: item.type, size: item.size, state: item.state }));
    }
    for (let item of items.Regex) {
        $("#regexList").append(Gethtml("Regex", { type: item.type, regex: item.regex, ext: item.ext, state: item.state }));
    }
    $("#Debug").attr("checked", items.Debug);
    $("#TitleName").attr("checked", items.TitleName);
    $("#OtherAutoClear").val(items.OtherAutoClear);
    $("#Potplayer").attr("checked", items.Potplayer);
    $("#ShowWebIco").attr("checked", items.ShowWebIco);
    $("#MobileUserAgent").val(items.MobileUserAgent);
    $("#m3u8dl").attr("checked", items.m3u8dl);
    $("#m3u8dlArg").val(items.m3u8dlArg);
    $("#copyM3U8").val(items.copyM3U8);
    $("#copyMPD").val(items.copyMPD);
    $("#copyOther").val(items.copyOther);
    // 注入脚本列表
    G.scriptList.forEach(function (item, key) {
        $("#injectScript").append(`<option value="${key}">${item.name}</option>`);
    });
    $("#injectScript").val(items.injectScript);
});

//新增格式
$("#AddExt").bind("click", function () {
    $("#extList").append(Gethtml("Ext", { state: true }));
    $("#extList #text").last().focus();
});
$("#AddType").bind("click", function () {
    $("#typeList").append(Gethtml("Type", { state: true }));
    $("#typeList #text").last().focus();
});
$("#AddRegex").bind("click", function () {
    $("#regexList").append(Gethtml("Regex", { type: "ig", state: true }));
    $("#regexList #text").last().focus();
});
$("#version").html("猫抓 v" + chrome.runtime.getManifest().version);

// 增加后缀 类型 正则表达式
function Gethtml(Type, Param = new Object()) {
    let html = "";
    switch (Type) {
        case "Ext":
            html = `<td><input type="text" value="${Param.ext ? Param.ext : ""}" id="text" placeholder="后缀名" class="ext"></td>`
            html += `<td><input type="number" placeholder="大小限制" value="${Param.size ? Param.size : 0}" class="size" id="size">KB</td>`
            break;
        case "Type":
            html = `<td><input type="text" value="${Param.type ? Param.type : ""}" id="text" placeholder="类型" class="type"></td>`
            html += `<td><input type="number" placeholder="大小限制" value="${Param.size ? Param.size : 0}" class="size" id="size">KB</td>`
            break;
        case "Regex":
            html = `<td><input type="text" value="${Param.type ? Param.type : ""}" id="type" class="regexType"></td>`
            html += `<td><input type="text" value="${Param.regex ? Param.regex : ""}" placeholder="正则表达式" id="regex" class="regex"></td>`
            html += `<td><input type="text" value="${Param.ext ? Param.ext : ""}" id="regexExt" class="regexExt"></td>`
    }
    html = `<tr data-type="${Type}">
            ${html}
            <td>
                <div class="switch">
                    <label class="switchLabel switchRadius">
                        <input type="checkbox" id="state" class="switchInput" ${Param.state ? 'checked="checked"' : ""}/>
                        <span class="switchRound switchRadius"><em class="switchRoundBtn switchRadius"></em></span>
                    </label>
                </div>
            </td>
            <td>
                <svg viewBox="0 0 24 24" class="RemoveButton"><g>
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path>
                </g></svg>
            </td>
        </tr>`;

    html = $(html);
    html.find(".RemoveButton").click(function () {
        html.remove();
        Save(Type);
    });
    html.find("input").keyup(function () {
        Save(Type);
    });
    html.find("#size, #state").on("click", function () {
        Save(Type);
    });
    if (Type == "Type") {
        html.find("input").blur(function () {
            $("#typeList tr").each(function () {
                let GetText = $(this).find("#text").val();
                if (isEmpty(GetText)) { return true; }
                if (!/^[^\/]+\/[^\/]+$/ig.test(GetText)) {
                    alert("抓取类型格式错误，请检查");
                }
            });
        });
    }
    return html;
}
// 注入脚本选择
$("#injectScript").change(function () {
    const Option = $(this).attr("id");
    const Value = $(this).val();
    if (G.scriptList.has(Value)) {
        chrome.storage.sync.set({ [Option]: Value });
    }
});
//失去焦点 保存自动清理数 模拟手机User Agent
$("#OtherAutoClear, #MobileUserAgent, #m3u8dlArg, #copyM3U8, #copyMPD, #copyOther").on("input", function () {
    const Option = $(this).attr("id");
    chrome.storage.sync.set({ [Option]: $(this).val() });
});
// 调试模式 使用网页标题做文件名 使用PotPlayer预览 显示网站图标
$("#Debug, #TitleName, #Potplayer, #ShowWebIco, #m3u8dl").bind("click", function () {
    const Option = $(this).attr("id");
    chrome.storage.sync.set({ [Option]: $(this).prop('checked') });
});
// 一键禁用/启用
$("#allDisable, #allEnable").bind("click", function () {
    let state = $(this).attr("id") == "allDisable" ? false : true;
    let obj = $(this).data("switch");
    let query;
    if (obj == "Ext") {
        query = $("#extList #state");
    } else if (obj == "Type") {
        query = $("#typeList #state");
    } else if (obj == "Regex") {
        query = $("#regexList #state");
    }
    query.each(function () {
        $(this).prop("checked", state);
    });
    Save(obj);
});
//重置后缀 重置类型 重置正则
$("#ResetExt, #ResetType, #ResetRegex").bind("click", function () {
    if (confirm("确认重置吗？")) {
        const Option = $(this).data("reset");
        chrome.storage.sync.set({ [Option]: GetDefault(Option) });
        location.reload();
    }
});
//重置其他设置
$("#ResetOption").bind("click", function () {
    if (confirm("确认重置吗？")) {
        $("#OtherOption input, #OtherOption textarea").each(function () {
            const Option = $(this).attr("id");
            chrome.storage.sync.set({ [Option]: GetDefault(Option) });
        });
        location.reload();
    }
});
//重置复制选项
$("#ResetCopy").bind("click", function () {
    if (confirm("确认重置吗？")) {
        chrome.storage.sync.set({ copyM3U8: GetDefault("copyM3U8") });
        chrome.storage.sync.set({ copyMPD: GetDefault("copyMPD") });
        chrome.storage.sync.set({ copyOther: GetDefault("copyOther") });
        location.reload();
    }
});
//清空数据 重置所有设置
$("#ClearData, #ResetAllOption").bind("click", function () {
    if ($(this).attr("id") == "ResetAllOption") {
        if (confirm("确认重置所有设置吗？")) {
            chrome.storage.sync.clear();
            InitOptions();
        } else {
            return;
        }
    }
    chrome.storage.local.clear();
    chrome.runtime.sendMessage({ Message: "ClearIcon" });
    location.reload();
});
//重启扩展
$("#extensionReload").bind("click", function () {
    chrome.runtime.reload();
});
//正则表达式 测试
$("#testRegex, #testUrl").keyup(function () {
    const testUrl = $("#testUrl").val();
    const testRegex = $("#testRegex").val();
    const testFlag = $("#testFlag").val();
    if (testUrl == "" || testRegex == "") {
        $("#testResult").html("不匹配");
        return;
    }
    let regex;
    try {
        regex = new RegExp(testRegex, testFlag);
    } catch (e) {
        $("#testResult").html(e.message);
        return;
    }
    const result = regex.exec(testUrl);
    if (result == null) {
        $("#testResult").html("不匹配");
        return;
    }
    $("#testResult").html("匹配")
    for (let i = 1; i < result.length; i++) {
        if (result[i] != "") {
            $("#testResult").append(
                `<input type="text" style="width: 590px; color: #ff0000" value="${decodeURIComponent(result[i])}">`
            );
        }
    }
});
//导出配置
$("#exportOptions").bind("click", function () {
    chrome.storage.sync.get(function (items) {
        let ExportData = JSON.stringify(items);
        ExportData = "data:application/json;charset=utf-8," + encodeURIComponent(ExportData);
        let date = new Date();
        const filename = `cat-catch-${chrome.runtime.getManifest().version}-${date.getFullYear()}-${date.getMonth()}-${date.getDay()}-${date.getTime()}.json`;
        if (G.isFirefox) {
            downloadDataURL(ExportData, filename);
            return;
        }
        chrome.downloads.download({
            url: ExportData,
            filename: filename
        });
    });
});
//导入配置
$("#importOptionsFile").change(function () {
    let fileReader = new FileReader();
    fileReader.onload = function () {
        let importData = this.result;
        try {
            importData = JSON.parse(importData);
        } catch (e) { alert("文件内容错误"); return; }
        for (let item of G.OptionLists) {
            chrome.storage.sync.set({ [item]: importData[item] });
        }
        alert("导入完成");
        location.reload();
    }
    let file = $("#importOptionsFile").prop('files')[0];
    fileReader.readAsText(file);
});
$("#importOptions").bind("click", function () {
    $("#importOptionsFile").click();
});
// 参数说明
$("#showM3u8Help").bind("click", function () {
    $("#m3u8Help").slideToggle();
});

// 保存 后缀 类型 正则 配置
function Save(option) {
    if (option == "Ext") {
        let Ext = new Array();
        $("#extList tr").each(function () {
            let GetText = $(this).find("#text").val();
            let GetSize = $(this).find("#size").val();
            let GetState = $(this).find("#state").prop("checked");
            if (isEmpty(GetText)) { return true; }
            if (isEmpty(GetSize)) { GetSize = 0; }
            Ext.push({ ext: GetText.toLowerCase(), size: GetSize, state: GetState });
        });
        chrome.storage.sync.set({ Ext: Ext });
    }
    if (option == "Type") {
        let Type = new Array();
        $("#typeList tr").each(function () {
            let GetText = $(this).find("#text").val();
            let GetSize = $(this).find("#size").val();
            let GetState = $(this).find("#state").prop("checked");
            if (isEmpty(GetText)) { return true; }
            if (isEmpty(GetSize)) { GetSize = 0; }
            if (/^[^\/]+\/[^\/]+$/ig.test(GetText)) {
                Type.push({ type: GetText.toLowerCase(), size: GetSize, state: GetState });
            }
        });
        chrome.storage.sync.set({ Type: Type });
    }
    if (option == "Regex") {
        let Regex = new Array();
        $("#regexList tr").each(function () {
            let GetType = $(this).find("#type").val();
            let GetRegex = $(this).find("#regex").val();
            let GetExt = $(this).find("#regexExt").val()
            let GetState = $(this).find("#state").prop("checked");
            try {
                new RegExp("", GetType);
            } catch (e) {
                GetType = "ig";
            }
            if (isEmpty(GetRegex)) { return true; }
            GetExt = GetExt ? GetExt.toLowerCase() : "";
            Regex.push({ type: GetType, regex: GetRegex, ext: GetExt, state: GetState });
        });
        chrome.storage.sync.set({ Regex: Regex });
    }
}