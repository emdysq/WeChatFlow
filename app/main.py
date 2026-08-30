from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import accounts_router, articles_router, assets_router, jobs_router
from app.config import get_settings
from app.database import init_db
from app.web import router as web_router


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="WeChatFlow API",
    version="0.1.0",
    description="微信公众号内容自动化投稿与草稿发布工作台",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.mount("/uploads", StaticFiles(directory=str(settings.upload_path)), name="uploads")

app.include_router(web_router)
app.include_router(articles_router)
app.include_router(jobs_router)
app.include_router(assets_router)
app.include_router(accounts_router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name, "mode": "mock" if settings.wechat_mock else "live"}
