////////////////////// 填充数据 //////////////////////
chrome.storage.sync.get(G.OptionLists, function (items) {
    if (chrome.runtime.lastError) {
        items = G.OptionLists;
    }
    // 确保有默认值
    for (let key in G.OptionLists) {
        if (items[key] === undefined || items[key] === null) {
            items[key] = G.OptionLists[key];
        }
    }
    if (items.Ext === undefined || items.Type === undefined || items.Regex === undefined) {
        location.reload();
    }
    if (G.isMobile) {
        $(`<link rel="stylesheet" type="text/css" href="css/mobile.css">`).appendTo("head");
    }
    $(`<style>${items.css}</style>`).appendTo("head");
    const $extList = $("#extList");
    for (let key in items.Ext) {
        $extList.append(Gethtml("Ext", { ext: items.Ext[key].ext, size: items.Ext[key].size, state: items.Ext[key].state }));
    }
    const $typeList = $("#typeList");
    for (let key in items.Type) {
        $typeList.append(Gethtml("Type", { type: items.Type[key].type, size: items.Type[key].size, state: items.Type[key].state }));
    }
    const $regexList = $("#regexList");
    for (let key in items.Regex) {
        $regexList.append(Gethtml("Regex", { type: items.Regex[key].type, regex: items.Regex[key].regex, ext: items.Regex[key].ext, blackList: items.Regex[key].blackList, state: items.Regex[key].state }));
    }
    const $blockUrlList = $("#blockUrlList");
    for (let key in items.blockUrl) {
        $blockUrlList.append(Gethtml("blockUrl", { url: items.blockUrl[key].url, state: items.blockUrl[key].state }));
    }
    setTimeout(() => {
        for (let key in items) {
            if (key == "Ext" || key == "Type" || key == "Regex") { continue; }
            if (typeof items[key] == "boolean") {
                $(`#${key}`).prop("checked", items[key]);
            } else {
                $(`#${key}`).val(items[key]);
            }
        }
    }, 100);
});

//新增格式
$("#AddExt").bind("click", function () {
    $("#extList").append(Gethtml("Ext", { state: true }));
    $("#extList [name=text]").last().focus();
});
$("#AddType").bind("click", function () {
    $("#typeList").append(Gethtml("Type", { state: true }));
    $("#typeList [name=text]").last().focus();
});
$("#AddRegex").bind("click", function () {
    $("#regexList").append(Gethtml("Regex", { type: "ig", state: true }));
    $("#regexList [name=text]").last().focus();
});
$("#blockAddUrl").bind("click", function () {
    $("#blockUrlList").append(Gethtml("blockUrl", { state: true }));
    $("#blockUrlList [name=url]").last().focus();
});
$("#version").html(i18n.catCatch + " v" + chrome.runtime.getManifest().version);

// 自定义播放调用模板
playerList = new Map();
playerList.set("tips", { name: i18n.invokeProtocolTemplate, template: "" });
playerList.set("default", { name: i18n.default + " / " + i18n.disable, template: "" });
playerList.set("potplayer", { name: "PotPlayer", template: "potplayer://${url} ${referer|exists:'/referer=\"*\"'}" });
playerList.set("potplayerFix", { name: "PotPlayerFix", template: "potplayer:${url} ${referer|exists:'/referer=\"*\"'}" });
playerList.set("mxPlayerAd", { name: "Android MX Player Free", template: "intent:${url}#Intent;package=com.mxtech.videoplayer.ad;end" });
playerList.set("mxPlayerPro", { name: "Android MX Player Pro", template: "intent:${url}#Intent;package=com.mxtech.videoplayer.pro;end" });
playerList.set("vlc", { name: "Android vlc", template: "intent:${url}#Intent;package=org.videolan.vlc;end" });
playerList.set("vlcCustom", { name: i18n.customVLCProtocol + " vlc://", template: "vlc://${url}" });
playerList.set("shareApi", { name: i18n.systemShare, template: "${shareApi}" });
playerList.forEach(function (item, key) {
    $("#PlayerTemplate").append(`<option value="${key}">${item.name}</option>`);
});

