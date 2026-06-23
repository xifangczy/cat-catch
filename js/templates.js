/** 文本节点 */
class TextNode {
    constructor(value) { this.type = 'text'; this.value = value; }
}

/** 管道节点：一个函数名 + 参数列表 */
class PipeNode {
    constructor(name, args) {
        this.type = 'pipe';
        this.name = name;        // 函数名，如 'slice'
        this.args = args;        // 数组，元素可以是 TextNode 或 TagNode
    }
}

/** 标签节点：一个变量 + 可选管道链 */
class TagNode {
    constructor(varName, pipes) {
        this.type = 'tag';
        this.varName = varName;  // 变量名，如 'title'
        this.pipes = pipes;      // PipeNode[]
    }
}

class TemplateParser {
    constructor(input) {
        this.input = input;
        this.pos = 0;
    }

    parse() {
        const nodes = [];
        while (this.pos < this.input.length) {
            if (this.peek() === '$' && this.peek(1) === '{') {
                nodes.push(this.parseTag());
            } else {
                nodes.push(this.parseText());
            }
        }
        return nodes;
    }

    // ------ 基础辅助 ------
    peek(offset = 0) {
        const i = this.pos + offset;
        return i < this.input.length ? this.input[i] : '';
    }
    advance() {
        return this.pos < this.input.length ? this.input[this.pos++] : '';
    }
    eof() { return this.pos >= this.input.length; }

    /** 读取直到遇到指定字符，同时处理转义和引号 */
    readUntilTerminator(terminator) {
        let result = '';
        let inDouble = false, inSingle = false, escaped = false;
        while (!this.eof()) {
            const ch = this.advance();
            if (escaped) {
                result += ch;
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                result += ch;
                continue;
            }
            if (!inSingle && ch === '"') inDouble = !inDouble;
            else if (!inDouble && ch === "'") inSingle = !inSingle;

            if (!inDouble && !inSingle && ch === terminator) {
                return result; // 终止符本身不包含在结果内
            }
            result += ch;
        }
        return result; // 到达末尾未找到终止符
    }

    /** 解析普通文本直到下一个 `${` 或字符串结束 */
    parseText() {
        let start = this.pos;
        while (!this.eof()) {
            if (this.peek() === '$' && this.peek(1) === '{') break;
            this.advance();
        }
        const text = this.input.slice(start, this.pos);
        return new TextNode(text);
    }

    /** 解析 ${ ... } */
    parseTag() {
        this.advance(); // '$'
        this.advance(); // '{'
        // 读取整个内容直到对应的 '}' （考虑嵌套）
        const content = this.readBalancedContent();
        // 内容现在已经不包含外层的 ${ 和 }
        // 分割变量名和管道链
        const pipeIdx = this.findTopLevelPipe(content);
        const varName = pipeIdx === -1
            ? content.trim()
            : content.slice(0, pipeIdx).trim();
        const pipes = pipeIdx === -1 ? [] : this.parsePipeChain(content.slice(pipeIdx + 1).trim());

        return new TagNode(varName, pipes);
    }

    /** 读取直到匹配的 '}'，同时处理内部嵌套标签和引号 */
    readBalancedContent() {
        let depth = 1;
        let start = this.pos;
        let inDouble = false, inSingle = false, escaped = false;
        while (!this.eof() && depth > 0) {
            const ch = this.advance();
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (!inSingle && ch === '"') inDouble = !inDouble;
            else if (!inDouble && ch === "'") inSingle = !inSingle;
            else if (!inDouble && !inSingle) {
                if (ch === '$' && this.peek() === '{') depth++;
                else if (ch === '}') {
                    depth--;
                    if (depth === 0) return this.input.slice(start, this.pos - 1); // 不含 '}'
                }
            }
        }
        // 未闭合，返回已读内容
        return this.input.slice(start, this.pos);
    }

    /** 查找不在引号内的第一个管道符 '|' */
    findTopLevelPipe(str) {
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
    }

