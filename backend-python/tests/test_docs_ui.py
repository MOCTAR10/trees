from fastapi.testclient import TestClient

from app.main import app


def test_docs_page_carries_the_ministry_identity():
    client = TestClient(app)
    page = client.get("/api/docs")
    assert page.status_code == 200
    assert "Ministère des Eaux et Forêts" in page.text and "/api/openapi.json" in page.text
    assert client.get("/api/docs/theme.css").headers["content-type"].startswith("text/css")
    seal = client.get("/api/docs/seal.jpg")
    assert seal.status_code == 200 and seal.content[:2] == b"\xff\xd8"
    assert client.get("/api/openapi.json").status_code == 200
