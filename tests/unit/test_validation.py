from app.models.article import Article
from app.services.article_service import ArticleService


def test_validation_blocks_missing_title_content_and_cover():
    result = ArticleService().validate(Article(title="", markdown_content="", cover_path=None), require_cover=True)
    assert result.ready is False
    codes = {item.code for item in result.checks}
    assert {"ARTICLE_TITLE_MISSING", "ARTICLE_CONTENT_MISSING", "COVER_MISSING"}.issubset(codes)


def test_validation_allows_valid_article():
    article = Article(title="测试", markdown_content="# 正文", cover_path="/uploads/cover.jpg", digest="摘要")
    result = ArticleService().validate(article, require_cover=True)
    assert result.ready is True
