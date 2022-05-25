//////////////////////初始化//////////////////////
chrome.storage.sync.get(["Ext", "Debug", "TitleName", "OtherAutoClear", "Potplayer", "Type", "Regex"], function (items) {
  if (items.Ext === undefined) {
    location.reload();
  }
  for (let item of items.Ext) {
    // $("#extList").append(Gethtml("Ext", item.ext, item.size, item.state));
    $("#extList").append(Gethtml("Ext", { ext: item.ext, size: item.size, state: item.state }));
  }
  for (let item of items.Type) {
    $("#typeList").append(Gethtml("Type", { type: item.type, size: item.size, state: item.state }));
  }
  for (let item of items.Regex) {
    $("#regexList").append(Gethtml("Regex", { type: item.type, regex: item.regex, state: item.state }));
  }
  $("#Debug").attr("checked", items.Debug);
  $("#TitleName").attr("checked", items.TitleName);
  $("#OtherAutoClear").val(items.OtherAutoClear);
  $("#Potplayer").attr("checked", items.Potplayer);
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
  $("#regexList").append(Gethtml("Regex", { type: 1, state: true }));
  $("#regexList #text").last().focus();
});

$("#version").html("猫抓 v" + G.Version);

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
    Save();
  });
  html.find("input").blur(function () {
    Save();
  });
  html.find("#size, #state").on("click", function () {
    Save();
  });
  return html;
}

//调试模式
$("#Debug").bind("click", function () {
  chrome.runtime.sendMessage({ Message: "SetOption", obj: "Debug", val: $(this).prop("checked") });
});

//使用网页标题做文件名
$("#TitleName").bind("click", function () {
  chrome.runtime.sendMessage({ Message: "SetOption", obj: "TitleName", val: $(this).prop("checked") });
});

//使用PotPlayer预览
$("#Potplayer").bind("click", function () {
  chrome.runtime.sendMessage({ Message: "SetOption", obj: "Potplayer", val: $(this).prop("checked") });
});

//失去焦点 保存自动清理数
$("#OtherAutoClear").blur(function () {
  chrome.runtime.sendMessage({ Message: "SetOption", obj: "OtherAutoClear", val: $(this).val() });
});

//重置后缀
$("#ResetExt").bind("click", function () {
  chrome.runtime.sendMessage({ Message: "SetOption", obj: "Ext" });
  location.reload();
});
//重置类型
$("#ResetType").bind("click", function () {
  chrome.runtime.sendMessage({ Message: "SetOption", obj: "Type" });
  location.reload();
});
//重置正则
$("#ResetRegex").bind("click", function () {
  chrome.runtime.sendMessage({ Message: "SetOption", obj: "Regex" });
  location.reload();
});
//重置其他设置
$("#ResetOption").bind("click", function () {
  chrome.runtime.sendMessage({ Message: "SetOption", obj: "Debug" });
  chrome.runtime.sendMessage({ Message: "SetOption", obj: "TitleName" });
  chrome.runtime.sendMessage({ Message: "SetOption", obj: "OtherAutoClear" });
  chrome.runtime.sendMessage({ Message: "SetOption", obj: "Potplayer" });
  location.reload();
});
//清空数据
$("#ClearData").bind("click", function () {
  chrome.storage.local.clear("MediaData");
  chrome.runtime.sendMessage({ Message: "ClearIcon" });
  location.reload();
});
//重置所有设置
$("#ResetAllOption").bind("click", function () {
  chrome.runtime.sendMessage({ Message: "ResetOptions" });
  chrome.storage.local.clear("MediaData");
  chrome.runtime.sendMessage({ Message: "ClearIcon" });
  location.reload();
});
//正则表达式 测试
$("#testRegex").keyup(function () {
  let testUrl = $("#testUrl").val();
  let testRegex = $("#testRegex").val();
  let testFlag = $("#testFlag").val();
  const reg = new RegExp(testRegex, testFlag);
  if (reg.test(testUrl)) {
    $("#testResult").html("匹配");
  } else {
    $("#testResult").html("不匹配");
  }
});


function Save() {
  let Ext = new Array();
  let Type = new Array();
  let Regex = new Array();
  $("#extList tr, #typeList tr").each(function () {
    let GetText = $(this).find("#text").val();
    let GetSize = $(this).find("#size").val();
    let GetState = $(this).find("#state").prop("checked");
    if (GetText == null || GetText === undefined || GetText == "" || GetText == " ") {
      return true;
    }
    if (GetSize == null || GetSize === undefined || GetSize == "") {
      GetSize = 0;
    }
    if ($(this).data("type") == "Ext") {
      Ext.push({ ext: GetText.toLowerCase(), size: GetSize, state: GetState });
    } else if (/^[^\/]+\/[^\/]+$/ig.test(GetText)) {
      Type.push({ type: GetText.toLowerCase(), size: GetSize, state: GetState });
    } else {
      alert("类型输入不正确");
      location.reload();
    }
  });
  $("#regexList tr").each(function () {
    let GetType = $(this).find("#type").val();
    let GetRegex = $(this).find("#regex").val();
    let GetState = $(this).find("#state").prop("checked");
    if (GetType == null || GetType === undefined || GetType == "" || GetType == " ") {
      GetType = "ig";
    }
    try {
      new RegExp("", GetType)
    } catch (e) {
      GetType = "ig";
    }
    if (GetRegex == null || GetRegex === undefined || GetRegex == "" || GetRegex == " ") {
      return true;
    }
    Regex.push({ type: GetType, regex: GetRegex, state: GetState });
  });
  chrome.storage.sync.set({ Ext: Ext });
  chrome.storage.sync.set({ Type: Type });
  chrome.storage.sync.set({ Regex: Regex });
  // chrome.runtime.sendMessage({ Message: "SetOption" });
  // location.reload();
}