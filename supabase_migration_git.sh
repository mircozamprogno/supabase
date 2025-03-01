#
#   I follow this process to duplicate a supabase project for my development environment
#


# 1. Create a new project in Supabase

# 2. start Docker Desktop

# 3. run the upgrade of supabase client
#    brew upgrade supabase

# 4. Export the reference to your projects

export OLD_DB_URL="postgresql://postgres.[your project]:[your password]@[your reference link]:6543/postgres"
export NEW_DB_URL="postgresql://postgres.[your project]:[your password]@[your reference link]:6543/postgres"

# 5. export your files

supabase db dump --db-url "$OLD_DB_URL" -f ./supabase/roles.sql --role-only
supabase db dump --db-url "$OLD_DB_URL" -f ./supabase/schema.sql
supabase db dump --db-url "$OLD_DB_URL" -f ./supabase/data.sql --use-copy --data-only

# 6. export your path for psql

export PATH="/opt/homebrew/Cellar/postgresql@16/16.3/bin:$PATH"

# 7. this step is probably due to the fact that my source project is itself a duplicate
# in the new db
# - create manually a new schema "supabase_functions"
# - create the following

create table supabase_functions.hooks (
  id bigserial not null,
  hook_table_id integer not null,
  hook_name text not null,
  created_at timestamp with time zone not null default now(),
  request_id bigint null,
  constraint hooks_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists supabase_functions_hooks_request_id_idx on supabase_functions.hooks using btree (request_id) TABLESPACE pg_default;

create index IF not exists supabase_functions_hooks_h_table_id_h_name_idx on supabase_functions.hooks using btree (hook_table_id, hook_name) TABLESPACE pg_default;


create table supabase_functions.migrations (
  version text not null,
  inserted_at timestamp with time zone not null default now(),
  constraint migrations_pkey primary key (version)
) TABLESPACE pg_default;


# 8. import 

psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file ./supabase/roles.sql \
  --file ./supabase/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file ./data.sql \
  --dbname "$NEW_DB_URL"

