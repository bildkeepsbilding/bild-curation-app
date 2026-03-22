-- ============================================
-- Bild Curation App — Supabase Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Profiles table (extends Supabase Auth users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brief TEXT DEFAULT '',
  is_inbox BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_user_id ON projects(user_id);

-- 3. Captures table
CREATE TABLE captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url TEXT DEFAULT '',
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  author TEXT DEFAULT '',
  platform TEXT DEFAULT 'other',
  content_tag TEXT DEFAULT '',
  note TEXT DEFAULT '',
  images JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_captures_project_id ON captures(project_id);
CREATE INDEX idx_captures_user_id ON captures(user_id);
CREATE INDEX idx_captures_created_at ON captures(created_at DESC);

-- 4. Auto-update updated_at on projects
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update only their own
CREATE POLICY "own_profile_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own_profile_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Projects: users can CRUD only their own
CREATE POLICY "own_projects_select" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_projects_insert" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_projects_update" ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_projects_delete" ON projects FOR DELETE USING (auth.uid() = user_id);

-- Captures: users can CRUD only their own
CREATE POLICY "own_captures_select" ON captures FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_captures_insert" ON captures FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_captures_update" ON captures FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_captures_delete" ON captures FOR DELETE USING (auth.uid() = user_id);
