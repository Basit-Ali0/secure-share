alter table public.files
add column if not exists short_id text;

create unique index if not exists files_short_id_key
on public.files (short_id)
where short_id is not null;
