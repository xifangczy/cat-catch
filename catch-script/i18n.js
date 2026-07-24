(function () {
    "use strict";

    if (window.CatCatchI18n) {
        return;
    }

    const messages = {
        en: {
            downloadCapturedData: "Download the captured data",
            deleteCapturedData: "Delete the captured data",
            capturedBeginning: "Capture from the beginning",
            alwaysCapturedBeginning: "Always Capture from the beginning",
            hide: "Hide",
            close: "Close",
            save: "Save",
            checkHead: "Clean up unnecessary header data",
            automaticDownload: "Automatic download",
            ffmpeg: "using ffmpeg",
            fileName: "File name",
            selector: "Selector",
            regular: "Regular",
            notSet: "Not set",
            usingSelector: "selector",
            usingRegular: "regular",
            customize: "Customize",
            cleanHead: "Clean up redundant header data",
            clearCache: "Clear cache",
            cleanupCompleted: "Cleanup completed",
            downloadConfirmation: "Downloading in advance may cause data confusion. Confirm?",
            fileNameError: "Unable to fetch or the content is empty!",
            noData: "No data",
            waiting: "Waiting for video to play",
            capturingData: "Capturing data",
            captureCompleted: "Capture completed",
            downloadCompleted: "Download completed",
            selectVideo: "Select Video",
            selectAudio: "Select Audio",
            recordEncoding: "Record Encoding",
            readVideo: "Read Video",
            startRecording: "Start Recording",
            stopRecording: "Stop Recording",
            noVideoDetected: "No video detected, Please read again",
            recording: "Recording",
            recordingNotSupported: "recording Not Supported",
            formatNotSupported: "Format not supported",
            clickToStartRecording: "Click to start recording",
            sentToFfmpeg: "Sent to ffmpeg",
            recordingFailed: "Recording failed",
            scriptNotSupported: "This script is not supported",
            dragWindow: "Drag window",
            autoToBuffered: "Automatically jump to buffer",
            save1hour: "Save once every hour",
            save1GB: "Save once every 1GB",
            recordingChangeEncoding: "Cannot change encoding during recording",
            streamEmpty: "Media stream is empty",
            notStream: "Not a media stream object",
            streamAdded: "Stream added",
            videoAndAudio: "Includes both audio and video streams",
            audioBits: "Audio bit",
            videoBits: "Video bits",
            frameRate: "frame Rate",
            noHeader: "No header data detected, please process with local tools",
            headData: "Multiple header data found in media file, Clear it?",
            clearCacheConfirmation: "Are you sure you want to clear the cache?",
            closeConfirmation: "Are you sure you want to close?",
            completeClearCache: "Clear data after downloading",
            video: "Video",
            downloadError: "Download error, please check the network or try again later"
        },

        es: {
            downloadCapturedData: "Descargar datos captura",
            deleteCapturedData: "Borrar datos captura",
            capturedBeginning: "Capturar desde inicio",
            alwaysCapturedBeginning: "Siempre desde Inicio",
            hide: "Ocultar",
            close: "Cerrar",
            save: "Guardar",
            checkHead: "Borrar datos cabecera innecesarios",
            automaticDownload: "Descarga automática",
            ffmpeg: "Usar ffmpeg",
            fileName: "Nombre archivo",
            selector: "Selector",
            regular: "Regular",
            notSet: "No puesto",
            usingSelector: "selector",
            usingRegular: "regular",
            customize: "Personalizar",
            cleanHead: "Limpiar datos cabecera redundantes",
            clearCache: "Borrar cache",
            cleanupCompleted: "Limpieza finalizada",
            downloadConfirmation: "La descarga anticipada puede causar confusión de datos. ¿Confirmar?",
            fileNameError: "No se puede recuperar o el contenido está vacío.",
            noData: "Sin datos",
            waiting: "Esperando reproducir vídeo",
            capturingData: "Capturando datos",
            captureCompleted: "Captura finalizada",
            downloadCompleted: "Descarga completada",
            selectVideo: "Seleccionar vídeo",
            selectAudio: "Seleccionar audio",
            recordEncoding: "Codificando grabación",
            readVideo: "Leer vídeo",
            startRecording: "Iniciar grabación",
            stopRecording: "Detener grabación",
            noVideoDetected: "No se ha detectado ningún vídeo, leer vídeo",
            recording: "Grabando",
            recordingNotSupported: "grabación no compatible",
            formatNotSupported: "Formato no compatible",
            clickToStartRecording: "Clic para iniciar la grabación",
            sentToFfmpeg: "Enviar a ffmpeg",
            recordingFailed: "Error al grabar",
            scriptNotSupported: "Este script no es compatible",
            dragWindow: "Arrastrar ventana",
            autoToBuffered: "Ir al buffer",
            save1hour: "Guardar una vez cada hora",
            save1GB: "Guardar una vez cada 1GB",
            recordingChangeEncoding: "No se puede cambiar la codificación durante la grabación",
            streamEmpty: "El stream multimedia está vacío",
            notStream: "No es un objeto stream multimedia",
            streamAdded: "Añadido stream",
            videoAndAudio: "Incluir streams de audio y vídeo",
            audioBits: "Tasa audio",
            videoBits: "Tasa vídeo",
            frameRate: "cuadros/seg",
            noHeader: "No se han detectado datos de cabecera, procesar con herramientas locales",
            headData: "Múltiples datos de cabecera encontrados en el archivo multimedia, ¿Borrar?",
            clearCacheConfirmation: "¿Seguro que quieres borrar el caché?",
            closeConfirmation: "¿Seguro que quieres cerrar?",
            completeClearCache: "Borrar datos después de descargar",
            video: "Vídeo",
            downloadError: "Error de descarga, compruebe la red o inténtelo de nuevo más tarde"
        },

        zh: {
            downloadCapturedData: "下载已捕获的数据",
            deleteCapturedData: "删除已捕获数据",
            capturedBeginning: "从头捕获",
            alwaysCapturedBeginning: "始终从头捕获",
            hide: "隐藏",
            close: "关闭",
            save: "保存",
            checkHead: "清理多余头部数据",
            automaticDownload: "完成捕获自动下载",
            ffmpeg: "使用ffmpeg",
            fileName: "文件名",
            selector: "表达式",
            regular: "正则",
            notSet: "未设置",
            usingSelector: "表达式提取",
            usingRegular: "正则提取",
            customize: "自定义",
            cleanHead: "清理多余头部数据",
            clearCache: "清理缓存",
            cleanupCompleted: "清理完成",
            downloadConfirmation: "提前下载可能会造成数据混乱.确认？",
            fileNameError: "无法获取或内容为空!",
            noData: "没抓到有效数据!",
            waiting: "等待视频播放",
            capturingData: "捕获数据中",
            captureCompleted: "捕获完成",
            downloadCompleted: "下载完毕",
            selectVideo: "选择视频",
            selectAudio: "选择音频",
            recordEncoding: "录制编码",
            readVideo: "读取视频",
            startRecording: "开始录制",
            stopRecording: "停止录制",
            noVideoDetected: "没有检测到视频, 请重新读取",
            recording: "视频录制中",
            recordingNotSupported: "不支持录制",
            formatNotSupported: "不支持此格式",
            clickToStartRecording: "请点击开始录制",
            sentToFfmpeg: "发送到ffmpeg",
            recordingFailed: "录制失败",
            scriptNotSupported: "当前网页不支持此脚本",
            dragWindow: "拖动窗口",
            autoToBuffered: "自动跳转到缓冲尾",
            save1hour: "1小时保存一次",
            save1GB: "每1GB保存一次",
            recordingChangeEncoding: "录制中不能更改编码",
            streamEmpty: "媒体流为空",
            notStream: "非媒体流对象",
            streamAdded: "流已添加",
            videoAndAudio: "已包含音频和视频流",
            audioBits: "音频码率",
            videoBits: "视频码率",
            frameRate: "帧率",
            noHeader: "没有检测到视频头部数据, 请使用本地工具处理",
            headData: "检测到多余头部数据, 是否清除?",
            clearCacheConfirmation: "确定要清除缓存吗?",
            closeConfirmation: "确定要关闭吗?",
            completeClearCache: "下载完成后清空数据",
            video: "视频",
            downloadError: "下载出错，请检查网络或稍后再试"
        }
    };

    const defaultLanguage = "en";
    const supportedLanguages = Object.keys(messages);

    /**
     * 标准化语言标签。
     *
     * en_US -> en-us
     * en-US -> en-us
     * zh_CN -> zh-cn
     */
    function normalizeLocale(locale) {
        if (typeof locale !== "string") {
            return "";
        }

        return locale
            .trim()
            .replace(/_/g, "-")
            .toLowerCase();
    }

    /**
     * 根据浏览器语言选择翻译。
     *
     * en-US -> en
     * en-GB -> en
     * es-ES -> es
     * es-MX -> es
     * zh-CN -> zh
     * zh-TW -> zh
     * 其他语言 -> en
     */
    function resolveLanguage(locales) {
        const localeList = Array.isArray(locales)
            ? locales
            : [locales];

        for (const value of localeList) {
            const locale = normalizeLocale(value);

            if (!locale) {
                continue;
            }

            // 优先匹配完整语言标签，方便以后支持 en-gb、zh-hant 等。
            if (supportedLanguages.includes(locale)) {
                return locale;
            }

            // 未找到完整标签时，退化为基础语言。
            const baseLanguage = locale.split("-")[0];

            if (supportedLanguages.includes(baseLanguage)) {
                return baseLanguage;
            }
        }

        return defaultLanguage;
    }

    const browserLanguages =
        Array.isArray(navigator.languages) &&
            navigator.languages.length > 0
            ? navigator.languages
            : [navigator.language];

    const language = resolveLanguage(browserLanguages);

    /*
     * 先复制默认语言，再用当前语言覆盖。
     * 如果某个语言缺少翻译，会自动使用英文翻译。
     */
    const i18n = Object.assign(
        Object.create(null),
        messages[defaultLanguage],
        messages[language]
    );

    /*
     * language 和 languages 设置为不可枚举属性，
     * 遍历 CatCatchI18n 时只会得到翻译内容。
     */
    Object.defineProperties(i18n, {
        language: {
            value: language,
            enumerable: false,
            writable: false,
            configurable: false
        },

        languages: {
            value: Object.freeze([...supportedLanguages]),
            enumerable: false,
            writable: false,
            configurable: false
        }
    });

    window.CatCatchI18n = Object.freeze(i18n);
})();