$(function () {
    // url 参数解析
    const params = new URL(location.href).searchParams;
    const _url = params.get("url");
    const _referer = params.get("referer");

    var jsonContent = "";
    var options = {
        collapsed: true,
        rootCollapsable: false,
        withQuotes: false,
        withLinks: true
    };

    // 修改Referer
    chrome.tabs.getCurrent(function (tabs) {
        if (_referer && !isEmpty(_referer)) {
            chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [tabs.id],
                addRules: [{
                    "id": tabs.id,
                    "action": {
                        "type": "modifyHeaders",
                        "requestHeaders": [{
                            "header": "Referer",
                            "operation": "set",
                            "value": _referer
                        }]
                    },
                    "condition": {
                        "tabIds": [tabs.id],
                        "resourceTypes": ["xmlhttprequest"]
                    }
                }]
            });
        }

        $.ajax({
            url: _url,
            dataType: "text",
        }).fail(function (result) {
            console.log(result);
            $('#json-renderer').html("json文件获取失败");
            $("#collapsed").hide();
        }).done(function (result) {
            // console.log(result);
            result = result.replace(/^try{/, "").replace(/}catch\(e\){.*}$/ig, ""); //去除try{}catch(e){}
            let regexp = [
                /^.*=({.*}).*$/,
                /^.*\(({.*})\).*$/
            ]
            for (let regex of regexp) {
                let res = new RegExp(regex, "ig").exec(result);
                if (res) {
                    // console.log(res);
                    result = res[1];
                    break;
                }
            }
            // console.log(result);
            jsonContent = JSON.parse(result);
            renderJson();
        });
    });

    function renderJson() {
        $('#json-renderer').jsonViewer(jsonContent, options);
    }
    $("#collapsed").click(function () {
        options.collapsed = !options.collapsed;
        if (options.collapsed) {
            collapsed.innerHTML = "展开所有节点";
        } else {
            collapsed.innerHTML = "折叠所有节点";
        }
        renderJson();
    });
});