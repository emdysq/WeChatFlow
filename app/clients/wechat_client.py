from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings


@dataclass
class WeChatAPIError(Exception):
    code: str
    message: str

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"


class WeChatClient:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None) -> None:
        self.settings = settings
        self._transport = transport
        self._access_token: str | None = None
        self._token_expires_at: float = 0

    @property
    def mock(self) -> bool:
        return self.settings.wechat_mock

    def _client(self) -> httpx.Client:
        return httpx.Client(
            base_url=self.settings.wechat_api_base_url.rstrip("/"),
            timeout=self.settings.request_timeout_seconds,
            transport=self._transport,
        )

    def _ensure_configured(self) -> None:
        if self.mock:
            return
        if not self.settings.wechat_configured:
            raise WeChatAPIError("WX2000", "未配置 WECHAT_APP_ID / WECHAT_APP_SECRET。")

    @staticmethod
    def _raise_if_wechat_error(data: dict[str, Any]) -> None:
        errcode = data.get("errcode")
        if errcode not in (None, 0, "0"):
            msg = str(data.get("errmsg") or "Unknown WeChat API error")
            if int(errcode) in {40164, 89503}:
                raise WeChatAPIError("WX2002", f"当前服务器 IP 可能未加入微信 API 白名单：{msg}")
            if int(errcode) in {40013, 40125, 41004}:
                raise WeChatAPIError("WX2001", f"公众号鉴权失败：{msg}")
            raise WeChatAPIError(f"WX-{errcode}", msg)

    def get_access_token(self) -> str:
        self._ensure_configured()
        if self.mock:
            return "mock-access-token"
        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token

        with self._client() as client:
            response = client.get(
                "/cgi-bin/token",
                params={
                    "grant_type": "client_credential",
                    "appid": self.settings.wechat_app_id,
                    "secret": self.settings.wechat_app_secret,
                },
            )
            response.raise_for_status()
            data = response.json()
            self._raise_if_wechat_error(data)
            token = data.get("access_token")
            if not token:
                raise WeChatAPIError("WX2001", "微信接口未返回 access_token。")
            self._access_token = token
            self._token_expires_at = time.time() + int(data.get("expires_in", 7200))
            return token

    def test_connection(self) -> None:
        self.get_access_token()

    def upload_article_image(self, content: bytes, filename: str, content_type: str = "image/jpeg") -> str:
        if self.mock:
            digest = hashlib.sha1(content or filename.encode()).hexdigest()[:16]
            return f"https://mock.wechatflow.local/article-images/{digest}.jpg"
        token = self.get_access_token()
        with self._client() as client:
            response = client.post(
                "/cgi-bin/media/uploadimg",
                params={"access_token": token},
                files={"media": (filename, content, content_type)},
            )
            response.raise_for_status()
            data = response.json()
            self._raise_if_wechat_error(data)
            url = data.get("url")
            if not url:
                raise WeChatAPIError("WX2003", "正文图片上传成功但未返回微信图片 URL。")
            return url

    def upload_cover(self, content: bytes, filename: str, content_type: str = "image/jpeg") -> str:
        if self.mock:
            digest = hashlib.sha1(content or filename.encode()).hexdigest()[:16]
            return f"mock-thumb-{digest}"
        token = self.get_access_token()
        with self._client() as client:
            response = client.post(
                "/cgi-bin/material/add_material",
                params={"access_token": token, "type": "image"},
                files={"media": (filename, content, content_type)},
            )
            response.raise_for_status()
            data = response.json()
            self._raise_if_wechat_error(data)
            media_id = data.get("media_id")
            if not media_id:
                raise WeChatAPIError("WX2003", "封面上传成功但未返回 media_id。")
            return media_id

    def create_draft(self, article_payload: dict[str, Any]) -> str:
        if self.mock:
            digest = hashlib.sha1(str(article_payload).encode("utf-8")).hexdigest()[:20]
            return f"mock-media-{digest}"
        token = self.get_access_token()
        with self._client() as client:
            response = client.post(
                "/cgi-bin/draft/add",
                params={"access_token": token},
                json={"articles": [article_payload]},
            )
            response.raise_for_status()
            data = response.json()
            self._raise_if_wechat_error(data)
            media_id = data.get("media_id")
            if not media_id:
                raise WeChatAPIError("WX2004", "创建公众号草稿失败：接口未返回 media_id。")
            return media_id
