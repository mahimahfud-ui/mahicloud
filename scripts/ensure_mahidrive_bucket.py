#!/usr/bin/env python3
"""Create the dedicated MahiDrive bucket through the Supabase Storage API.

Run only after configuring a new, dedicated MahiDrive Supabase project.
This script refuses to reuse a public bucket or silently change existing settings.
"""

import os
import sys

import requests


BUCKET_ID = "mahi-drive-private"
DEFAULT_LIMIT = 50 * 1024 * 1024


def main() -> int:
    base_url = os.environ.get("MAHIDRIVE_SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.environ.get("MAHIDRIVE_SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not base_url or not service_key:
        print("Missing MAHIDRIVE_SUPABASE_URL or MAHIDRIVE_SUPABASE_SERVICE_ROLE_KEY.", file=sys.stderr)
        return 2

    try:
        file_limit = int(os.environ.get("MAHIDRIVE_BUCKET_MAX_FILE_SIZE", str(DEFAULT_LIMIT)))
    except ValueError:
        print("MAHIDRIVE_BUCKET_MAX_FILE_SIZE must be an integer.", file=sys.stderr)
        return 2
    if file_limit < 1 or file_limit > DEFAULT_LIMIT:
        print("Bucket file-size limit must be between 1 byte and 50 MiB.", file=sys.stderr)
        return 2

    headers = {
        "apikey": service_key,
        "Authorization": "Bearer " + service_key,
        "Content-Type": "application/json",
    }
    endpoint = base_url + "/storage/v1/bucket/" + BUCKET_ID

    try:
        existing = requests.get(endpoint, headers=headers, timeout=(5, 20))
        if existing.status_code == 200:
            bucket = existing.json()
            if bucket.get("public") is not False:
                print("Refusing to use the existing bucket because it is public.", file=sys.stderr)
                return 3
            try:
                existing_limit = int(bucket.get("file_size_limit") or 0)
            except (TypeError, ValueError):
                existing_limit = 0
            if existing_limit != file_limit:
                print("The existing private bucket has a different file-size limit; refusing to change or reuse it.", file=sys.stderr)
                return 3
            print("The existing MahiDrive bucket is private and has the expected file-size limit.")
            return 0
        if existing.status_code != 404:
            print("Could not inspect the MahiDrive bucket (HTTP {}).".format(existing.status_code), file=sys.stderr)
            return 3

        created = requests.post(
            base_url + "/storage/v1/bucket",
            headers=headers,
            json={
                "id": BUCKET_ID,
                "name": "MahiDrive Private",
                "public": False,
                "file_size_limit": file_limit,
                "allowed_mime_types": None,
            },
            timeout=(5, 30),
        )
    except requests.RequestException:
        print("Supabase Storage is unavailable; no bucket was created.", file=sys.stderr)
        return 4

    if created.status_code not in (200, 201):
        print("Bucket creation failed (HTTP {}).".format(created.status_code), file=sys.stderr)
        return 5

    bucket = created.json() if created.content else {}
    if bucket.get("public") is not False:
        print("Bucket creation did not confirm private visibility; stop and inspect it.", file=sys.stderr)
        return 6

    print("Created the private MahiDrive Storage bucket.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
