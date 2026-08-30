import httpx
import pytest

from app.clients.wechat_client import WeChatAPIError, WeChatClient
from app.config import Settings


def test_mock_client_needs_no_credentials():
    client = WeChatClient(Settings(wechat_mock=True, wechat_app_id="", wechat_app_secret=""))
    assert client.get_access_token() == "mock-access-token"
    assert client.create_draft({"title": "x"}).startswith("mock-media-")


def test_live_client_maps_ip_whitelist_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"errcode": 40164, "errmsg": "invalid ip"})

    settings = Settings(wechat_mock=False, wechat_app_id="wx123", wechat_app_secret="secret")
    client = WeChatClient(settings, transport=httpx.MockTransport(handler))
    with pytest.raises(WeChatAPIError) as exc:
        client.get_access_token()
    assert exc.value.code == "WX2002"
