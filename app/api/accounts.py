from fastapi import APIRouter

from app.clients.wechat_client import WeChatAPIError
from app.dependencies import wechat_client
from app.schemas import AccountTestResult


router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.post("/test", response_model=AccountTestResult)
def test_account():
    try:
        wechat_client.test_connection()
        mode = "mock" if wechat_client.mock else "live"
        return AccountTestResult(ok=True, mode=mode, message="公众号连接检查通过。" if mode == "live" else "Mock 模式可用，无需真实公众号凭据。")
    except WeChatAPIError as exc:
        return AccountTestResult(ok=False, mode="live", message=f"{exc.code}: {exc.message}")
