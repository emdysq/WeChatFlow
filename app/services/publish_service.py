from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.wechat_client import WeChatAPIError, WeChatClient
from app.models.article import Article
from app.models.job_log import JobLog
from app.models.publish_job import PublishJob
from app.services.article_service import ArticleService
from app.services.asset_service import AssetService


def make_job_id() -> str:
    now = datetime.now(timezone.utc)
    return f"WF-{now.strftime('%Y%m%d-%H%M%S')}-{uuid4().hex[:6].upper()}"


class PublishService:
    def __init__(self, article_service: ArticleService, asset_service: AssetService, client: WeChatClient) -> None:
        self.article_service = article_service
        self.asset_service = asset_service
        self.client = client

    def _log(self, db: Session, job: PublishJob, stage: str, message: str, level: str = "INFO") -> None:
        job.current_stage = stage
        db.add(job)
        db.add(JobLog(job_id=job.id, stage=stage, level=level, message=message))
        db.commit()
        db.refresh(job)

    def execute(self, db: Session, article: Article, dry_run: bool = False) -> PublishJob:
        job = PublishJob(
            id=make_job_id(),
            article_id=article.id,
            status="RUNNING",
            current_stage="CREATED",
            dry_run=dry_run,
            started_at=datetime.now(timezone.utc),
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        self._log(db, job, "CREATED", "发布任务已创建。")

        try:
            self._log(db, job, "VALIDATING", "正在执行发布前检查。")
            validation = self.article_service.validate(article, require_cover=not dry_run)
            if not validation.ready:
                failed = [c.message for c in validation.checks if c.status == "failed"]
                raise WeChatAPIError("WF1000", "；".join(failed))
            self._log(db, job, "VALIDATING", "发布前检查通过。")

            self._log(db, job, "RENDERING", "正在渲染微信兼容 HTML。")
            html = self.article_service.render(article)
            article.html_content = html
            db.add(article)
            db.commit()
            self._log(db, job, "RENDERING", "Markdown 渲染完成。")

            if dry_run:
                job.status = "SUCCESS"
                job.current_stage = "DRY_RUN_COMPLETE"
                job.finished_at = datetime.now(timezone.utc)
                db.add(job)
                db.add(JobLog(job_id=job.id, stage="DRY_RUN_COMPLETE", level="INFO", message="Dry-run 完成：未调用微信素材或草稿接口。"))
                db.commit()
                db.refresh(job)
                return job

            self._log(db, job, "UPLOADING_ASSETS", "正在处理正文图片素材。")
            rewritten_html, image_count = self.asset_service.rewrite_article_images(html, self.client)
            self._log(db, job, "UPLOADING_ASSETS", f"正文图片处理完成，共 {image_count} 张。")

            self._log(db, job, "UPLOADING_COVER", "正在上传封面素材。")
            thumb_media_id = self.asset_service.upload_cover(article.cover_path or "", self.client)
            self._log(db, job, "UPLOADING_COVER", "封面素材上传完成。")

            self._log(db, job, "CREATING_DRAFT", "正在创建微信公众号草稿。")
            payload = {
                "title": article.title,
                "author": article.author,
                "digest": article.digest,
                "content": rewritten_html,
                "thumb_media_id": thumb_media_id,
                "need_open_comment": 1,
                "only_fans_can_comment": 0,
            }
            media_id = self.client.create_draft(payload)
            job.media_id = media_id
            job.status = "SUCCESS"
            job.current_stage = "SUCCESS"
            job.finished_at = datetime.now(timezone.utc)
            article.status = "DRAFT_CREATED"
            db.add_all([job, article])
            db.add(JobLog(job_id=job.id, stage="SUCCESS", level="INFO", message="微信公众号草稿创建成功。"))
            db.commit()
            db.refresh(job)
            return job
        except WeChatAPIError as exc:
            job.status = "FAILED"
            job.current_stage = "FAILED"
            job.error_code = exc.code
            job.error_message = exc.message
            job.finished_at = datetime.now(timezone.utc)
            db.add(job)
            db.add(JobLog(job_id=job.id, stage="FAILED", level="ERROR", message=f"{exc.code}: {exc.message}"))
            db.commit()
            db.refresh(job)
            return job
        except Exception as exc:  # final safety boundary for operator-facing jobs
            job.status = "FAILED"
            job.current_stage = "FAILED"
            job.error_code = "SYS5001"
            job.error_message = str(exc)
            job.finished_at = datetime.now(timezone.utc)
            db.add(job)
            db.add(JobLog(job_id=job.id, stage="FAILED", level="ERROR", message=f"SYS5001: {exc}"))
            db.commit()
            db.refresh(job)
            return job

    def get(self, db: Session, job_id: str) -> PublishJob | None:
        return db.scalar(select(PublishJob).where(PublishJob.id == job_id))
