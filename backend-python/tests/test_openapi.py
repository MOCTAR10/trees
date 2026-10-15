from fastapi.testclient import TestClient

from app.main import app


def test_api_documentation_with_security_schemes():
    client = TestClient(app)
    schema = client.get("/api/openapi.json").json()
    assert set(schema["components"]["securitySchemes"]) == {"ApiKey", "Bearer"}
    assert schema["security"] == [{"ApiKey": [], "Bearer": []}]
    assert "/api/mill/register" in schema["paths"]
    for ops in schema["paths"].values():
        for op in ops.values():
            names = [p.get("name", "").lower() for p in op.get("parameters", [])]
            assert "authorization" not in names
    assert client.get("/api/docs").status_code == 200
    assert client.get("/api/redoc").status_code == 200
