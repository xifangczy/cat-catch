$(function () {
    //获取json_url
    var url = new RegExp("[?]url=([^\n&]*)").exec(window.location.href);
    url = url ? decodeURIComponent(url[1]) : undefined;

    var referer = new RegExp("&referer=([^\n&]*)").exec(window.location.href);
    referer = referer ? decodeURIComponent(referer[1]) : undefined;

    var jsonContent = "";
    var options = {
        collapsed: true,
        rootCollapsable: false,
        withQuotes: false,
        withLinks: true
    };

    // 修改Referer
    chrome.tabs.getCurrent(function (tabs) {
        let tabId = tabs.id;
        if (referer && referer != undefined && referer != "" && referer != "undefined") {
            chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [tabId],
                addRules: [{
                    "id": tabId,
                    "action": {
                        "type": "modifyHeaders",
                        "requestHeaders": [{
                            "header": "Referer",
                            "operation": "set",
                            "value": referer
                        }]
                    },
                    "condition": {
                        "tabIds": [tabId],
                        "resourceTypes": ["xmlhttprequest"]
                    }
                }]
            });
        }

        $.ajax({
            url: url,
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