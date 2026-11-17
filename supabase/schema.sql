-- Controle de Veículos: estrutura do banco no Supabase.
-- Cole tudo no SQL Editor do Supabase e clique em "Run". Pode rodar mais de uma vez.

create extension if not exists pgcrypto;

-- Famílias e membros -----------------------------------------------------------
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'membro',
  email text,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create or replace function public.is_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.family_members where family_id = fid and user_id = auth.uid());
$$;

-- Tabelas de dados (o conteúdo de cada registro fica em "data") ----------------
do $$
declare t text;
begin
  foreach t in array array['vehicles', 'drivers', 'expenses'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id uuid primary key,
        family_id uuid not null references public.families(id) on delete cascade,
        data jsonb not null,
        updated_at timestamptz not null,
        deleted boolean not null default false,
        server_updated_at timestamptz not null default clock_timestamp()
      );
      create index if not exists %1$s_sync_idx on public.%1$I (family_id, server_updated_at);
      alter table public.%1$I enable row level security;
      drop policy if exists "membros leem" on public.%1$I;
      create policy "membros leem" on public.%1$I for select using (public.is_member(family_id));
      drop policy if exists "membros inserem" on public.%1$I;
      create policy "membros inserem" on public.%1$I for insert with check (public.is_member(family_id));
      drop policy if exists "membros alteram" on public.%1$I;
      create policy "membros alteram" on public.%1$I for update using (public.is_member(family_id)) with check (public.is_member(family_id));
    $f$, t);
  end loop;
end $$;

-- Marca a hora do servidor em cada gravação (base da sincronização incremental)
create or replace function public.touch_server_updated_at() returns trigger
language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['vehicles', 'drivers', 'expenses'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_server_updated_at()', t);
  end loop;
end $$;

-- Segurança das famílias ---------------------------------------------------------
alter table public.families enable row level security;
alter table public.family_members enable row level security;

drop policy if exists "membros veem a família" on public.families;
create policy "membros veem a família" on public.families for select using (public.is_member(id));

drop policy if exists "membros veem os membros" on public.family_members;
create policy "membros veem os membros" on public.family_members for select using (public.is_member(family_id));

-- Criar família (quem cria vira administrador)
create or replace function public.create_family(fname text) returns public.families
language plpgsql security definer set search_path = public as $$
declare f public.families;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into public.families (name) values (fname) returning * into f;
  insert into public.family_members (family_id, user_id, role, email)
    values (f.id, auth.uid(), 'admin', auth.jwt() ->> 'email');
  return f;
end $$;

-- Entrar numa família com o código de convite
create or replace function public.join_family(code text) returns public.families
language plpgsql security definer set search_path = public as $$
declare f public.families;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  select * into f from public.families where invite_code = upper(trim(code));
  if f.id is null then raise exception 'Código de convite não encontrado'; end if;
  insert into public.family_members (family_id, user_id, email)
    values (f.id, auth.uid(), auth.jwt() ->> 'email')
    on conflict do nothing;
  return f;
end $$;

grant execute on function public.create_family(text) to authenticated;
grant execute on function public.join_family(text) to authenticated;
revoke execute on function public.create_family(text) from anon;
revoke execute on function public.join_family(text) from anon;
