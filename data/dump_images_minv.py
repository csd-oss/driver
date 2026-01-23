import os
import re
import time
import pathlib
from urllib.parse import quote
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

JS_FILE = "data5.js"
OUT_DIR = "minv_images"
ENDPOINT = "https://www.minv.sk/egovinet02/PCPZobrazFile"

# Headers similar to your curl (don’t overdo sec-ch-ua; these are enough)
HEADERS = {
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
    "Referer": "https://www.minv.sk/egovinet02/PCPZobrazFile?fileName=test2.html",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
}

SLEEP_SECONDS = 0.5     # be polite; raise if you see 429s
TIMEOUT = 30


def make_session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=8,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
        raise_on_status=False,
    )
    s.mount("https://", HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=20))
    s.headers.update(HEADERS)
    return s


def extract_obrazok_paths(js_text: str) -> list[str]:
    # 1) Primary: values from "obrazok":"..."
    paths = re.findall(r'"obrazok"\s*:\s*"([^"]+)"', js_text)

    # Keep only actual image-ish values
    img_ext = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")
    clean = []
    for p in paths:
        p = p.strip()
        if not p:
            continue
        # Some entries may be "" when no image.
        if p.lower().endswith(img_ext):
            clean.append(p)

    # Deduplicate
    return sorted(set(clean))


def safe_join_out(out_root: str, remote_path: str) -> str:
    # Preserve folder structure under OUT_DIR (recommended)
    # Example remote_path: pcpfiles/obr3/dz/1-17.png
    remote_path = remote_path.lstrip("/")

    # Avoid weird traversal
    remote_path = remote_path.replace("..", "__")

    out_path = os.path.join(out_root, remote_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    return out_path


def main():
    if not os.path.exists(JS_FILE):
        raise SystemExit(f"Can't find {JS_FILE} in {os.getcwd()}")

    os.makedirs(OUT_DIR, exist_ok=True)

    js_text = pathlib.Path(JS_FILE).read_text(encoding="utf-8", errors="replace")
    img_paths = extract_obrazok_paths(js_text)

    print(f"Found {len(img_paths)} unique image paths in {JS_FILE}")

    sess = make_session()

    ok = skip = missing = fail = 0

    for i, fileName in enumerate(img_paths, 1):
        out_path = safe_join_out(OUT_DIR, fileName)

        if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            skip += 1
            print(f"[{i}/{len(img_paths)}] SKIP: {fileName} (already exists)")
            continue

        # Prepend pcpfiles/ if not already present (server requires this prefix)
        url_fileName = fileName if fileName.startswith("pcpfiles/") else f"pcpfiles/{fileName}"
        url = f"{ENDPOINT}?fileName={quote(url_fileName, safe='/')}"
        print(f"[{i}/{len(img_paths)}] Fetching: {url}")

        try:
            r = sess.get(url, timeout=TIMEOUT)
            if r.status_code == 200 and r.content:
                with open(out_path, "wb") as f:
                    f.write(r.content)
                ok += 1
                print(f"  ✓ OK ({len(r.content)} bytes) -> {out_path}")
            elif r.status_code == 404:
                missing += 1
                print(f"  ✗ 404 Not Found")
                # leave a note file so you can see what failed
                with open(out_path + ".404.txt", "w", encoding="utf-8") as f:
                    f.write(url)
            else:
                fail += 1
                print(f"  ✗ Error {r.status_code}")
                with open(out_path + f".ERR{r.status_code}.txt", "w", encoding="utf-8") as f:
                    f.write(url)
        except requests.RequestException as e:
            fail += 1
            print(f"  ✗ Exception: {type(e).__name__}: {e}")
            with open(out_path + ".EXC.txt", "w", encoding="utf-8") as f:
                f.write(f"{url}\n{type(e).__name__}: {e}")

        if i % 10 == 0:
            print(f"  Progress: ok={ok} missing={missing} fail={fail} skip={skip}")

        time.sleep(SLEEP_SECONDS)

    print("\nDone.")
    print(f"OK:      {ok}")
    print(f"SKIPPED: {skip}")
    print(f"404:     {missing}")
    print(f"FAILED:  {fail}")
    print(f"Saved under: {OUT_DIR}/")


if __name__ == "__main__":
    main()
