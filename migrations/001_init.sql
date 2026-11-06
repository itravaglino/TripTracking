create table if not exists profiles (
  id text primary key,
  email text not null,
  name text not null default '',
  google_sub text,
  gmail_linked boolean not null default false,
  refresh_token_enc text,
  access_token_enc text,
  access_token_expires_at timestamptz,
  sync_interval_minutes integer not null default 360,
  lookback_days integer not null default 180,
  track_flight boolean not null default true,
  track_lodging boolean not null default true,
  track_transport boolean not null default true,
  track_plan boolean not null default true,
  track_event boolean not null default false,
  setup_complete boolean not null default false,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  last_manual_sync_at timestamptz,
  sync_locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reservations (
  id text primary key,
  profile_id text not null references profiles(id) on delete cascade,
  category text not null,
  title text not null,
  provider text,
  confirmation_code text,
  status text not null default 'confirmed',
  starts_at timestamptz,
  ends_at timestamptz,
  origin text,
  destination text,
  location text,
  details jsonb not null default '{}'::jsonb,
  source_message_id text,
  source_subject text,
  dedupe_key text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, dedupe_key)
);

create index if not exists reservations_profile_starts_idx
  on reservations (profile_id, starts_at);

create unique index if not exists profiles_google_sub_idx on profiles (google_sub);

create table if not exists processed_messages (
  profile_id text not null references profiles(id) on delete cascade,
  message_id text not null,
  processed_at timestamptz not null default now(),
  primary key (profile_id, message_id)
);

create table if not exists oauth_states (
  state text primary key,
  created_at timestamptz not null default now(),
  return_to text not null
);
