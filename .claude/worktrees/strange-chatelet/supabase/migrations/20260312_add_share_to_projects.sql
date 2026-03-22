-- Add share column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share boolean NOT NULL DEFAULT false;

-- Create index for efficient lookups of shared projects
CREATE INDEX IF NOT EXISTS idx_projects_share ON projects (share) WHERE share = true;

-- RLS policy: allow anonymous SELECT on shared projects
CREATE POLICY "Public can view shared projects"
  ON projects FOR SELECT
  USING (share = true);

-- RLS policy: allow anonymous SELECT on captures belonging to shared projects
CREATE POLICY "Public can view captures of shared projects"
  ON captures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = captures.project_id
      AND projects.share = true
    )
  );