// 增加后缀 类型 正则表达式
function Gethtml(Type, Param = new Object()) {
    let html = "";
    switch (Type) {
        case "Ext":
            html = `<td><input type="text" value="${Param.ext ? Param.ext : ""}" name="text" placeholder="${i18n.suffix}" class="ext"></td>`
            html += `<td><input type="number" value="${Param.size ? Param.size : 0}" class="size" name="size">KB</td>`
            break;
        case "Type":
            html = `<td><input type="text" value="${Param.type ? Param.type : ""}" name="text" placeholder="${i18n.type}" class="type"></td>`
            html += `<td><input type="number" value="${Param.size ? Param.size : 0}" class="size" name="size">KB</td>`
            break;
        case "Regex":
            html = `<td><input type="text" value="${Param.type ? Param.type : ""}" name="type" class="regexType"></td>`
            html += `<td><input type="text" value="${Param.regex ? Param.regex : ""}" placeholder="${i18n.regexExpression}" name="regex" class="regex"></td>`
            html += `<td><input type="text" value="${Param.ext ? Param.ext : ""}" name="regexExt" class="regexExt"></td>`
            html += `<td>
            <div class="switch">
                <label class="switchLabel switchRadius">
                    <input type="checkbox" name="blackList" class="switchInput" ${Param.blackList ? 'checked="checked"' : ""}/>
                    <span class="switchRound switchRadius"><em class="switchRoundBtn switchRadius"></em></span>
                </label>
            </div>
        </td>`
            break;
        case "blockUrl":
            html = `<td><input type="text" value="${Param.url ? Param.url : ""}" name="url" placeholder="${i18n.blockUrlTips}" class="width100"></td>`
            break;
    }
    html = $(`<tr data-type="${Type}">
            ${html}
            <td>
                <div class="switch">
                    <label class="switchLabel switchRadius">
                        <input type="checkbox" name="state" class="switchInput" ${Param.state ? 'checked="checked"' : ""}/>
                        <span class="switchRound switchRadius"><em class="switchRoundBtn switchRadius"></em></span>
                    </label>
                </div>
            </td>
            <td>
                <img src="img/delete.svg" class="RemoveButton">
            </td>
        </tr>`);
    html.find(".RemoveButton").click(function () {
        html.remove();
        Save(Type);
    });
    html.find("input").on("input", function () {
        Save(Type, 200);
    });
    html.find("[name=state]").on("click", function () {
        Save(Type);
    });
    if (Type == "Type") {
        html.find("input").blur(function () {
            $("#typeList tr").each(function () {
                let GetText = $(this).find("[name=text]").val();
                if (isEmpty(GetText)) { return true; }
                GetText = GetText.trim();
                const test = GetText.split("/");
                if (test.length != 2 || isEmpty(test[0]) || isEmpty(test[1])) {
                    alert(i18n.addTypeError);
                    return true;
                }
            });
        });
    }
    return html;
}
// 预览模板
$("#PlayerTemplate").change(function () {
    const Value = $(this).val();
    if (this.id == "PlayerTemplate" && playerList.has(Value) && Value != "tips") {
        const template = playerList.get(Value).template;
        $("#Player").val(template);
        chrome.storage.sync.set({ Player: template });
    }
});
//失去焦点 保存自动清理数 模拟手机User Agent 自定义播放调用模板
let debounce2 = undefined;
$("[save='input']").on("input", function () {
    let val = $(this).val().trim();
    if (this.type == "number") {
        val = parseInt(val);
    }
    clearTimeout(debounce2);
    debounce2 = setTimeout(() => {
        chrome.storage.sync.set({ [this.id]: val });
    }, 300);
});
// 调试模式 使用网页标题做文件名 使用PotPlayer预览 显示网站图标 刷新自动清理
$("[save='click']").bind("click", function () {
    chrome.storage.sync.set({ [this.id]: $(this).prop('checked') });
});
// [save='select'] 元素 储存
$("[save='select']").on("change", function () {
    let val = $(this).val();
    if (!isNaN(val)) { val = parseInt(val); }
    chrome.storage.sync.set({ [this.id]: val });
});

// 一键禁用/启用
$("#allDisable, #allEnable").bind("click", function () {
    const state = this.id == "allEnable";
    const obj = $(this).data("switch");
    let query;
    if (obj == "Ext") {
        query = $("#extList [name=state]");
    } else if (obj == "Type") {
        query = $("#typeList [name=state]");
    } else if (obj == "Regex") {
        query = $("#regexList [name=state]");
    } else if (obj == "blockUrl") {
        query = $("#blockUrlList [name=state]");
    }
    query.each(function () {
        $(this).prop("checked", state);
    });
    Save(obj);
});
// m3u8dlArg 输出测试
function testTag() {
    const data = {
        url: $("#url").val(),
        requestHeaders: { referer: $("#referer").val() },
        initiator: $("#initiator").val(),
        webUrl: $("#webUrl").val(),
        title: $("#title").val(),
    }
    const result = templates($("#testTextarea").val() ?? "", data);
    const m3u8dl = 'm3u8dl:' + (G.m3u8dl == 1 ? Base64.encode(result) : result);
    $("#tagTestResult").html(`${result}<br><br><a href="${m3u8dl}" class="test_url">${m3u8dl}</a>`);
}
$("#showTestTag").bind("click", function () {
    testTag();
    $("#testTag").slideToggle();
});
$("#testTag input, #testTextarea").on("input", function () {
    testTag();
});
//重置后缀 重置类型 重置正则
$("[data-reset]").bind("click", function () {
    if (confirm(i18n.confirmReset)) {
        const Option = $(this).data("reset");
        chrome.storage.sync.set({ [Option]: G.OptionLists[Option] }, () => {
            location.reload();
        });
    }
});

//重置设置
$(".resetOption").click(function () {
    if (confirm(i18n.confirmReset)) {
        const optionBox = $(this).closest('.optionBox');
        const result = optionBox.find('[save]').toArray().reduce((acc, { id }) => {
            acc[id] = G.OptionLists[id];
            return acc;
        }, {});
        chrome.storage.sync.set(result, () => {
            location.reload();
        });
    }
});

