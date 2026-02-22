import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.http import HttpClient


def test_http_client_init():
    client = HttpClient(timeout=10, max_retries=5)
    assert client.timeout == 10
    assert client.session.headers['User-Agent']


def test_get_base_url():
    url = "https://example.com/path/to/video.mp4"
    base = HttpClient.get_base_url(url)
    assert base == "https://example.com"


def test_join_url():
    base = "https://example.com"
    path = "/path/video.mp4"
    joined = HttpClient.join_url(base, path)
    assert joined == "https://example.com/path/video.mp4"
