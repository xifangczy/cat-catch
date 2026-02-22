import requests
from typing import Optional, Dict
from requests.adapters import HTTPAdapter
from urllib.parse import urljoin, urlparse


class HttpClient:
    """HTTP请求封装类"""

    def __init__(self, timeout: int = 30, max_retries: int = 3):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        adapter = HTTPAdapter(max_retries=max_retries)
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)
        self.timeout = timeout

    def get(self, url: str, headers: Optional[Dict] = None, **kwargs) -> requests.Response:
        """发送GET请求"""
        merged_headers = {**self.session.headers, **(headers or {})}
        return self.session.get(url, headers=merged_headers, timeout=self.timeout, **kwargs)

    def get_content(self, url: str, headers: Optional[Dict] = None) -> bytes:
        """获取二进制内容"""
        response = self.get(url, headers=headers)
        response.raise_for_status()
        return response.content

    def get_text(self, url: str, headers: Optional[Dict] = None) -> str:
        """获取文本内容"""
        response = self.get(url, headers=headers)
        response.raise_for_status()
        return response.text

    def get_headers(self, url: str) -> Dict:
        """获取响应头"""
        response = self.head(url)
        return dict(response.headers)

    def head(self, url: str, headers: Optional[Dict] = None) -> requests.Response:
        """发送HEAD请求"""
        merged_headers = {**self.session.headers, **(headers or {})}
        return self.session.head(url, headers=merged_headers, timeout=self.timeout)

    @staticmethod
    def get_base_url(url: str) -> str:
        """获取基础URL"""
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}"

    @staticmethod
    def join_url(base: str, path: str) -> str:
        """拼接URL"""
        return urljoin(base, path)

    def close(self):
        """关闭会话"""
        self.session.close()


# 全局实例
default_client = HttpClient()
