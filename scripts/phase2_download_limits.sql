alter table public.files
add column if not exists max_downloads integer;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.files'::regclass
          and conname = 'files_max_downloads_positive'
    ) then
        alter table public.files
        add constraint files_max_downloads_positive
        check (max_downloads is null or max_downloads > 0);
    end if;
end
$$;

create or replace function public.authorize_download(file_id_param text)
returns table (
    download_count integer,
    max_downloads integer,
    exhausted boolean
)
language sql
as $$
    update public.files
    set download_count = coalesce(download_count, 0) + 1
    where file_id = file_id_param
      and (max_downloads is null or coalesce(download_count, 0) < max_downloads)
    returning
        download_count,
        max_downloads,
        (max_downloads is not null and download_count >= max_downloads) as exhausted;
$$;
