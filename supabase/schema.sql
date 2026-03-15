-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- 1. USERS TABLE
-- Maps to Supabase auth.users
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  role text default 'user' check (role in ('user', 'admin')),
  stripe_customer_id text,
  stripe_subscription_id text,
  is_premium boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. LISTINGS TABLE
create table public.listings (
  id uuid default uuid_generate_v4() primary key,
  seller_id uuid references public.users(id) on delete cascade not null,
  category text not null,
  title text not null,
  description text,
  price numeric not null,
  currency text default 'EUR' not null,
  condition text not null,
  location_country text not null,
  contact_email text not null,
  contact_phone text,
  
  -- Conditional fields stored as JSONB for flexibility
  details jsonb default '{}'::jsonb,
  
  -- Status and Time logic
  status text default 'DRAFT' check (status in ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE_PREMIUM', 'ACTIVE_PUBLIC', 'SOLD', 'ARCHIVED', 'FLAGGED')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  public_at timestamp with time zone, -- Will be set to created_at + 48h when payment succeeds
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. IMAGES TABLE
create table public.images (
  id uuid default uuid_generate_v4() primary key,
  listing_id uuid references public.listings(id) on delete cascade not null,
  url text not null,
  is_primary boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. LISTING EVENTS TABLE (For intent tracking as planned)
create table public.listing_events (
  id uuid default uuid_generate_v4() primary key,
  listing_id uuid references public.listings(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in ('VIEW', 'CONTACT_REVEAL')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ROW LEVEL SECURITY (RLS) SETUP

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.listings enable row level security;
alter table public.images enable row level security;
alter table public.listing_events enable row level security;

-- USERS Policies
create policy "Users can view their own profile" on public.users for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.users for update using (auth.uid() = id);

-- LISTINGS Policies (The core business logic)
-- 1. Anyone can see ACTIVE_PUBLIC listings
create policy "Anyone can view public listings" on public.listings for select
  using (status = 'ACTIVE_PUBLIC' and public_at <= now());

-- 2. Premium users can see ACTIVE_PREMIUM listings
create policy "Premium users can view premium listings" on public.listings for select
  using (
    status = 'ACTIVE_PREMIUM' and 
    exists (select 1 from public.users where id = auth.uid() and is_premium = true)
  );

-- 3. Sellers can always see and manage their own listings regardless of status
create policy "Sellers can view own listings" on public.listings for select using (auth.uid() = seller_id);
create policy "Sellers can insert own listings" on public.listings for insert with check (auth.uid() = seller_id);
create policy "Sellers can update own listings" on public.listings for update using (auth.uid() = seller_id);
create policy "Sellers can delete own listings" on public.listings for delete using (auth.uid() = seller_id);

-- IMAGES Policies
create policy "Images inherit listing viewing rights (Public)" on public.images for select
  using (exists (select 1 from public.listings where id = listing_id and status = 'ACTIVE_PUBLIC'));

create policy "Images inherit listing viewing rights (Premium)" on public.images for select
  using (
    exists (select 1 from public.listings where id = listing_id and status = 'ACTIVE_PREMIUM') and
    exists (select 1 from public.users where id = auth.uid() and is_premium = true)
  );
  
create policy "Sellers can manage images of their listings" on public.images for all
  using (exists (select 1 from public.listings where id = listing_id and seller_id = auth.uid()));

-- EVENTS Policies
create policy "Users can insert their own events" on public.listing_events for insert
  with check (auth.uid() = user_id or auth.uid() is null);

-- AUTOMATION / TRIGGERS
-- Auto-create public.users row when auth.users signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
