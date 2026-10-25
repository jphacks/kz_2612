from fastapi import Request

from app.deps import _gateway_user


def test_gateway_user_reads_verified_jwt_claims():
    request = Request({
        "type": "http",
        "aws.event": {
            "requestContext": {
                "authorizer": {
                    "jwt": {
                        "claims": {
                            "sub": "google-user-1",
                            "email": "member@example.com",
                        }
                    }
                }
            }
        },
    })

    assert _gateway_user(request) == {
        "user_id": "google-user-1",
        "email": "member@example.com",
    }


def test_gateway_user_rejects_unverified_headers_as_claims():
    request = Request({"type": "http", "headers": {"x-user-id": "attacker"}})
    assert _gateway_user(request) is None
