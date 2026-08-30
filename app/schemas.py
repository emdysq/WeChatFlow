from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ArticleCreate(BaseModel):
    title: str = ""
    author: str = ""
    digest: str = ""
    markdown_content: str = ""
    cover_path: str | None = None


class ArticleUpdate(ArticleCreate):
    pass


class ArticleOut(ArticleCreate):
    id: int
    html_content: str = ""
    status: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class CheckItem(BaseModel):
    code: str
    label: str
    status: str = Field(pattern="^(passed|warning|failed)$")
    message: str


class ValidationResult(BaseModel):
    ready: bool
    checks: list[CheckItem]


class PublishRequest(BaseModel):
    dry_run: bool = False


class JobLogOut(BaseModel):
    stage: str
    level: str
    message: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class JobOut(BaseModel):
    id: str
    article_id: int
    status: str
    current_stage: str
    media_id: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    dry_run: bool
    started_at: datetime | None = None
    finished_at: datetime | None = None
    logs: list[JobLogOut] = []
    model_config = ConfigDict(from_attributes=True)


class AccountTestResult(BaseModel):
    ok: bool
    mode: str
    message: str
