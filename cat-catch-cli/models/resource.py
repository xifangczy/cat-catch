from dataclasses import dataclass
from typing import Optional, List
from enum import Enum


class ResourceType(Enum):
    HLS = "hls"
    DASH = "dash"
    VIDEO = "video"
    AUDIO = "audio"


@dataclass
class MediaResource:
    url: str
    type: ResourceType
    title: str
    size: Optional[int] = None
    quality: Optional[str] = None
    duration: Optional[float] = None
    segments: Optional[List[str]] = None
    headers: dict = None

    def __post_init__(self):
        if self.headers is None:
            self.headers = {}

    @property
    def size_mb(self) -> Optional[float]:
        if self.size:
            return self.size / (1024 * 1024)
        return None

    @property
    def duration_str(self) -> Optional[str]:
        if self.duration:
            minutes = int(self.duration // 60)
            seconds = int(self.duration % 60)
            return f"{minutes:02d}:{seconds:02d}"
        return None

    def display_info(self, index: int) -> str:
        # 质量信息
        quality_str = f"[{self.quality}]" if self.quality else ""
        # 时长信息
        duration_str = f"⏱{self.duration_str}" if self.duration_str else ""
        # 大小信息
        if self.size_mb:
            if self.size_mb >= 1024:
                size_str = f"💾{self.size_mb/1024:.1f}GB"
            else:
                size_str = f"💾{self.size_mb:.0f}MB"
        else:
            size_str = "💾--"

        return f"[{index}] {self.type.value.upper()} {quality_str} {duration_str} {size_str} | {self.title}"
