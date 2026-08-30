from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.publish_job import PublishJob
from app.schemas import JobOut


router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: str, db: Session = Depends(get_db)):
    stmt = select(PublishJob).options(selectinload(PublishJob.logs)).where(PublishJob.id == job_id)
    job = db.scalar(stmt)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
