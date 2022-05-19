//////////////////////初始化//////////////////////
chrome.storage.sync.get(["Ext", "Debug", "TitleName", "OtherAutoClear", "Potplayer", "Type"], function (items) {
  for (let item of items.Ext) {
    $("#extList").append(Gethtml("Ext", item.ext, item.size, item.state));
  }
  for (let item of items.Type) {
    $("#typeList").append(Gethtml("Type", item.type, item.size, item.state));
  }
  $("#Debug").attr("checked", items.Debug);
  $("#TitleName").attr("checked", items.TitleName);
  $("#OtherAutoClear").val(items.OtherAutoClear);
  $("#Potplayer").attr("checked", items.Potplayer);
});

//新增格式
$("#AddExt").bind("click", function () {
  $("#extList").append(Gethtml("Ext"));
  $("#extList #text").last().focus();
});
$("#AddType").bind("click", function () {
  $("#typeList").append(Gethtml("Type"));
  $("#typeList #text").last().focus();
});

function Gethtml(Type, Text = "", Size = 0, State = true) {
  let html = '<tr data-type="' + Type + '">\
      <td><input type="text" value="' + Text + '" id="text"></td>\
      <td><input type="number" placeholder="大小限制" value="' + Size + '" class="size" id="size">KB</td>\
      <td>\
        <div class="switch">\
          <label class="switchLabel switchRadius">\
            <input type="checkbox" id="state" class="switchInput"/>\
            <span class="switchRound switchRadius"><em class="switchRoundBtn switchRadius"></em></span>\
          </label>\
        </div>\
      </td>\
      <td>\
        <svg viewBox="0 0 24 24" class="RemoveButton"><g>\
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path>\
        </g></svg>\
      </td>\
    </tr>';

  html = $(html);
  if (Type == "Ext") {
    html.find("#text").attr("placeholder", "后缀名");
    html.find("#text").attr("class", "ext");
  } else {
    html.find("#text").attr("placeholder", "类型");
    html.find("#text").attr("class", "type");
  }
  html.find("#state").attr("checked", State);
  html.find(".RemoveButton").click(function () {
    html.remove();
    Save();
  });
  html.find("#text").blur(function () {
    Save();
  });
  html.find("#size").on("click blur", function () {
    Save();
  });
  html.find("#state").on("click", function () {
    Save();
  });
  return html;
}

//调试模式
$("#Debug").bind("click", function () {
  chrome.storage.sync.set({ Debug: $(this).prop("checked") });
  chrome.runtime.sendMessage('RefreshOption');
});

//使用网页标题做文件名
$("#TitleName").bind("click", function () {
  chrome.storage.sync.set({ TitleName: $(this).prop("checked") });
  chrome.runtime.sendMessage('RefreshOption');
});

//使用PotPlayer预览
$("#Potplayer").bind("click", function () {
  chrome.storage.sync.set({ Potplayer: $(this).prop("checked") });
  chrome.runtime.sendMessage('RefreshOption');
});

//失去焦点 保存自动清理数
$("#OtherAutoClear").blur(function () {
  chrome.storage.sync.set({ OtherAutoClear: $(this).val() });
  chrome.runtime.sendMessage('RefreshOption');
});

//重置后缀
$("#ResetExt").bind("click", function () {
  chrome.storage.sync.set({ Ext: defaultExt });
  chrome.runtime.sendMessage('RefreshOption');
  location.reload();
});
//重置类型
$("#ResetType").bind("click", function () {
  chrome.storage.sync.set({ Type: defaultType });
  chrome.runtime.sendMessage('RefreshOption');
  location.reload();
});
//重置其他设置
$("#ResetOption").bind("click", function () {
  chrome.storage.sync.set({ Debug: defaultDebug, TitleName: defaultTitleName, OtherAutoClear: defaultOtherAutoClear, Potplayer: defaultPotplayer, });
  chrome.runtime.sendMessage('RefreshOption');
  location.reload();
});
//清空数据
$("#ClearData").bind("click", function () {
  chrome.storage.local.clear("MediaData");
  chrome.runtime.sendMessage('ClearIcon');
  location.reload();
});
//重置所有设置
$("#ResetAllOption").bind("click", function () {
  chrome.storage.sync.set({ Ext: defaultExt });
  chrome.storage.sync.set({ Type: defaultType });
  chrome.storage.sync.set({ Debug: defaultDebug, TitleName: defaultTitleName, OtherAutoClear: defaultOtherAutoClear, Potplayer: defaultPotplayer, });
  chrome.runtime.sendMessage('RefreshOption');
  location.reload();
});

function Save() {
  let Ext = new Array();
  let Type = new Array();
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
    } else {
      if (GetText.includes("/")) {
        Type.push({ type: GetText.toLowerCase(), size: GetSize, state: GetState });
      } else {
        alert("类型输入不正确");
        location.reload();
      }
    }
  });
  chrome.storage.sync.set({ Ext: Ext });
  chrome.storage.sync.set({ Type: Type });
  chrome.runtime.sendMessage('RefreshOption');
  // location.reload();
}