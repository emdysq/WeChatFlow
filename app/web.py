from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.database import get_db
from app.models.article import Article
from app.models.publish_job import PublishJob


templates = Jinja2Templates(directory="app/templates")
router = APIRouter(tags=["web"])
settings = get_settings()


@router.get("/", response_class=HTMLResponse)
def dashboard(request: Request, db: Session = Depends(get_db)):
    total = db.scalar(select(func.count(PublishJob.id))) or 0
    success = db.scalar(select(func.count(PublishJob.id)).where(PublishJob.status == "SUCCESS")) or 0
    failed = db.scalar(select(func.count(PublishJob.id)).where(PublishJob.status == "FAILED")) or 0
    jobs = db.scalars(select(PublishJob).options(selectinload(PublishJob.article)).order_by(PublishJob.started_at.desc()).limit(10)).all()
    return templates.TemplateResponse(
        request,
        "dashboard.html",
        {"total": total, "success": success, "failed": failed, "jobs": jobs, "settings": settings},
    )


@router.get("/articles/new", response_class=HTMLResponse)
def new_article(request: Request):
    return templates.TemplateResponse(request, "editor.html", {"article": None, "settings": settings})


@router.get("/articles/{article_id}/edit", response_class=HTMLResponse)
def edit_article(article_id: int, request: Request, db: Session = Depends(get_db)):
    article = db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return templates.TemplateResponse(request, "editor.html", {"article": article, "settings": settings})


@router.get("/jobs/{job_id}", response_class=HTMLResponse)
def job_detail(job_id: str, request: Request, db: Session = Depends(get_db)):
    stmt = select(PublishJob).options(selectinload(PublishJob.logs), selectinload(PublishJob.article)).where(PublishJob.id == job_id)
    job = db.scalar(stmt)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return templates.TemplateResponse(request, "job_detail.html", {"job": job, "settings": settings})


@router.get("/settings", response_class=HTMLResponse)
def settings_page(request: Request):
    appid = settings.wechat_app_id
    masked = "未配置" if not appid else (appid[:4] + "*" * max(4, len(appid) - 8) + appid[-4:])
    return templates.TemplateResponse(request, "settings.html", {"settings": settings, "masked_appid": masked})
