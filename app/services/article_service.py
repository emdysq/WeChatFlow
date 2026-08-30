from sqlalchemy.orm import Session

from app.models.article import Article
from app.schemas import ArticleCreate, ArticleUpdate, CheckItem, ValidationResult
from app.services.renderer import WeChatRenderer


class ArticleService:
    def __init__(self, renderer: WeChatRenderer | None = None) -> None:
        self.renderer = renderer or WeChatRenderer()

    def create(self, db: Session, payload: ArticleCreate) -> Article:
        article = Article(**payload.model_dump())
        article.html_content = self.renderer.render(article.markdown_content)
        db.add(article)
        db.commit()
        db.refresh(article)
        return article

    def update(self, db: Session, article: Article, payload: ArticleUpdate) -> Article:
        for key, value in payload.model_dump().items():
            setattr(article, key, value)
        article.html_content = self.renderer.render(article.markdown_content)
        db.add(article)
        db.commit()
        db.refresh(article)
        return article

    def render(self, article: Article) -> str:
        return self.renderer.render(article.markdown_content)

    def validate(self, article: Article, require_cover: bool = True) -> ValidationResult:
        checks: list[CheckItem] = []

        title = (article.title or "").strip()
        if not title:
            checks.append(CheckItem(code="ARTICLE_TITLE_MISSING", label="文章标题", status="failed", message="请填写文章标题。"))
        elif len(title) > 64:
            checks.append(CheckItem(code="ARTICLE_TITLE_TOO_LONG", label="文章标题", status="failed", message="标题建议控制在 64 个字符以内。"))
        else:
            checks.append(CheckItem(code="ARTICLE_TITLE_OK", label="文章标题", status="passed", message="标题已填写。"))

        if not (article.markdown_content or "").strip():
            checks.append(CheckItem(code="ARTICLE_CONTENT_MISSING", label="正文内容", status="failed", message="正文不能为空。"))
        else:
            checks.append(CheckItem(code="ARTICLE_CONTENT_OK", label="正文内容", status="passed", message="正文可用于渲染。"))

        if len(article.digest or "") > 120:
            checks.append(CheckItem(code="ARTICLE_DIGEST_LONG", label="文章摘要", status="warning", message="摘要较长，建议在发布前精简。"))
        elif article.digest:
            checks.append(CheckItem(code="ARTICLE_DIGEST_OK", label="文章摘要", status="passed", message="摘要已填写。"))
        else:
            checks.append(CheckItem(code="ARTICLE_DIGEST_EMPTY", label="文章摘要", status="warning", message="未填写摘要，可在草稿箱中补充。"))

        if require_cover and not article.cover_path:
            checks.append(CheckItem(code="COVER_MISSING", label="封面素材", status="failed", message="正式创建草稿前需要封面图。"))
        elif article.cover_path:
            checks.append(CheckItem(code="COVER_OK", label="封面素材", status="passed", message="已配置封面图。"))

        ready = not any(item.status == "failed" for item in checks)
        return ValidationResult(ready=ready, checks=checks)
