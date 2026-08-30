from app.clients.wechat_client import WeChatClient
from app.config import get_settings
from app.services.article_service import ArticleService
from app.services.asset_service import AssetService
from app.services.publish_service import PublishService


settings = get_settings()
article_service = ArticleService()
wechat_client = WeChatClient(settings)
asset_service = AssetService(settings)
publish_service = PublishService(article_service, asset_service, wechat_client)