    /** 解析管道链字符串，返回 PipeNode[]，同时参数内部可能是嵌套标签 */
    parsePipeChain(chainStr) {
        // 先按顶级 '|' 分割（用自定义分割，不分割引号内的）
        const segments = this.splitByTopLevelPipe(chainStr);
        return segments.map(seg => this.parseOnePipe(seg.trim()));
    }

    /** 按顶级 '|' 分割，保留引号完整性 */
    splitByTopLevelPipe(str) {
        const parts = [];
        let start = 0;
        let inDouble = false, inSingle = false, escaped = false;
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
    }

    /** 解析单个管道项，如 "slice:0,5" 或 "exists:\"*\",\"${fileName}\"" */
    parseOnePipe(pipeStr) {
        const colonIdx = pipeStr.indexOf(':');
        let name, argsRaw;
        if (colonIdx === -1) {
            name = pipeStr.trim();
            argsRaw = '';
        } else {
            name = pipeStr.slice(0, colonIdx).trim();
            argsRaw = pipeStr.slice(colonIdx + 1).trim();
        }

        // 解析参数：按逗号分割（不分割引号内），然后每个参数可能又是一个子模板
        const argStrings = argsRaw ? splitString(argsRaw, ',') : [];
        const args = argStrings.map(arg => {
            // 去除首尾引号（splitString 保留引号内容，这里需要去除）
            const cleanArg = arg.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
            // 参数本身可能包含嵌套标签，需要递归解析为 AST
            // 注意：此处我们把参数视为一个独立的模板字符串，因为可能存在 ${...}
            if (cleanArg.includes('${')) {
                // 递归调用整个解析器，生成嵌套的节点列表（但大部分情况下只是一个 TagNode 或文本）
                const subParser = new TemplateParser(cleanArg);
                return subParser.parse(); // 返回节点数组，求值时再合并
            } else {
                return new TextNode(cleanArg);
            }
        });

        return new PipeNode(name, args);
    }
}

class TemplateEvaluator {
    constructor(data, trimData) {
        this.data = data;       // 合并后的 _data
        this.trimData = trimData;
    }

    /** 主求值入口 */
    evaluate(nodes) {
        let result = '';
        for (const node of nodes) {
            result += this.evalNode(node);
        }
        return result;
    }

    evalNode(node) {
        switch (node.type) {
            case 'text': return node.value;
            case 'tag': return this.evalTag(node);
            default: return '';
        }
    }

    evalTag(tagNode) {
        // 1. 获取变量值
        let value;
        if (tagNode.varName === 'data') {
            const { pageDOM, year, month, date, day, fullDate, time, hours, minutes, seconds, mobileUserAgent, ...rest } = this.trimData;
            value = JSON.stringify(rest);
        } else {
            value = this.data[tagNode.varName];
        }

        // 2. 没有管道直接返回
        if (!tagNode.pipes.length) {
            return value !== undefined ? String(value) : '${' + tagNode.varName + '}';
        }

        // 3. 依次应用管道
        let current = value !== undefined ? String(value) : '';
        for (const pipe of tagNode.pipes) {
            // 3.1 求值参数（嵌套标签 → 纯字符串数组）
            const resolvedArgs = pipe.args.map(arg => {
                if (Array.isArray(arg)) {
                    const subEval = new TemplateEvaluator(this.data, this.trimData);
                    return subEval.evaluate(arg);
                } else if (arg instanceof TextNode) {
                    return arg.value;
                }
                return arg;
            });

            // 3.2 空值/无参的校验（沿用旧逻辑）
            // 当前值为空且不是允许空输入的处理器 → 直接返回空
            if (isEmpty(current) && !['exists', 'find', 'prompt'].includes(pipe.name)) {
                return '';
            }
            // 无参数且不是不需要参数的处理器 → 保持原值跳过
            if (resolvedArgs.length === 0 && !['filter', 'prompt'].includes(pipe.name)) {
                break; // 不应用此管道，直接继续（或返回 current）
            }

            // 3.3 直接调用处理器，不再拼字符串
            const processor = templatesProcessors[pipe.name];
            if (processor) {
                current = processor(current, resolvedArgs, this.data);
            }
        }
        return current;
    }
}

