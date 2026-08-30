import pytest


@pytest.fixture(scope="module")
def client():
    from app.database import Base, engine, init_db
    from app.main import app
    from fastapi.testclient import TestClient

    Base.metadata.drop_all(bind=engine)
    init_db()
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=engine)


def create_valid_article(client):
    response = client.post(
        "/api/articles",
        json={
            "title": "WeChatFlow 测试文章",
            "author": "Tester",
            "digest": "用于集成测试",
            "markdown_content": "# Hello\n\n正文内容。",
            "cover_path": "/uploads/mock-cover.jpg",
        },
    )
    assert response.status_code == 200
    return response.json()


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_article_preview_and_validation(client):
    article = create_valid_article(client)
    validation = client.post(f"/api/articles/{article['id']}/validate")
    assert validation.status_code == 200
    assert validation.json()["ready"] is True

    preview = client.post(f"/api/articles/{article['id']}/preview")
    assert preview.status_code == 200
    assert "Hello" in preview.text


def test_dry_run_completes_without_media_id(client):
    article = create_valid_article(client)
    response = client.post(f"/api/articles/{article['id']}/publish", json={"dry_run": True})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["current_stage"] == "DRY_RUN_COMPLETE"
    assert data["media_id"] is None


def test_mock_publish_returns_media_id_and_logs(client):
    article = create_valid_article(client)
    response = client.post(f"/api/articles/{article['id']}/publish", json={"dry_run": False})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["media_id"].startswith("mock-media-")

    job = client.get(f"/api/jobs/{data['id']}")
    assert job.status_code == 200
    stages = [log["stage"] for log in job.json()["logs"]]
    assert "VALIDATING" in stages
    assert "CREATING_DRAFT" in stages
    assert "SUCCESS" in stages
