import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models.resource import ResourceType, MediaResource


def test_resource_creation():
    resource = MediaResource(
        url="https://example.com/video.mp4",
        type=ResourceType.VIDEO,
        title="Test Video"
    )
    assert resource.url == "https://example.com/video.mp4"
    assert resource.type == ResourceType.VIDEO
    assert resource.title == "Test Video"
    assert resource.headers == {}


def test_size_mb_calculation():
    resource = MediaResource(
        url="https://example.com/video.mp4",
        type=ResourceType.VIDEO,
        title="Test",
        size=52428800  # 50MB
    )
    assert resource.size_mb == 50.0


def test_display_info():
    resource = MediaResource(
        url="https://example.com/video.mp4",
        type=ResourceType.VIDEO,
        title="My Video",
        size=52428800,
        quality="1080p"
    )
    info = resource.display_info(1)
    assert "[1]" in info
    assert "VIDEO" in info
    assert "My Video" in info
    assert "50.0MB" in info
    assert "1080p" in info
