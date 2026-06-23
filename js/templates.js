class Template {
    // ---------- 管道处理器 ----------
    static _processors = {
        slice: (txt, arg) => txt.slice(...arg),
        replace: (txt, arg) => txt.replace(...arg),
        replaceAll: (txt, arg) => txt.replaceAll(...arg),
        regexp: (txt, arg) => {
            const match = txt.match(new RegExp(...arg));
            if (!match) return "";
            return match.slice(1).filter(Boolean).map(s => s.trim()).join("");
        },
        exists: (txt, arg) => txt ? arg[0]?.replaceAll("*", txt) : (arg[1]?.replaceAll("*", txt) || ""),
        prepend: (txt, arg) => (arg[0] || "") + txt,
        concat: (txt, arg) => txt + (arg[0] || ""),
        to: (txt, arg) => {
            const type = arg[0];
            switch (type) {
                case "base64":
                    try {
                        return btoa(encodeURIComponent(txt).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
                    } catch { return txt; }
                case "urlEncode": return encodeURIComponent(txt);
                case "urlDecode": return decodeURIComponent(txt);
                case "lowerCase": return txt.toLowerCase();
                case "upperCase": return txt.toUpperCase();
                case "trim": return txt.trim();
                case "filter": return stringModify(txt.trim());
                default: return txt;
            }
        },
        find: (txt, arg, data) => {
            if (data?.pageDOM && data.pageDOM instanceof Document) {
                try { return data.pageDOM.querySelector(arg[0])?.innerText?.trim() || ""; } catch { return ""; }
            }
            return "";
        },
        filter: (txt, arg) => stringModify(txt, arg[0]),
        prompt: (txt) => window.prompt("", txt) || ""
    };

    // ---------- 核心入口（即原来的 templates 函数）----------
    static render(text, data) {
        if (isEmpty(text)) return "";

        // 补全文件名相关数据
        try { data.fullFileName = new URL(data.url).pathname.split("/").pop(); } catch { data.fullFileName = 'NULL'; }
        data.fileName = data.fullFileName.split(".");
        if (data.fileName.length > 1) data.fileName.pop();
        data.fileName = data.fileName.join(".");
        if (isEmpty(data.ext)) {
            data.ext = data.fullFileName.split(".");
            data.ext = data.ext.length === 1 ? "" : data.ext[data.ext.length - 1];
        }

        const date = new Date();
        const trimData = {
            url: data.url ?? "",
            referer: data.requestHeaders?.referer ?? "",
            origin: data.requestHeaders?.origin ?? "",
            initiator: data.requestHeaders?.referer ? data.requestHeaders.referer : data.initiator,
            webUrl: data.webUrl ?? "",
            title: data._title ?? data.title ?? "NULL",
            pageDOM: data.pageDOM,
            cookie: data.cookie ?? "",
            tabId: data.tabId ?? 0,
            year: date.getFullYear(),
            month: appendZero(date.getMonth() + 1),
            date: appendZero(date.getDate()),
            day: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()],
            fullDate: `${date.getFullYear()}-${appendZero(date.getMonth() + 1)}-${appendZero(date.getDate())}`,
            time: `${appendZero(date.getHours())}'${appendZero(date.getMinutes())}'${appendZero(date.getSeconds())}`,
            hours: appendZero(date.getHours()),
            minutes: appendZero(date.getMinutes()),
            seconds: appendZero(date.getSeconds()),
            now: Date.now(),
            timestamp: date.toISOString(),
            fullFileName: data.fullFileName ?? "",
            fileName: data.fileName ?? "",
            ext: data.ext ?? "",
            mobileUserAgent: G.MobileUserAgent,
            userAgent: G.userAgent ?? navigator.userAgent,
        };
        trimData.title = trimData.title.replace(/[/\\]/g, "_");
        const _data = { ...data, ...trimData };

        const ast = this._parse(text);
        return this._evaluate(ast, _data, trimData);
    }

    // ---------- 解析（原 TemplateParser）----------
    static _parse(input) {
        const nodes = [];
        let pos = 0;
        const peek = (offset = 0) => pos + offset < input.length ? input[pos + offset] : '';
        const advance = () => pos < input.length ? input[pos++] : '';
        const eof = () => pos >= input.length;

        const readUntilTerminator = (terminator) => {
            let result = '', inDouble = false, inSingle = false, escaped = false;
            while (!eof()) {
                const ch = advance();
                if (escaped) { result += ch; escaped = false; continue; }
                if (ch === '\\') { escaped = true; result += ch; continue; }
                if (!inSingle && ch === '"') inDouble = !inDouble;
                else if (!inDouble && ch === "'") inSingle = !inSingle;
                if (!inDouble && !inSingle && ch === terminator) return result;
                result += ch;
            }
            return result;
        };

        const parseText = () => {
            const start = pos;
            while (!eof() && !(peek() === '$' && peek(1) === '{')) advance();
            return { type: 'text', value: input.slice(start, pos) };
        };

        const readBalancedContent = () => {
            let depth = 1, start = pos, inDouble = false, inSingle = false, escaped = false;
            while (!eof() && depth > 0) {
                const ch = advance();
                if (escaped) { escaped = false; continue; }
                if (ch === '\\') { escaped = true; continue; }
                if (!inSingle && ch === '"') inDouble = !inDouble;
                else if (!inDouble && ch === "'") inSingle = !inSingle;
                else if (!inDouble && !inSingle) {
                    if (ch === '$' && peek() === '{') depth++;
                    else if (ch === '}') {
                        depth--;
                        if (depth === 0) return input.slice(start, pos - 1);
                    }
                }
            }
            return input.slice(start, pos);
        };

        const findTopLevelPipe = (str) => {
            let inDouble = false, inSingle = false, escaped = false;
            for (let i = 0; i < str.length; i++) {
                const ch = str[i];
                if (escaped) { escaped = false; continue; }
                if (ch === '\\') { escaped = true; continue; }
                if (!inSingle && ch === '"') inDouble = !inDouble;
                else if (!inDouble && ch === "'") inSingle = !inSingle;
                else if (!inDouble && !inSingle && ch === '|') return i;
            }
            return -1;
        };

        const splitByTopLevelPipe = (str) => {
            const parts = [];
            let start = 0, inDouble = false, inSingle = false, escaped = false;
            for (let i = 0; i < str.length; i++) {
                const ch = str[i];
                if (escaped) { escaped = false; continue; }
                if (ch === '\\') { escaped = true; continue; }
                if (!inSingle && ch === '"') inDouble = !inDouble;
                else if (!inDouble && ch === "'") inSingle = !inSingle;
                else if (!inDouble && !inSingle && ch === '|') {
                    parts.push(str.slice(start, i));
                    start = i + 1;
                }
            }
            parts.push(str.slice(start));
            return parts;
        };

        const parseOnePipe = (pipeStr) => {
            const colonIdx = pipeStr.indexOf(':');
            let name, argsRaw;
            if (colonIdx === -1) { name = pipeStr.trim(); argsRaw = ''; }
            else { name = pipeStr.slice(0, colonIdx).trim(); argsRaw = pipeStr.slice(colonIdx + 1).trim(); }

            const argStrings = argsRaw ? Template._splitString(argsRaw, ',') : [];
            const args = argStrings.map(arg => {
                const cleanArg = arg.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
                if (cleanArg.includes('${')) {
                    return Template._parse(cleanArg); // 嵌套解析
                }
                return { type: 'text', value: cleanArg };
            });
            return { type: 'pipe', name, args };
        };

        const parsePipeChain = (chainStr) => {
            return splitByTopLevelPipe(chainStr).map(s => parseOnePipe(s.trim()));
        };

        const parseTag = () => {
            advance(); advance(); // 跳过 ${
            const content = readBalancedContent();
            const pipeIdx = findTopLevelPipe(content);
            const varName = pipeIdx === -1 ? content.trim() : content.slice(0, pipeIdx).trim();
            const pipes = pipeIdx === -1 ? [] : parsePipeChain(content.slice(pipeIdx + 1).trim());
            return { type: 'tag', varName, pipes };
        };

        while (pos < input.length) {
            if (peek() === '$' && peek(1) === '{') {
                nodes.push(parseTag());
            } else {
                nodes.push(parseText());
            }
        }
        return nodes;
    }

    // ---------- 求值（原 TemplateEvaluator）----------
    static _evaluate(nodes, data, trimData) {
        let result = '';
        for (const node of nodes) {
            if (node.type === 'text') {
                result += node.value;
            } else if (node.type === 'tag') {
                result += this._evalTag(node, data, trimData);
            }
        }
        return result;
    }

    static _evalTag(tag, data, trimData) {
        let value;
        if (tag.varName === 'data') {
            const { pageDOM, year, month, date, day, fullDate, time, hours, minutes, seconds, mobileUserAgent, ...rest } = trimData;
            value = JSON.stringify(rest);
        } else {
            value = data[tag.varName];
        }

        let current = value !== undefined ? String(value) : '';
        if (!tag.pipes.length) {
            return value !== undefined ? String(value) : '${' + tag.varName + '}';
        }

        for (const pipe of tag.pipes) {
            const resolvedArgs = pipe.args.map(arg => {
                if (Array.isArray(arg)) {
                    return this._evaluate(arg, data, trimData);
                } else if (arg && arg.type === 'text') {
                    return arg.value;
                }
                return arg;
            });

            if (isEmpty(current) && !['exists', 'find', 'prompt'].includes(pipe.name)) return '';
            if (resolvedArgs.length === 0 && !['filter', 'prompt'].includes(pipe.name)) break;

            const processor = Template._processors[pipe.name];
            if (processor) {
                current = processor(current, resolvedArgs, data);
            }
        }
        return current;
    }

    // ---------- 字符串分割辅助 ----------
    static _splitString(text, separator) {
        text = text.trim();
        if (text.length === 0) return [];
        const parts = [];
        let inQuotes = false, inSingle = false, start = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === separator && !inQuotes && !inSingle) {
                parts.push(text.slice(start, i));
                start = i + 1;
            } else if (text[i] === '"' && !inSingle) {
                inQuotes = !inQuotes;
            } else if (text[i] === "'" && !inQuotes) {
                inSingle = !inSingle;
            }
        }
        parts.push(text.slice(start));
        return parts;
    }
}

// 保留原来的全局函数名，保持向后兼容
function templates(text, data) {
    return Template.render(text, data);
}