This is a support scripts to migrate one Supabase project content to another one

The need to duplicate a project is in my case to use it as development environment in my Flutterflow projects.

The main documentation is coming from here: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
BUT ... the script described inside this document to migrate storage object does not work!

The source script to migrate the storage object was from here: https://gist.github.com/Ellba/654306645735b4e8d4974a0f756be61b
BUT I added some additional logic, like excluding a bucket from the migration and the writing into a log

The scrupt to migrate the storage policies is mine.

This is my process to duplicate entirely all what is needed to use it in a new project

Prerequisities: I am using this script in my Mac, so you need to install:

- supabase client
- Docker desktop
- psql

the macro steps are:

1. Create a new project in Supabase (normally I add the suffix _dev to my original project)
3. run the script steps described inside supabase_migration_git.sh, follow step by step what is described inside
4. run the node js script supabase_migrate_objects_git.js
5. run the node js script supabase_migrate_policies_git.js

Enjoy!
