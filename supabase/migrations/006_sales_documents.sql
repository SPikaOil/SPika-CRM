-- Sales documents table
create table if not exists sales_documents (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  category     text not null default 'other',
  file_url     text not null,
  file_name    text not null,
  file_size    bigint,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- RLS
alter table sales_documents enable row level security;

-- All authenticated users can read
create policy "sales_documents_select" on sales_documents
  for select to authenticated using (true);

-- Only admins can insert / update / delete
create policy "sales_documents_insert" on sales_documents
  for insert to authenticated
  with check (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );

create policy "sales_documents_delete" on sales_documents
  for delete to authenticated
  using (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );

-- Storage bucket (run manually in Supabase dashboard if not using CLI migrations for storage)
-- Bucket name: sales-documents  (public: true)
