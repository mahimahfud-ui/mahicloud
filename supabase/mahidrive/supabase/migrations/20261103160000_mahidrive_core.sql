-- MahiDrive Phase 3 schema. Apply only to the dedicated MahiDrive Supabase project.
-- Do not apply this to the shared MahiCloud/Mahi-AI project.
-- Generate an isolated timestamped migration with: supabase --workdir supabase/mahidrive migration new mahidrive_core
-- Then copy this file's SQL into that generated migration.

create schema if not exists mahidrive;
create schema if not exists mahidrive_private;

revoke all on schema mahidrive from public, anon;
grant usage on schema mahidrive to authenticated;
revoke all on schema mahidrive_private from public, anon, authenticated;

create table if not exists mahidrive_private.owner_config (
    singleton boolean primary key default true check (singleton),
    owner_user_id uuid not null unique references auth.users(id) on delete restrict,
    created_at timestamptz not null default now()
);
alter table mahidrive_private.owner_config enable row level security;
revoke all on table mahidrive_private.owner_config from public, anon, authenticated;
grant usage on schema mahidrive_private to authenticated;

create or replace function mahidrive_private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $owner_check$
    select (select auth.uid()) is not null
       and exists (
           select 1
           from mahidrive_private.owner_config c
           where c.singleton is true
             and c.owner_user_id = (select auth.uid())
       );
$owner_check$;

revoke all on function mahidrive_private.is_owner() from public, anon;
grant execute on function mahidrive_private.is_owner() to authenticated;

