-- CRITICAL: Enforce user data isolation via RLS
-- Previously, authenticated users could see ALL projects and captures.
-- This migration ensures each user can only access their own data,
-- while preserving public access to explicitly shared projects.

-- Ensure RLS is enabled
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;

-- Drop the overly permissive public policies (they don't check user_id for authenticated users)
DROP POLICY IF EXISTS "Public can view shared projects" ON projects;
DROP POLICY IF EXISTS "Public can view captures of shared projects" ON captures;

-- ═══════════════════════════════════════════════
-- PROJECTS table policies
-- ═══════════════════════════════════════════════

-- Owner can SELECT their own projects
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Public can SELECT shared projects (for /p/[id] route)
CREATE POLICY "Anyone can view shared projects"
  ON projects FOR SELECT
  TO anon, authenticated
  USING (share = true);

-- Owner can INSERT their own projects
CREATE POLICY "Users can create own projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Owner can UPDATE their own projects
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Owner can DELETE their own projects
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════
-- CAPTURES table policies
-- ═══════════════════════════════════════════════

-- Owner can SELECT their own captures
CREATE POLICY "Users can view own captures"
  ON captures FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Public can SELECT captures belonging to shared projects
CREATE POLICY "Anyone can view captures of shared projects"
  ON captures FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = captures.project_id
      AND projects.share = true
    )
  );

-- Owner can INSERT their own captures
CREATE POLICY "Users can create own captures"
  ON captures FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Owner can UPDATE their own captures
CREATE POLICY "Users can update own captures"
  ON captures FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Owner can DELETE their own captures
CREATE POLICY "Users can delete own captures"
  ON captures FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
