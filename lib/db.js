import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
create table if not exists profiles (
  id text primary key,
  name text not null,
  name_key text not null unique,
  passphrase_hash text not null,
  passphrase_salt text not null,
  categories text not null,
  interval_minutes integer not null,
  gmail_email text not null default '',
  refresh_token text not null default '',
  access_token text not null default '',
  access_expires_at integer not null default 0,
  last_sync_at integer,
  last_sync_error text not null default '',
  created_at integer not null
);
create table if not exists sessions (
  token_hash text primary key,
  profile_id text not null,
  expires_at integer not null
);
create table if not exists reservations (
  id text primary key,
  profile_id text not null,
  message_id text not null,
  source text not null,
  category text not null,
  title text not null default '',
  provider text not null default '',
  confirmation_code text not null default '',
  starts_at text not null default '',
  ends_at text not null default '',
  origin text not null default '',
  destination text not null default '',
  place text not null default '',
  party text not null default '',
  price text not null default '',
  currency text not null default '',
  summary text not null default '',
  updated_at integer not null,
  unique(profile_id, message_id)
);
create index if not exists reservations_profile on reservations(profile_id, starts_at);
`;

export function openDatabase(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("pragma journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

export function reservationFromRow(row) {
  return {
    id: row.id,
    messageId: row.message_id,
    source: row.source,
    category: row.category,
    title: row.title,
    provider: row.provider,
    confirmationCode: row.confirmation_code,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    origin: row.origin,
    destination: row.destination,
    place: row.place,
    party: row.party,
    price: row.price,
    currency: row.currency,
    summary: row.summary,
  };
}