/**
 * 分割字符串 不分割引号内的内容
 * @param {String} text 需要处理的文本
 * @param {String} separator 分隔符
 * @returns {String} 返回分割后的字符串
 */
function splitString(text, separator) {
    text = text.trim();
    if (text.length == 0) { return []; }
    const parts = [];
    let inQuotes = false;
    let inSingleQuotes = false;
    let start = 0;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === separator && !inQuotes && !inSingleQuotes) {
            parts.push(text.slice(start, i));
            start = i + 1;
        } else if (text[i] === '"' && !inSingleQuotes) {
            inQuotes = !inQuotes;
        } else if (text[i] === "'" && !inQuotes) {
            inSingleQuotes = !inSingleQuotes;
        }
    }
    parts.push(text.slice(start));
    return parts;
}

/**
 * 模板的函数处理处理器映射表
 */
const templatesProcessors = {
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
            case "urlEncode":
                return encodeURIComponent(txt);
            case "urlDecode":
                return decodeURIComponent(txt);
            case "lowerCase":
                return txt.toLowerCase();
            case "upperCase":
                return txt.toUpperCase();
            case "trim":
                return txt.trim();
            case "filter":
                return stringModify(txt.trim());
            default:
                return txt;
        }
    },
    find: (txt, arg, data) => {
        if (data?.pageDOM && data.pageDOM instanceof Document) {
            try {
                return data.pageDOM.querySelector(arg[0])?.innerText?.trim() || "";
            } catch { return ""; }
        }
        return "";
    },
    filter: (txt, arg) => stringModify(txt, arg[0]),
    prompt: (txt) => window.prompt("", txt) || ""
};

/**
 * 模板替换
 * @param {String} text 标签模板
 * @param {Object} data 填充的数据
 * @returns {String} 返回填充后的字符串
 */
function templates(text, data) {
    if (isEmpty(text)) { return ""; }
    // fullFileName
    try {
        data.fullFileName = new URL(data.url).pathname.split("/").pop();
    } catch (e) {
        data.fullFileName = 'NULL';
    }
    // fileName
    data.fileName = data.fullFileName.split(".");
    data.fileName.length > 1 && data.fileName.pop();
    data.fileName = data.fileName.join(".");
    // ext
    if (isEmpty(data.ext)) {
        data.ext = data.fullFileName.split(".");
        data.ext = data.ext.length == 1 ? "" : data.ext[data.ext.length - 1];
    }
    const date = new Date();
    const trimData = {
        // 资源信息
        url: data.url ?? "",
        referer: data.requestHeaders?.referer ?? "",
        origin: data.requestHeaders?.origin ?? "",
        initiator: data.requestHeaders?.referer ? data.requestHeaders.referer : data.initiator,
        webUrl: data.webUrl ?? "",
        title: data._title ?? data.title ?? "NULL",
        pageDOM: data.pageDOM,
        cookie: data.cookie ?? "",
        tabId: data.tabId ?? 0,

        // 时间相关
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

        // 文件名
        fullFileName: data.fullFileName ? data.fullFileName : "",
        fileName: data.fileName ? data.fileName : "",
        ext: data.ext ?? "",

        // 全局变量
        mobileUserAgent: G.MobileUserAgent,
        userAgent: G.userAgent ? G.userAgent : navigator.userAgent,
    }

    // 替换标题中的路径分隔符 避免作为文件名解析为路径
    trimData.title = trimData.title.replace(/[/\\]/g, "_");

    const _data = { ...data, ...trimData };

    const parser = new TemplateParser(text);
    const ast = parser.parse();                     // 解析为 AST
    const evaluator = new TemplateEvaluator(_data, trimData);
    return evaluator.evaluate(ast);                 // 求值
}