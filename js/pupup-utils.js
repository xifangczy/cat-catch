// 复制选项
function copyLink(data) {
    let text = data.url;
    if (data.parsing == "m3u8") {
        text = G.copyM3U8;
    } else if (data.parsing == "mpd") {
        text = G.copyMPD;
    } else {
        text = G.copyOther;
    }
    return templates(text, data);
}
function isM3U8(data) {
    return (
        data.ext == "m3u8" ||
        data.ext == "m3u" ||
        data.type?.endsWith("/vnd.apple.mpegurl") ||
        data.type?.endsWith("/x-mpegurl") ||
        data.type?.endsWith("/mpegurl") ||
        data.type?.endsWith("/octet-stream-m3u8")
    )
}
function isMPD(data) {
    return (data.ext == "mpd" ||
        data.type == "application/dash+xml"
    )
}
function isJSON(data) {
    return (data.ext == "json" ||
        data.type == "application/json" ||
        data.type == "text/json"
    )
}
function isPicture(data) {
    return (data.type?.startsWith("image/") ||
        data.ext == "jpg" ||
        data.ext == "png" ||
        data.ext == "jpeg" ||
        data.ext == "bmp" ||
        data.ext == "gif" ||
        data.ext == "webp" ||
        data.ext == "svg"
    )
}
function isMediaExt(ext) {
    return ['ogg', 'ogv', 'mp4', 'webm', 'mp3', 'wav', 'm4a', '3gp', 'mpeg', 'mov', 'm4s', 'aac'].includes(ext);
}
function isMedia(data) {
    return isMediaExt(data.ext) || data.type?.startsWith("video/") || data.type?.startsWith("audio/");
}
/**
 * ari2a RPC发送一套资源
 * @param {object} data 资源对象
 * @param {Function} success 成功运行函数
 * @param {Function} error 失败运行函数
 */
function aria2AddUri(data, success, error) {
    const json = {
        "jsonrpc": "2.0",
        "id": "cat-catch-" + data.requestId,
        "method": "aria2.addUri",
        "params": []
    };
    if (G.aria2RpcToken) {
        json.params.push(`token:${G.aria2RpcToken}`);
    }
    const params = { out: data.downFileName };
    if (G.enableAria2RpcReferer) {
        params.header = [];
        params.header.push(G.userAgent ? G.userAgent : navigator.userAgent);
        if (data.requestHeaders?.referer) {
            params.header.push("Referer: " + data.requestHeaders.referer);
        }
        if (data.cookie) {
            params.header.push("Cookie: " + data.cookie);
        }
        if (data.requestHeaders?.authorization) {
            params.header.push("Authorization: " + data.requestHeaders.authorization);
        }
    }
    json.params.push([data.url], params);
    fetch(G.aria2Rpc, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(json)
    }).then(response => {
        return response.json();
    }).then(data => {
        success && success(data);
    }).catch(errMsg => {
        error && error(errMsg);
    });
}

// MQTT 相关功能
/**
 * 发送数据到 MQTT 服务器
 * @param {Object} data - 要发送的媒体数据
 * @returns {Promise} - 返回发送结果的 Promise
 */
function sendToMQTT(data) {
    return new Promise((resolve, reject) => {
        if (!G.mqttEnable) {
            reject("MQTT is not enabled");
            return;
        }

        // 使用配置的标题长度，如果未设置则默认为100
        const titleLength = G.mqttTitleLength || 100;
        const title = data.title.slice(0, titleLength) || "";

        // 准备要发送的数据
        const mqttData = {
            action: "media_found",
            url: data.url,
            title: title,
            ext: data.ext || "",
            type: data.type || "",
            timestamp: new Date().toISOString(),
        };

        // 创建 MQTT 连接并发送数据
        connectAndSendMQTT(mqttData)
            .then(() => {
                resolve(true);
            })
            .catch((error) => {
                console.error("MQTT send error:", error);
                reject("MQTT send failed: " + error.message);
            });
    });
}

/**
 * 连接到 MQTT 服务器并发送消息
 * @param {Object} data - 要发送的数据
 * @returns {Promise} - 连接和发送的 Promise
 */
function connectAndSendMQTT(data) {
    return new Promise((resolve, reject) => {
        try {
            // 构建 MQTT 连接 URL
            const protocol = G.mqttProtocol;
            const broker = G.mqttBroker;
            const port = G.mqttPort;
            const path = G.mqttPath;

            if (!protocol || !broker || !port || !path) {
                throw new Error("MQTT connection parameters are missing");
            }

            const mqttUrl = `${protocol}://${broker}:${port}${path}`;

            // 创建 MQTT 客户端选项
            const options = {
                clientId: `${G.mqttClientId || "cat-catch-client"}-${Math.random().toString(16).slice(2)}`,
                clean: true,
                connectTimeout: 10000,
                reconnectPeriod: 0 // 不自动重连，用完即断
            };

            // 添加用户名和密码（如果有）
            if (G.mqttUser) {
                options.username = G.mqttUser;
            }
            if (G.mqttPassword) {
                options.password = G.mqttPassword;
            }

            const mqttLib = window.mqtt || (typeof mqtt !== 'undefined' ? mqtt : null);
            if (!mqttLib) {
                throw new Error("MQTT library not found. Please check if lib/mqtt.min.js is loaded correctly.");
            }
            if (!mqttLib.connect) {
                throw new Error("MQTT.connect method not found. Available methods: " + Object.keys(mqttLib));
            }

            // 2. 创建连接阶段提示：正在连接 MQTT 服务器
            Tips(i18n.connectingToMQTT || "Connecting to MQTT server...", 2000);

            const client = mqttLib.connect(mqttUrl, options);
            // 连接成功
            client.on('connect', () => {

                const topic = G.mqttTopic || "cat-catch/media";
                const qos = parseInt(G.mqttQos) || 2;

                // 处理自定义数据格式
                let message;
                if (G.mqttDataFormat?.trim()) {
                    message = templates(G.mqttDataFormat, data);
                } else {
                    // 使用默认JSON格式
                    message = JSON.stringify(data);
                }

                // 3. 正在发送消息到 MQTT 服务器
                Tips(i18n.sendingMessageToMQTT || "Sending message to MQTT server...", 2000);

                // 发送消息
                client.publish(topic, message, { qos: qos }, (error) => {
                    if (error) {
                        console.error("MQTT publish error:", error);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            // 连接错误
            client.on('error', (error) => {
                console.error("MQTT connection error:", error);
                reject(error);
            });

            // 连接超时
            setTimeout(() => {
                if (!client.connected) {
                    client.end();
                    reject(new Error("MQTT connection timeout"));
                }
            }, 6000);

            // client.on('close', () => {
            //     console.log('MQTT connection closed');
            // });            

        } catch (error) {
            console.error("MQTT setup error:", error);
            reject(error);
        }
    });
}