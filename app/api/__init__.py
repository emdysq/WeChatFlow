from app.api.accounts import router as accounts_router
from app.api.articles import router as articles_router
from app.api.assets import router as assets_router
from app.api.jobs import router as jobs_router

__all__ = ["accounts_router", "articles_router", "assets_router", "jobs_router"]