create or replace function mahidrive.provision_owner(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $owner_provision$
declare
    affected integer;
begin
    if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
        raise exception 'service role required' using errcode = '42501';
    end if;

    if not exists (
        select 1 from auth.users u
        where u.id = p_owner_id
          and u.is_anonymous is false
          and u.email_confirmed_at is not null
          and u.raw_app_meta_data ->> 'mahidrive_owner' = 'true'
    ) then
        raise exception 'verified MahiDrive owner required' using errcode = '42501';
    end if;

    insert into mahidrive_private.owner_config (singleton, owner_user_id)
    values (true, p_owner_id)
    on conflict (singleton) do update
      set owner_user_id = excluded.owner_user_id
      where mahidrive_private.owner_config.owner_user_id = excluded.owner_user_id;

    get diagnostics affected = row_count;
    if affected <> 1 then
        raise exception 'MahiDrive owner is already configured' using errcode = '23505';
    end if;
end;
$owner_provision$;

revoke all on function mahidrive.provision_owner(uuid) from public, anon, authenticated;
grant usage on schema mahidrive to service_role;
grant execute on function mahidrive.provision_owner(uuid) to service_role;

create table if not exists mahidrive.folders (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    parent_id uuid null,
    name text not null check (
        char_length(name) between 1 and 255
        and name = btrim(name)
        and position('/' in name) = 0
        and position(chr(92) in name) = 0
        and name not in ('.', '..')
        and name !~ '[[:cntrl:]]'
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint mahidrive_folders_owner_id_unique unique (id, owner_user_id),
    constraint mahidrive_folders_parent_owner_fk
        foreign key (parent_id, owner_user_id)
        references mahidrive.folders(id, owner_user_id)
        on delete restrict,
    constraint mahidrive_folders_not_self_parent check (parent_id is null or parent_id <> id)
);

create unique index if not exists mahidrive_folders_sibling_name_unique
    on mahidrive.folders (
        owner_user_id,
        coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
        lower(name)
    );

create index if not exists mahidrive_folders_owner_parent_idx
    on mahidrive.folders(owner_user_id, parent_id, name);

create table if not exists mahidrive.files (
    id uuid primary key default gen_random_uuid(),
    storage_key text generated always as ('library/' || id::text || '/original') stored not null unique,
    owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    folder_id uuid null,
    name text not null check (
        char_length(name) between 1 and 255
        and name = btrim(name)
        and position('/' in name) = 0
        and position(chr(92) in name) = 0
        and name not in ('.', '..')
        and name !~ '[[:cntrl:]]'
    ),
    mime_type text not null default 'application/octet-stream'
        check (char_length(mime_type) between 1 and 255),
    size_bytes bigint not null default 0 check (size_bytes between 0 and 52428800),
    upload_status text not null default 'uploading'
        check (upload_status in ('uploading', 'ready', 'failed', 'deleted')),
    deleted_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint mahidrive_files_owner_id_unique unique (id, owner_user_id),
    constraint mahidrive_files_folder_owner_fk
        foreign key (folder_id, owner_user_id)
        references mahidrive.folders(id, owner_user_id)
        on delete restrict,
    constraint mahidrive_files_deleted_state_check
        check ((deleted_at is null and upload_status <> 'deleted')
            or (deleted_at is not null and upload_status = 'deleted'))
);

create index if not exists mahidrive_files_owner_folder_created_idx
    on mahidrive.files(owner_user_id, folder_id, created_at desc)
    where deleted_at is null;

create index if not exists mahidrive_files_owner_name_idx
    on mahidrive.files(owner_user_id, lower(name));

create index if not exists mahidrive_files_owner_deleted_idx
    on mahidrive.files(owner_user_id, deleted_at desc)
    where deleted_at is not null;

create table if not exists mahidrive.file_versions (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    file_id uuid not null,
    version_number integer not null check (version_number > 0),
    size_bytes bigint not null check (size_bytes >= 0),
    mime_type text not null default 'application/octet-stream',
    checksum_sha256 text null check (
        checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'
    ),
    created_at timestamptz not null default now(),
    constraint mahidrive_file_versions_file_owner_fk
        foreign key (file_id, owner_user_id)
        references mahidrive.files(id, owner_user_id)
        on delete cascade,
    constraint mahidrive_file_versions_number_unique unique (file_id, version_number)
);

create index if not exists mahidrive_file_versions_owner_file_idx
    on mahidrive.file_versions(owner_user_id, file_id, version_number desc);

alter table mahidrive.folders enable row level security;
alter table mahidrive.files enable row level security;
alter table mahidrive.file_versions enable row level security;

revoke all on all tables in schema mahidrive from public, anon;
grant usage on schema mahidrive to service_role;
grant select, insert, update, delete on mahidrive.folders, mahidrive.files, mahidrive.file_versions to service_role;
grant select on mahidrive.folders, mahidrive.files, mahidrive.file_versions to authenticated;
revoke insert, update on mahidrive.folders, mahidrive.files, mahidrive.file_versions from authenticated;
grant insert (parent_id, name) on mahidrive.folders to authenticated;
grant insert (folder_id, name, mime_type, size_bytes) on mahidrive.files to authenticated;
grant update (name, folder_id, updated_at) on mahidrive.files to authenticated;

create or replace function mahidrive.set_file_lifecycle_status()
returns trigger
language plpgsql
set search_path = ''
as $mahidrive$
begin
    if old.deleted_at is null and new.deleted_at is not null then
        new.upload_status := 'deleted';
    elsif old.deleted_at is not null and new.deleted_at is null then
        new.upload_status := 'ready';
    end if;
    return new;
end;
$mahidrive$;

revoke all on function mahidrive.set_file_lifecycle_status() from public, anon, authenticated;
drop trigger if exists mahidrive_file_lifecycle_status on mahidrive.files;
create trigger mahidrive_file_lifecycle_status
before update of deleted_at on mahidrive.files
for each row execute function mahidrive.set_file_lifecycle_status();

drop policy if exists mahidrive_folders_owner_select on mahidrive.folders;
create policy mahidrive_folders_owner_select on mahidrive.folders
for select to authenticated
using (
    owner_user_id = (select auth.uid())
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), true) = false
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and (select auth.jwt() -> 'app_metadata' ->> 'mahidrive_owner') = 'true'
    and (select mahidrive_private.is_owner())
);

drop policy if exists mahidrive_folders_owner_insert on mahidrive.folders;
create policy mahidrive_folders_owner_insert on mahidrive.folders
for insert to authenticated
with check (
    owner_user_id = (select auth.uid())
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), true) = false
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and (select auth.jwt() -> 'app_metadata' ->> 'mahidrive_owner') = 'true'
    and (select mahidrive_private.is_owner())
);

