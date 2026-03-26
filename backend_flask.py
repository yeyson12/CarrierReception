from datetime import datetime
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DEFAULT_API_BASE = "https://prontomowers.store:10443"
API_BASE = (
    os.getenv("CARRIER_RECEPTION_API_BASE", DEFAULT_API_BASE).strip().rstrip("/")
)
CREATED_AT_FORMAT = "%Y-%m-%d %H:%M:%S"

app = Flask(__name__)
CORS(app)


def proxy_request(
    method: str,
    path: str,
    query: dict[str, str] | None = None,
    payload: dict | None = None,
):
    url = f"{API_BASE}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"

    body = None
    headers = {"Accept": "application/json"}

    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    upstream_request = Request(
        url,
        data=body,
        headers=headers,
        method=method,
    )

    try:
        with urlopen(upstream_request, timeout=20) as upstream_response:
            response_body = upstream_response.read()
            status_code = upstream_response.getcode()
            content_type = (
                upstream_response.headers.get_content_type()
                or "application/json"
            )
    except HTTPError as exc:
        response_body = exc.read()
        status_code = exc.code
        content_type = (
            exc.headers.get_content_type()
            if exc.headers
            else "application/json"
        )
        app.logger.warning(
            "proxy http_error method=%s path=%s status=%s",
            method,
            path,
            status_code,
        )
    except URLError as exc:
        app.logger.error(
            "proxy url_error method=%s path=%s reason=%s",
            method,
            path,
            exc.reason,
        )
        return jsonify(
            {
                "success": False,
                "message": f"Upstream request failed: {exc.reason}",
            }
        ), 502

    app.logger.info(
        "proxy request method=%s path=%s status=%s",
        method,
        path,
        status_code,
    )

    return Response(
        response_body,
        status=status_code,
        mimetype=content_type,
    )


def validate_submit_rows(rows: object):
    if not isinstance(rows, list):
        return jsonify(
            {
                "success": False,
                "message": "Invalid payload.",
                "errors": {
                    "rows": ["rows must be an array."],
                },
            }
        ), 400

    errors: dict[str, list[str]] = {}

    for index, row in enumerate(rows):
        row_key = f"rows[{index}]"
        created_at_key = f"{row_key}.created_at"

        if not isinstance(row, dict):
            errors[row_key] = ["Each row must be an object."]
            continue

        created_at = row.get("created_at")
        if not isinstance(created_at, str) or not created_at.strip():
            errors[created_at_key] = [
                "created_at is required and must use YYYY-MM-DD HH:MM:SS."
            ]
            continue

        try:
            datetime.strptime(created_at.strip(), CREATED_AT_FORMAT)
        except ValueError:
            errors[created_at_key] = [
                "created_at must use YYYY-MM-DD HH:MM:SS."
            ]

    if errors:
        return jsonify(
            {
                "success": False,
                "message": "Invalid payload.",
                "errors": errors,
            }
        ), 400

    return None


def normalize_submit_user(payload: dict) -> dict:
    normalized = dict(payload)

    user_value = ""
    for key in ("user", "username"):
        value = normalized.get(key)
        if isinstance(value, str) and value.strip():
            user_value = value.strip()
            break

    if user_value:
        normalized["user"] = user_value
        normalized["username"] = user_value
    else:
        if isinstance(normalized.get("user"), str):
            normalized["user"] = normalized["user"].strip()
        if isinstance(normalized.get("username"), str):
            normalized["username"] = normalized["username"].strip()

    return normalized


@app.get("/api/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "mode": "remote-proxy",
            "upstream": API_BASE,
        }
    )


@app.get("/api/lookup_did")
def lookup_did():
    tracking = (request.args.get("tracking") or "").strip()
    locationid = (request.args.get("locationid") or "").strip()

    if not tracking:
        return jsonify({"error": "tracking is required"}), 400

    if not locationid:
        return jsonify({"error": "locationid is required"}), 400

    app.logger.info(
        "lookup_did tracking=%s locationid=%s",
        tracking,
        locationid,
    )
    return proxy_request(
        "GET",
        "/api/lookup_did",
        {
            "tracking": tracking,
            "locationid": locationid,
        },
    )


@app.post("/api/carrier_reception/submit")
def submit_carrier_reception():
    payload = request.get_json(silent=True) or {}
    rows = payload.get("rows")
    validation_error = validate_submit_rows(rows)
    if validation_error is not None:
        app.logger.warning(
            "carrier_reception_submit invalid_payload location=%s carrier=%s rows_type=%s",
            payload.get("location"),
            payload.get("carrier"),
            type(rows).__name__,
        )
        return validation_error

    payload = normalize_submit_user(payload)

    rows = rows if isinstance(rows, list) else []
    manual_rows = sum(
        1
        for row in rows
        if isinstance(row, dict) and bool(row.get("manual"))
    )
    missing_did_rows = sum(
        1
        for row in rows
        if isinstance(row, dict)
        and not str(row.get("did") or "").strip()
    )

    app.logger.info(
        "carrier_reception_submit start location=%s carrier=%s claimed=%s scannedCount=%s diff=%s rows=%s manual_rows=%s missing_did_rows=%s",
        payload.get("location"),
        payload.get("carrier"),
        payload.get("claimed"),
        payload.get("scannedCount"),
        payload.get("diff"),
        len(rows),
        manual_rows,
        missing_did_rows,
    )
    return proxy_request(
        "POST",
        "/api/carrier_reception/submit",
        payload=payload,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
