create table entries (
  id integer primary key autoincrement,
  name text not null,
  site text,
  message text,
  drawing text,
  created integer not null
);

create index entries_created on entries (created);
