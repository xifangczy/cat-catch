class Base64 {
  /**
   * 将字符串编码为Base64（支持UTF-8）
   * @param {string} str - 需要编码的原始字符串
   * @returns {string} Base64编码结果
   */
  static encode(str) {
    // 使用TextEncoder将字符串转换为UTF-8字节数组
    const encoder = new TextEncoder();
    const data = encoder.encode(str);

    // 将字节数组转换为二进制字符串
    let binary = '';
    data.forEach(byte => binary += String.fromCharCode(byte));

    // 使用浏览器内置方法进行Base64编码
    return btoa(binary);
  }

  /**
   * 解码Base64字符串为原始字符串（支持UTF-8）
   * @param {string} base64Str - Base64编码字符串
   * @returns {string} 解码后的原始字符串
   */
  static decode(base64Str) {
    // 解码Base64得到二进制字符串
    const binaryStr = atob(base64Str);

    // 将二进制字符串转换为字节数组
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // 使用TextDecoder将字节数组转换为UTF-8字符串
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }
}
window.Base64 = Base64;