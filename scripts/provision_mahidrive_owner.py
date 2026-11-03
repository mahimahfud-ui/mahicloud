#!/usr/bin/env python3
"""Mark one existing verified Auth user as the MahiDrive owner.

This script never creates users. It must be run by an operator with a dedicated
project service-role key after confirming the owner account in Supabase Auth.
"""

import os
import sys
import uuid

import requests


TIMEOUT = (5, 20)


def _request(method, url, headers, **kwargs):
    try:
        response = requests.request(method, url, headers=headers, timeout=TIMEOUT, **kwargs)
    except requests.RequestException:
        raise RuntimeError("Supabase Auth is unavailable.") from None
    if not response.ok:
        raise RuntimeError("Supabase Auth administrative request failed (HTTP {}).".format(response.status_code))
    return response.json() if response.content else {}


def main() -> int:
    base_url = os.environ.get("MAHIDRIVE_SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.environ.get("MAHIDRIVE_SUPABASE_SERVICE_ROLE_KEY", "").strip()
    owner_raw = os.environ.get("MAHIDRIVE_OWNER_USER_ID", "").strip()
    if not base_url or not service_key or not owner_raw:
        print("Set MAHIDRIVE_SUPABASE_URL, MAHIDRIVE_SUPABASE_SERVICE_ROLE_KEY and MAHIDRIVE_OWNER_USER_ID.", file=sys.stderr)
        return 2

    try:
        owner_id = str(uuid.UUID(owner_raw))
    except ValueError:
        print("MAHIDRIVE_OWNER_USER_ID must be a UUID.", file=sys.stderr)
        return 2

    headers = {
        "apikey": service_key,
        "Authorization": "Bearer " + service_key,
        "Content-Type": "application/json",
    }

    try:
        owner_payload = _request("GET", base_url + "/auth/v1/admin/users/" + owner_id, headers)
        owner = owner_payload.get("user", owner_payload)
        if str(owner.get("id", "")).lower() != owner_id:
            raise RuntimeError("The configured owner identity could not be found.")
        if owner.get("is_anonymous") is True:
            raise RuntimeError("An anonymous Auth user cannot be the MahiDrive owner.")
        if not (owner.get("email_confirmed_at") or owner.get("confirmed_at")):
            raise RuntimeError("The owner account must have a verified email before provisioning.")

        page = 1
        existing_owners = []
        while True:
            users_payload = _request(
                "GET",
                base_url + "/auth/v1/admin/users",
                headers,
                params={"page": page, "per_page": 1000},
            )
            users = users_payload.get("users", [])
            if not isinstance(users, list):
                raise RuntimeError("Auth user-list response was invalid.")
            for user in users:
                metadata = user.get("app_metadata") if isinstance(user.get("app_metadata"), dict) else {}
                if metadata.get("mahidrive_owner") is True:
                    existing_owners.append(str(user.get("id", "")).lower())
            if len(users) < 1000:
                break
            page += 1

        if any(user_id != owner_id for user_id in existing_owners):
            raise RuntimeError("Another Auth identity already has the MahiDrive owner claim; refusing to create a second owner.")
        if existing_owners.count(owner_id) > 1:
            raise RuntimeError("Duplicate owner identity records were returned; refusing to continue.")

        metadata = owner.get("app_metadata") if isinstance(owner.get("app_metadata"), dict) else {}
        metadata["mahidrive_owner"] = True
        updated_payload = _request(
            "PUT",
            base_url + "/auth/v1/admin/users/" + owner_id,
            headers,
            json={"app_metadata": metadata},
        )
        updated = updated_payload.get("user", updated_payload)
        updated_metadata = updated.get("app_metadata") if isinstance(updated.get("app_metadata"), dict) else {}
        if updated_metadata.get("mahidrive_owner") is not True:
            raise RuntimeError("Supabase did not confirm the owner authorization claim.")

        # This RPC exists in the exposed MahiDrive schema but is executable only
        # by the dedicated project's service_role. It writes the UUID into the
        # private, one-row owner_config table; it never returns that UUID.
        provisioning_headers = {
            **headers,
            "Accept-Profile": "mahidrive",
            "Content-Profile": "mahidrive",
        }
        _request(
            "POST",
            base_url + "/rest/v1/rpc/provision_owner",
            provisioning_headers,
            json={"p_owner_id": owner_id},
        )

    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 3

    print("Verified the single MahiDrive owner claim. No Auth user was created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
