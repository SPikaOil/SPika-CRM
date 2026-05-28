-- Folders for sales documents
create table if not exists sales_document_folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table sales_document_folders enable row level security;

create policy "folders_select" on sales_document_folders
  for select to authenticated using (true);

create policy "folders_insert" on sales_document_folders
  for insert to authenticated with check (true);

create policy "folders_update" on sales_document_folders
  for update to authenticated using (true);

create policy "folders_delete" on sales_document_folders
  for delete to authenticated using (true);

-- Add folder_id to sales_documents (null = root level)
alter table sales_documents
  add column if not exists folder_id uuid references sales_document_folders(id) on delete set null;