//清空数据 重置所有设置
$("#ClearData, #ResetAllOption").bind("click", function () {
    if (this.id == "ResetAllOption") {
        if (confirm(i18n.confirmReset)) {
            chrome.storage.sync.clear();
            InitOptions();
        } else {
            return;
        }
    }
    chrome.storage.local.clear();
    chrome.storage.session.clear();
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
        $("#testResult").html(i18n.noMatch);
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
        $("#testResult").html(i18n.noMatch);
        return;
    }
    $("#testResult").html(i18n.match)
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
    chrome.storage.sync.get(null, function (items) {
        let ExportData = JSON.stringify(items);
        ExportData = "data:text/plain," + Base64.encode(ExportData);
        let date = new Date();
        const filename = `cat-catch-${chrome.runtime.getManifest().version}-${date.getFullYear()}${appendZero(date.getMonth() + 1)}${appendZero(date.getDate())}T${appendZero(date.getHours())}${appendZero(date.getMinutes())}.txt`;
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
    const fileReader = new FileReader();
    fileReader.onload = function () {
        let importData = this.result;
        try {
            importData = JSON.parse(importData);
        } catch (e) {
            importData = Base64.decode(importData);
            importData = JSON.parse(importData);
        }
        const keys = Object.keys(G.OptionLists);
        for (let item in G.OptionLists) {
            if (keys.includes(item) && importData[item] !== undefined) {
                chrome.storage.sync.set({ [item]: importData[item] });
            }
        }
        alert(i18n.alertimport);
        location.reload();
    }
    const file = $("#importOptionsFile").prop('files')[0];
    fileReader.readAsText(file);
});
$("#importOptions").bind("click", function () {
    $("#importOptionsFile").click();
});

// 保存 后缀 类型 正则 配置
function Save(option, sec = 0) {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
        if (option == "Ext") {
            let Ext = new Array();
            $("#extList tr").each(function () {
                const _this = $(this);
                let GetText = _this.find("[name=text]").val();
                let GetSize = parseInt(_this.find("[name=size]").val());
                let GetState = _this.find("[name=state]").prop("checked");
                if (isEmpty(GetText)) { return true; }
                if (isEmpty(GetSize)) { GetSize = 0; }
                Ext.push({ ext: GetText.toLowerCase(), size: GetSize, state: GetState });
            });
            chrome.storage.sync.set({ Ext: Ext });
            return;
        }
        if (option == "Type") {
            let Type = new Array();
            $("#typeList tr").each(function () {
                const _this = $(this);
                let GetText = _this.find("[name=text]").val();
                let GetSize = parseInt(_this.find("[name=size]").val());
                let GetState = _this.find("[name=state]").prop("checked");
                if (isEmpty(GetText)) { return true; }
                if (isEmpty(GetSize)) { GetSize = 0; }
                GetText = GetText.trim();
                const test = GetText.split("/");
                if (test.length == 2 && !isEmpty(test[0]) && !isEmpty(test[1])) {
                    Type.push({ type: GetText.toLowerCase(), size: GetSize, state: GetState });
                }
            });
            chrome.storage.sync.set({ Type: Type });
            return;
        }
        if (option == "Regex") {
            let Regex = new Array();
            $("#regexList tr").each(function () {
                const _this = $(this);
                let GetType = _this.find("[name=type]").val();
                let GetRegex = _this.find("[name=regex]").val();
                let GetExt = _this.find("[name=regexExt]").val()
                let GetState = _this.find("[name=state]").prop("checked");
                let GetBlackList = _this.find("[name=blackList]").prop("checked");
                try {
                    new RegExp("", GetType);
                } catch (e) {
                    GetType = "ig";
                }
                if (isEmpty(GetRegex)) { return true; }
                GetExt = GetExt ? GetExt.toLowerCase() : "";
                Regex.push({ type: GetType, regex: GetRegex, ext: GetExt, blackList: GetBlackList, state: GetState });
            });
            chrome.storage.sync.set({ Regex: Regex });
            return;
        }
        if (option == "blockUrl") {
            let blockUrl = new Array();
            $("#blockUrlList tr").each(function () {
                const _this = $(this);
                let url = _this.find("[name=url]").val();
                let GetState = _this.find("[name=state]").prop("checked");
                if (isEmpty(url)) { return true; }
                blockUrl.push({ url: url, state: GetState });
            });
            chrome.storage.sync.set({ blockUrl: blockUrl });
            return;
        }
    }, sec);
}

// 导航栏
document.querySelectorAll('nav a').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            targetElement.scrollIntoView({
                behavior: 'smooth'
            });
        }
    });
});
const adjustSidebarPosition = () => {
    const wrapper = document.querySelector('.wrapper');
    const sidebar = document.querySelector('.sidebar');
    if (wrapper && sidebar) {
        sidebar.style.left = `${wrapper.getBoundingClientRect().left - sidebar.offsetWidth - 20}px`;
    }
}
window.addEventListener('load', adjustSidebarPosition)
window.addEventListener('resize', adjustSidebarPosition);
