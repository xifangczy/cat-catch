(function () {
    if (window.CatCatchI18n) { return; }
    window.CatCatchI18n = {
    languages: ["en", "es", "zh"],
        downloadCapturedData: {
            en: "Download the captured data",
            es: "Descargar datos captura",
            zh: "下载已捕获的数据"
        },
        deleteCapturedData: {
            en: "Delete the captured data",
            es: "Borrar datos captura",
            zh: "删除已捕获数据"
        },
        capturedBeginning: {
            en: "Capture from the beginning",
            es: "Capturar desde inicio",
            zh: "从头捕获"
        },
        alwaysCapturedBeginning: {
            en: "Always Capture from the beginning",
            es: "Siempre desde Inicio",
            zh: "始终从头捕获"
        },
        hide: {
            en: "Hide",
            es: "Ocultar",
            zh: "隐藏"
        },
        close: {
            en: "Close",
            es: "Cerrar",
            zh: "关闭"
        },
        save: {
            en: "Save",
            es: "Guardar",
            zh: "保存"
        },
	checkHead: {
        en: "Clean up unnecessary header data",
        es: "Borrar datos cabecera innecesarios",
        zh: "清理多余头部数据"	
	},	
        automaticDownload: {
            en: "Automatic download",
            es: "Descarga automática",
            zh: "完成捕获自动下载"
        },
        ffmpeg: {
        en: "using ffmpeg",
        es: "Usar ffmpeg",
        zh: "使用ffmpeg"
    },
    fileName: {
        en: "File name",
        es: "Nombre archivo",
        zh: "文件名"
    },
    selector: {
        en: "Selector",
        es: "Selector",
        zh: "表达式"
    },
    regular: {
        en: "Regular",
        es: "Regular",
        zh: "正则"
    },
    notSet: {
        en: "Not set",
        es: "No puesto",
        zh: "未设置"
    },
    usingSelector: {
        en: "selector",
        es: "selector",
        zh: "表达式提取"
    },
    usingRegular: {
        en: "regular",
        es: "regular",
        zh: "正则提取"
    },
    customize: {
        en: "Customize",
        es: "Personalizar",
        zh: "自定义"
    },
	    cleanHead: {
        en: "Clean up redundant header data",
        es: "Limpiar datos cabecera redundantes",
        zh: "清理多余头部数据"
    },
    clearCache: {
        en: "Clear cache",
        es: "Borrar cache",
        zh: "清理缓存"
    },
    cleanupCompleted: {
        en: "Cleanup completed",
        es: "Limpieza finalizada",
        zh: "清理完成"
    },
    downloadConfirmation: {
        en: "Downloading in advance may cause data confusion. Confirm?",
        es: "La descarga anticipada puede causar confusión de datos. ¿Confirmar?",
        zh: "提前下载可能会造成数据混乱.确认？"
    },
    fileNameError: {
        en: "Unable to fetch or the content is empty!",
        es: "No se puede recuperar o el contenido está vacío.",
        zh: "无法获取或内容为空!"
    },
    noData: {
        en: "No data",
        es: "Sin datos",
        zh: "没抓到有效数据!"
    },
    waiting: {
        en: "Waiting for video to play",
        es: "Esperando reproducir vídeo",
        zh: "等待视频播放"
    },
    capturingData: {
        en: "Capturing data",
        es: "Capturando datos",
        zh: "捕获数据中"
    },
    captureCompleted: {
        en: "Capture completed",
        es: "Captura finalizada",
        zh: "捕获完成"
    },
    downloadCompleted: {
        en: "Download completed",
        es: "Descarga completada",	
        zh: "下载完毕"
    },
    selectVideo: {
        en: "Select Video",
        es: "Seleccionar vídeo",
        zh: "选择视频"
    },
    selectAudio: {
        en: "Select Audio",
        es: "Seleccionar audio",
        zh: "选择音频"
    },
    recordEncoding: {
        en: "Record Encoding",
        es: "Codificando grabación",
        zh: "录制编码"
    },
    readVideo: {
        en: "Read Video",
        es: "Leer vídeo",
        zh: "读取视频"
    },
    startRecording: {
        en: "Start Recording",
        es: "Iniciar grabación",
        zh: "开始录制"
    },
    stopRecording: {
        en: "Stop Recording",
        es: "Detener grabación",
        zh: "停止录制"
    },
    noVideoDetected: {
        en: "No video detected, Please read again",
        es: "No se ha detectado ningún vídeo, leer vídeo",
        zh: "没有检测到视频, 请重新读取"
    },
    recording: {
        en: "Recording",
        es: "Grabando",
        zh: "视频录制中"
    },
    recordingNotSupported: {
        en: "recording Not Supported",
        es: "grabación no compatible",
        zh: "不支持录制"
    },
    formatNotSupported: {
        en: "Format not supported",
        es: "Formato no compatible",
        zh: "不支持此格式"
    },
    clickToStartRecording: {
        en: "Click to start recording",
        es: "Clic para iniciar la grabación",
        zh: "请点击开始录制"
    },
    sentToFfmpeg: {
        en: "Sent to ffmpeg",
        es: "Enviar a ffmpeg",
        zh: "发送到ffmpeg"
    },
    recordingFailed: {
        en: "Recording failed",
        es: "Error al grabar",
        zh: "录制失败"
    },
    scriptNotSupported: {
        en: "This script is not supported",
        es: "Este script no es compatible",
        zh: "当前网页不支持此脚本"
    },
    dragWindow: {
        en: "Drag window",
        es: "Arrastrar ventana",
        zh: "拖动窗口"
    },
    autoToBuffered: {
        en: "Automatically jump to buffer",
        es: "Ir al buffer",
        zh: "自动跳转到缓冲尾"
    },
    save1hour: {
        en: "Save once every hour",
        es: "Guardar una vez cada hora",
        zh: "1小时保存一次"
    },
    recordingChangeEncoding: {
        en: "Cannot change encoding during recording",
        es: "No se puede cambiar la codificación durante la grabación",
        zh: "录制中不能更改编码"
    },
    streamEmpty: {
        en: "Media stream is empty",
        es: "El stream multimedia está vacío",
        zh: "媒体流为空"
    },
    notStream: {
        en: "Not a media stream object",
        es: "No es un objeto stream multimedia",
        zh: "非媒体流对象"
    },
    notStream: {
        en: "Not a media stream object",
        es: "No es un objeto stream multimedia",
        zh: "非媒体流对象"
    },
    streamAdded: {
        en: "Stream added",
        es: "Añadido stream",
        zh: "流已添加"
    },
    videoAndAudio: {
        en: "Includes both audio and video streams",
            es: "Incluir streams de audio y vídeo",
        zh: "已包含音频和视频流"
    },
    audioBits: {
        en: "Audio bit",
        es: "Tasa audio",
        zh: "音频码率"
    },
    videoBits: {
        en: "Video bits",
        es: "Tasa vídeo",
        zh: "视频码率"
    },
    frameRate: {
        en: "frame Rate",
        es: "cuadros/seg",
        zh: "帧率"
    },
    noHeader: {
        en: "No header data detected, please process with local tools",
        es: "No se han detectado datos de cabecera, procesar con herramientas locales",
        zh: "没有检测到视频头部数据, 请使用本地工具处理"
    },
    headData: {
        en: "Multiple header data found in media file, Clear it?",
        es: "Múltiples datos de cabecera encontrados en el archivo multimedia, ¿Borrar?",
        zh: "检测到多余头部数据, 是否清除?"
    },
    clearCacheConfirmation: {
        en: "Are you sure you want to clear the cache?",
        es: "¿Seguro que quieres borrar el caché?",
        zh: "确定要清除缓存吗?"
    },
    closeConfirmation: {
        en: "Are you sure you want to close?",
        es: "¿Seguro que quieres cerrar?",
            zh: "确定要关闭吗?"
    },
   completeClearCache: {
        en: "Clear data after downloading",
        es: "Borrar datos después de descargar",
        zh: "下载完成后清空数据"
        }
    };
})();