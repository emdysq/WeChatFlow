from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import article_service, publish_service
from app.models.article import Article
from app.schemas import ArticleCreate, ArticleOut, ArticleUpdate, JobOut, PublishRequest, ValidationResult


router = APIRouter(prefix="/api/articles", tags=["articles"])


@router.post("", response_model=ArticleOut)
def create_article(payload: ArticleCreate, db: Session = Depends(get_db)):
    return article_service.create(db, payload)


@router.get("/{article_id}", response_model=ArticleOut)
def get_article(article_id: int, db: Session = Depends(get_db)):
    article = db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.put("/{article_id}", response_model=ArticleOut)
def update_article(article_id: int, payload: ArticleUpdate, db: Session = Depends(get_db)):
    article = db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article_service.update(db, article, payload)


@router.post("/{article_id}/validate", response_model=ValidationResult)
def validate_article(article_id: int, db: Session = Depends(get_db)):
    article = db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article_service.validate(article, require_cover=True)


@router.post("/{article_id}/preview", response_class=HTMLResponse)
def preview_article(article_id: int, db: Session = Depends(get_db)):
    article = db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    html = article_service.render(article)
    article.html_content = html
    db.add(article)
    db.commit()
    return HTMLResponse(html)


@router.post("/{article_id}/publish", response_model=JobOut)
def publish_article(article_id: int, payload: PublishRequest, db: Session = Depends(get_db)):
    article = db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return publish_service.execute(db, article, dry_run=payload.dry_run)
