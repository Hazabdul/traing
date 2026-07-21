/*
# Fix profiles.id default

The profiles.id column defaulted to auth.uid(), which is NULL when the
handle_new_user trigger runs from a service-role context (no auth session),
causing a NOT NULL violation. Switch the default to gen_random_uuid() so
the trigger can always create a profile row. user_id remains the link to auth.users.
*/

ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
