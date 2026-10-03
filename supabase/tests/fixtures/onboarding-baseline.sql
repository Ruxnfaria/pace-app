-- Disposable local test infrastructure only. Never run against an existing DB.
-- auth/profiles precede this repo's migration history; domain tables/functions
-- are loaded from the unchanged historical migrations, not reimplemented here.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  nome text, peso numeric, altura numeric, objetivo text, status_assinatura text,
  created_at timestamptz DEFAULT now(), total_xp integer DEFAULT 0,
  level integer DEFAULT 1, streak integer DEFAULT 0, last_activity_date date,
  league text, weekly_xp integer DEFAULT 0, best_league text,
  onboarding_completed boolean DEFAULT false, nivel_experiencia text,
  idade integer, sexo text, dias_treino integer
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated, anon;
GRANT ALL ON public.profiles TO service_role;

CREATE FUNCTION public.reward_system_set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
