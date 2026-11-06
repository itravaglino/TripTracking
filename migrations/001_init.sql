create table users (
  id text primary key,
  google_sub text unique,
  email text not null,
  name text not null default '',
  demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table profiles (
  user_id text primary key references users (id),
  track_flights boolean not null default true,
  track_lodging boolean not null default true,
  track_transport boolean not null default true,
  track_plans boolean not null default true,
  track_events boolean not null default false,
  scan_interval_minutes integer not null default 360,
  setup_complete boolean not null default false,
  gmail_connected boolean not null default false,
  gmail_email text not null default '',
  token_ciphertext text not null default '',
  token_iv text not null default '',
  initial_scan_done boolean not null default false,
  last_scan_at timestamptz,
  next_scan_at timestamptz,
  last_scan_status text not null default '',
  last_scan_error text not null default '',
  last_manual_scan_at timestamptz,
  scan_lock_until timestamptz
);

create table sessions (
  id text primary key,
  user_id text not null references users (id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_user_idx on sessions (user_id);

create table login_codes (
  code_hash text primary key,
  session_token text not null,
  expires_at timestamptz not null
);

create table reservations (
  id text primary key,
  user_id text not null references users (id),
  category text not null,
  status text not null default 'confirmed',
  title text not null,
  provider text not null default '',
  confirmation_code text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  origin text not null default '',
  destination text not null default '',
  location text not null default '',
  party text not null default '',
  flight_number text not null default '',
  details jsonb not null default '{}'::jsonb,
  source_message_id text not null default '',
  source_subject text not null default '',
  fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create index reservations_user_start_idx on reservations (user_id, starts_at);
create index profiles_due_idx on profiles (next_scan_at);
