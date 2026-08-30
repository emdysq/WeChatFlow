from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "WeChatFlow"
    app_env: str = "development"
    database_url: str = "sqlite:///./wechatflow.db"
    wechat_mock: bool = True
    wechat_app_id: str = ""
    wechat_app_secret: str = ""
    wechat_api_base_url: str = "https://api.weixin.qq.com"
    request_timeout_seconds: float = 15.0
    max_image_bytes: int = 5 * 1024 * 1024
    upload_dir: str = "uploads"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def wechat_configured(self) -> bool:
        return bool(self.wechat_app_id and self.wechat_app_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