drop policy if exists mahidrive_files_owner_select on mahidrive.files;
create policy mahidrive_files_owner_select on mahidrive.files
for select to authenticated
using (
    owner_user_id = (select auth.uid())
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), true) = false
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and (select auth.jwt() -> 'app_metadata' ->> 'mahidrive_owner') = 'true'
    and (select mahidrive_private.is_owner())
);

drop policy if exists mahidrive_files_owner_insert on mahidrive.files;
create policy mahidrive_files_owner_insert on mahidrive.files
for insert to authenticated
with check (
    owner_user_id = (select auth.uid())
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), true) = false
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and (select auth.jwt() -> 'app_metadata' ->> 'mahidrive_owner') = 'true'
    and (select mahidrive_private.is_owner())
);

drop policy if exists mahidrive_files_owner_update on mahidrive.files;
create policy mahidrive_files_owner_update on mahidrive.files
for update to authenticated
using (
    owner_user_id = (select auth.uid())
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), true) = false
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and (select auth.jwt() -> 'app_metadata' ->> 'mahidrive_owner') = 'true'
    and (select mahidrive_private.is_owner())
)
with check (
    owner_user_id = (select auth.uid())
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), true) = false
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and (select auth.jwt() -> 'app_metadata' ->> 'mahidrive_owner') = 'true'
    and (select mahidrive_private.is_owner())
);

drop policy if exists mahidrive_file_versions_owner_select on mahidrive.file_versions;
create policy mahidrive_file_versions_owner_select on mahidrive.file_versions
for select to authenticated
using (
    owner_user_id = (select auth.uid())
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), true) = false
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and (select auth.jwt() -> 'app_metadata' ->> 'mahidrive_owner') = 'true'
    and (select mahidrive_private.is_owner())
);

drop policy if exists mahidrive_file_versions_owner_insert on mahidrive.file_versions;
create policy mahidrive_file_versions_owner_insert on mahidrive.file_versions
for insert to authenticated
with check (
    owner_user_id = (select auth.uid())
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), true) = false
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and (select auth.jwt() -> 'app_metadata' ->> 'mahidrive_owner') = 'true'
    and (select mahidrive_private.is_owner())
);

-- Private Space objects are deliberately not covered here. The dedicated bucket
-- has no public policy, and no vault object-prefix policy is added in Phase 3.
-- Direct browser deletion is intentionally denied; app deletion is soft-delete.
drop policy if exists mahidrive_storage_owner_select on storage.objects;
create policy mahidrive_storage_owner_select on storage.objects
for select to authenticated
using (
    bucket_id = 'mahi-drive-private'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'library'
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), true) = false
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and (select auth.jwt() -> 'app_metadata' ->> 'mahidrive_owner') = 'true'
    and (select mahidrive_private.is_owner())
    and exists (
        select 1 from mahidrive.files f
        where f.id::text = split_part(name, '/', 2)
          and name = f.storage_key
          and f.owner_user_id = (select auth.uid())
          and f.upload_status = 'ready'
          and f.deleted_at is null
    )
);

drop policy if exists mahidrive_storage_owner_insert on storage.objects;
create policy mahidrive_storage_owner_insert on storage.objects
for insert to authenticated
with check (
    bucket_id = 'mahi-drive-private'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'library'
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), true) = false
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and (select auth.jwt() -> 'app_metadata' ->> 'mahidrive_owner') = 'true'
    and (select mahidrive_private.is_owner())
    and exists (
        select 1 from mahidrive.files f
        where f.id::text = split_part(name, '/', 2)
          and name = f.storage_key
          and f.owner_user_id = (select auth.uid())
          and f.upload_status = 'uploading'
          and f.deleted_at is null
    )
);

comment on schema mahidrive is
    'MahiDrive owner-visible metadata. Add this schema to Data API exposed schemas only after reviewing RLS and grants.';
comment on schema mahidrive_private is
    'MahiDrive server-only internal metadata. Never expose this schema through Data or GraphQL APIs.';
