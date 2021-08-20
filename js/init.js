if(typeof localStorage['Ext']==='undefined' || localStorage['Ext'] == ''){
    var Ext = new Array(
        {"ext":"flv","size":0},
        {"ext":"hlv","size":0},
        {"ext":"f4v","size":0},
        {"ext":"mp4","size":0},
        {"ext":"mp3","size":0},
        {"ext":"wma","size":0},
        {"ext":"wav","size":0},
        {"ext":"m4a","size":0},
        {"ext":"letv","size":0},
        {"ext":"ts","size":0},
        {"ext":"webm","size":0},
        {"ext":"ogg","size":0},
        {"ext":"ogv","size":0},
        {"ext":"acc","size":0},
        {"ext":"mov","size":0},
        {"ext":"mkv","size":0},
        {"ext":"m4s","size":0},
        {"ext":"m3u8","size":0}
    );
    localStorage['Ext'] = JSON.stringify(Ext);
}

if(typeof localStorage['Type']==='undefined'){
    var Type = new Array(
        {"Type":"video/*"},
        {"Type":"audio/*"}
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

if(typeof localStorage['TitleName']==='undefined'){
    localStorage['TitleName'] = false;
}