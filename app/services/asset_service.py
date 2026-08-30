from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.clients.wechat_client import WeChatAPIError, WeChatClient
from app.config import Settings


class AssetService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _load(self, source: str) -> tuple[bytes, str, str]:
        parsed = urlparse(source)
        if parsed.scheme in {"http", "https"}:
            response = httpx.get(source, timeout=self.settings.request_timeout_seconds, follow_redirects=True)
            response.raise_for_status()
            content = response.content
            filename = Path(parsed.path).name or "image.jpg"
            content_type = response.headers.get("content-type", "image/jpeg").split(";")[0]
        else:
            local = source
            if source.startswith("/uploads/"):
                local = str(self.settings.upload_path / Path(source).name)
            path = Path(local)
            if not path.exists() or not path.is_file():
                raise WeChatAPIError("WX2003", f"无法读取图片：{source}")
            content = path.read_bytes()
            filename = path.name
            content_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"

        if len(content) > self.settings.max_image_bytes:
            raise WeChatAPIError("WX2003", f"图片 {filename} 超过大小限制。")
        return content, filename, content_type

    def rewrite_article_images(self, html: str, client: WeChatClient) -> tuple[str, int]:
        soup = BeautifulSoup(html or "", "html.parser")
        count = 0
        for img in soup.find_all("img"):
            src = img.get("src")
            if not src:
                continue
            if client.mock:
                content = src.encode("utf-8")
                filename = Path(urlparse(src).path).name or "image.jpg"
                content_type = "image/jpeg"
            else:
                content, filename, content_type = self._load(src)
            img["src"] = client.upload_article_image(content, filename, content_type)
            count += 1
        return str(soup), count

    def upload_cover(self, cover_path: str, client: WeChatClient) -> str:
        if client.mock:
            content = cover_path.encode("utf-8")
            filename = Path(cover_path).name or "cover.jpg"
            return client.upload_cover(content, filename, "image/jpeg")
        content, filename, content_type = self._load(cover_path)
        return client.upload_cover(content, filename, content_type)
