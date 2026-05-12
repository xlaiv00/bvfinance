-- Together Finance App — Supabase Schema
-- Run this entire file in your Supabase SQL Editor

-- Shared household (one per couple)
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Finances',
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_at timestamptz default now()
);

-- Users linked to a household
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete set null,
  display_name text not null default 'You',
  created_at timestamptz default now()
);

-- Expenses
create table expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  currency text not null default 'EUR',
  amount_eur numeric(12,2) not null,
  date date not null,
  category text not null,
  paid_by text not null default 'joint',
  created_at timestamptz default now()
);

-- Contributions to the joint account
create table contributions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  person text not null,
  amount numeric(12,2) not null,
  currency text not null default 'EUR',
  amount_eur numeric(12,2) not null,
  date date not null,
  note text,
  created_at timestamptz default now()
);

-- Savings goals
create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null,
  currency text not null default 'EUR',
  target_eur numeric(12,2) not null,
  emoji text not null default '💰',
  created_at timestamptz default now()
);

-- Deposits into savings goals
create table savings_deposits (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references savings_goals(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null default 'EUR',
  amount_eur numeric(12,2) not null,
  date date not null,
  deposited_by text not null default 'joint',
  created_at timestamptz default now()
);

-- Trips
create table trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  budget numeric(12,2) not null,
  currency text not null default 'EUR',
  budget_eur numeric(12,2) not null,
  date_from date,
  date_to date,
  created_at timestamptz default now()
);

-- Trip expenses
create table trip_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  currency text not null default 'EUR',
  amount_eur numeric(12,2) not null,
  category text not null,
  date date not null,
  created_at timestamptz default now()
);

-- Row Level Security
alter table households enable row level security;
alter table profiles enable row level security;
alter table expenses enable row level security;
alter table contributions enable row level security;
alter table savings_goals enable row level security;
alter table savings_deposits enable row level security;
alter table trips enable row level security;
alter table trip_expenses enable row level security;

-- Profiles: users manage their own
create policy "users manage own profile"
  on profiles for all using (auth.uid() = id);

-- Households: members can read/update their household
create policy "household members can read"
  on households for select using (
    id in (select household_id from profiles where id = auth.uid())
  );
create policy "household members can update"
  on households for update using (
    id in (select household_id from profiles where id = auth.uid())
  );
create policy "authenticated users can create household"
  on households for insert with check (auth.uid() is not null);

-- Helper function
create or replace function my_household_id()
returns uuid language sql stable as $$
  select household_id from profiles where id = auth.uid()
$$;

-- Expenses
create policy "household expenses"
  on expenses for all using (household_id = my_household_id());

-- Contributions
create policy "household contributions"
  on contributions for all using (household_id = my_household_id());

-- Savings goals
create policy "household savings goals"
  on savings_goals for all using (household_id = my_household_id());

-- Savings deposits
create policy "household savings deposits"
  on savings_deposits for all using (household_id = my_household_id());

-- Trips
create policy "household trips"
  on trips for all using (household_id = my_household_id());

-- Trip expenses
create policy "household trip expenses"
  on trip_expenses for all using (household_id = my_household_id());

-- Auto-create profile on sign up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'You'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Enable Realtime presence (run this if not already enabled)
-- Supabase Realtime works out of the box for presence channels
-- No extra SQL needed — presence uses ephemeral channels, not DB tables
