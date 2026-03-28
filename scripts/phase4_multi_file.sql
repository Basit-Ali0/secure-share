alter table public.files
add column if not exists share_kind text not null default 'single';

alter table public.files
add column if not exists file_count integer not null default 1;

alter table public.files
add column if not exists total_size bigint;

alter table public.files
add column if not exists manifest_storage_path text;

alter table public.files
add column if not exists manifest_chunk_count integer;

alter table public.files
add column if not exists manifest_chunk_sizes integer[];

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.files'::regclass
          and conname = 'files_share_kind_check'
    ) then
        alter table public.files
        add constraint files_share_kind_check
        check (share_kind in ('single', 'multi'));
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.files'::regclass
          and conname = 'files_file_count_positive'
    ) then
        alter table public.files
        add constraint files_file_count_positive
        check (file_count > 0);
    end if;
end
$$;
