from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import get_settings


router = APIRouter(prefix="/api/assets", tags=["assets"])
settings = get_settings()


@router.post("/upload")
async def upload_asset(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")
    content = await file.read()
    if len(content) > settings.max_image_bytes:
        raise HTTPException(status_code=413, detail="Image is too large")
    suffix = Path(file.filename or "image.jpg").suffix.lower() or ".jpg"
    filename = f"{uuid4().hex}{suffix}"
    target = settings.upload_path / filename
    target.write_bytes(content)
    return {"path": f"/uploads/{filename}", "filename": filename}
