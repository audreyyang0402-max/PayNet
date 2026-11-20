"""Read-only production smoke check: python scripts/smoke_public.py API_BASE_URL."""

import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def fetch(base_url: str, path: str):
    request = Request(base_url.rstrip("/") + path,
                      headers={"Accept": "application/json", "Origin": "https://payvolution.app"})
    try:
        with urlopen(request, timeout=15) as response:
            origin = response.headers.get("Access-Control-Allow-Origin")
            if origin != "https://payvolution.app":
                raise RuntimeError(f"{path}: browser origin is not allowed (got {origin!r})")
            return json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"{path}: HTTP {error.code}; check that the latest backend was deployed") from error
    except URLError as error:
        raise RuntimeError(f"{path}: could not connect ({error.reason})") from error


def main(base_url: str) -> None:
    merchants = fetch(base_url, "/merchants")
    offers = fetch(base_url, "/surplus-offers")
    if not isinstance(merchants, list) or not isinstance(offers, list):
        raise RuntimeError("Public API returned an unexpected response shape")
    visible_menus = 0
    for merchant in merchants:
        if not isinstance(merchant, dict) or not merchant.get("id"):
            raise RuntimeError("Public merchant record is missing an ID")
        items = fetch(base_url, f"/merchants/{merchant['id']}/items")
        if not isinstance(items, list):
            raise RuntimeError("A merchant menu did not return a list")
        visible_menus += len(items)
    print(f"Public API OK: {len(merchants)} stalls, {visible_menus} menu items, {len(offers)} live surplus offers")
    print("Read-only checks passed. Authenticated order and refund flows still need a controlled test.")


if __name__ == "__main__":
    if len(sys.argv) != 2 or not sys.argv[1].startswith("https://"):
        raise SystemExit("Usage: python scripts/smoke_public.py https://your-backend.example")
    try:
        main(sys.argv[1])
    except (RuntimeError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(str(error)) from error
