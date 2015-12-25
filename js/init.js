if(typeof localStorage['Ext']==='undefined' || localStorage['Ext'] == ''){
    var Ext = new Array(
        {"ext":"swf","size":100},
        {"ext":"flv","size":10},
        {"ext":"hlv","size":10},
        {"ext":"f4v","size":10},
        {"ext":"mp4","size":10},
        {"ext":"mp3","size":10},
        {"ext":"wma","size":10},
        {"ext":"m4a","size":10},
        {"ext":"letv","size":10},
        {"ext":"ts","size":10},
        {"ext":"m3u8","size":1}
    );
    localStorage['Ext'] = JSON.stringify(Ext);
}

if(typeof localStorage['Type']==='undefined'){
    var Type = new Array(
        {"Type":"video/*"},
        {"Type":"audio/*"},
        {"Type":"application/octet-stream"}
    );
    localStorage['Type'] = JSON.stringify(Type);
}

if(typeof localStorage['repeat']==='undefined'){
    localStorage['repeat'] = false;
}

if(typeof localStorage['repeatReg']==='undefined'){
    localStorage['repeatReg'] = "\\?[\\S]+";
}

if(typeof localStorage['Debug']==='undefined'){
    localStorage['Debug'] = false;
}