import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from analyzer.html import HtmlAnalyzer
from models.resource import ResourceType


def test_extract_title():
    analyzer = HtmlAnalyzer()
    assert analyzer._extract_title("https://example.com/video.mp4") == "video.mp4"
    assert analyzer._extract_title("https://example.com/path/to/") == "未命名"


def test_get_extension():
    analyzer = HtmlAnalyzer()
    assert analyzer._get_extension("https://example.com/video.mp4") == ".mp4"
    assert analyzer._get_extension("https://example.com/audio.mp3") == ".mp3"
    assert analyzer._get_extension("https://example.com/stream.m3u8") == ".m3u8"
