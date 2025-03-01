This is a support scripts to migrate one Supabase project content to another one

The need to duplicate a project is in my case to use it as development environment in my Flutterflow projects.

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
