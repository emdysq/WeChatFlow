"""Seed a small mock-mode dataset for portfolio demos."""

from pathlib import Path

from app.clients.wechat_client import WeChatClient
from app.config import get_settings
from app.database import SessionLocal, init_db
from app.schemas import ArticleCreate
from app.services.article_service import ArticleService
from app.services.asset_service import AssetService
from app.services.publish_service import PublishService


def main() -> None:
    settings = get_settings()
    if not settings.wechat_mock:
        raise SystemExit("seed_demo.py only runs when WECHAT_MOCK=true")

    init_db()
    markdown = Path("examples/demo.md").read_text(encoding="utf-8")
    article_service = ArticleService()
    publish_service = PublishService(
        article_service,
        AssetService(settings),
        WeChatClient(settings),
    )

    with SessionLocal() as db:
        article = article_service.create(
            db,
            ArticleCreate(
                title="AI 产品团队如何减少重复发布操作",
                author="WeChatFlow",
                digest="用可观察工作流替代重复的公众号发布动作。",
                markdown_content=markdown,
                cover_path="/uploads/demo-cover.jpg",
            ),
        )
        publish_service.execute(db, article, dry_run=True)
        publish_service.execute(db, article, dry_run=False)
        print(f"Seeded article #{article.id} with demo jobs.")


if __name__ == "__main__":
    main()
