// url 参数解析
const params = new URL(location.href).searchParams;
let _m3u8Url = params.get("url");
const _referer = params.get("referer");
const _initiator = params.get("initiator");
const _title = params.get("title");
let tsAddArg = params.get("tsAddArg");
let autoReferer = params.get("autoReferer");
const tabId = parseInt(params.get("tabid"));
const key = params.get("key");

// 修改当前标签下的所有xhr的Referer
let refererReady = false;
_referer ? setReferer(_referer, () => { refererReady = true }) : deleteReferer(() => { refererReady = true });