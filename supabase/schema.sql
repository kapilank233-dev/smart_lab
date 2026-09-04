create table if not exists public.student_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  usn text not null unique,
  semester text not null,
  assigned_lab text not null default 'Data Structures',
  role text not null default 'student',
  created_at timestamptz not null default now()
);

alter table public.student_profiles
  add column if not exists role text not null default 'student';

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  evaluation_name text not null,
  code text not null,
  case_results jsonb not null default '[]'::jsonb,
  score integer not null default 0,
  passed integer not null default 0,
  total integer not null default 0,
  time_used integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.student_profiles enable row level security;
alter table public.submissions enable row level security;

create policy "Students can read their profile"
  on public.student_profiles for select
  using (auth.uid() = id);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.student_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "Admins can read student profiles" on public.student_profiles;
create policy "Admins can read student profiles"
  on public.student_profiles for select
  using (public.is_admin());

create policy "Students can read their submissions"
  on public.submissions for select
  using (auth.uid() = student_id);

create policy "Students can create their submissions"
  on public.submissions for insert
  with check (auth.uid() = student_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.student_profiles (id, full_name, usn, semester, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Student'),
    coalesce(new.raw_user_meta_data->>'usn', 'UNASSIGNED-' || left(new.id::text, 8)),
    coalesce(new.raw_user_meta_data->>'semester', 'Not specified'),
    'student'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();