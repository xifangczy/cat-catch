import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.m3u8_parser import M3U8Parser, M3U8Segment, M3U8Stream


def test_is_master():
    content = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nvideo.m3u8"
    parser = M3U8Parser(content, "https://example.com/")
    assert parser.is_master() is True


def test_is_not_master():
    content = "#EXTM3U\n#EXTINF:10,\nsegment1.ts\n#EXTINF:10,\nsegment2.ts"
    parser = M3U8Parser(content, "https://example.com/")
    assert parser.is_master() is False


def test_parse_media_playlist():
    content = "#EXTM3U\n#EXTINF:10,\nsegment1.ts\n#EXTINF:10,\nsegment2.ts"
    parser = M3U8Parser(content, "https://example.com/video/")
    streams, segments = parser.parse()
    assert len(streams) == 0
    assert len(segments) == 2
    assert segments[0].url == "https://example.com/video/segment1.ts"
    assert segments[0].duration == 10.0


def test_resolve_url():
    parser = M3U8Parser("", "https://example.com/video/")
    assert parser._resolve_url("segment1.ts") == "https://example.com/video/segment1.ts"
    assert parser._resolve_url("https://cdn.example.com/seg.ts") == "https://cdn.example.com/seg.ts"
