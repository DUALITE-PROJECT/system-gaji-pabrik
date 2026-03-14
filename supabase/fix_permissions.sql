-- Fix permissions for user_access table
GRANT ALL ON public.user_access TO anon;
GRANT ALL ON public.user_access TO authenticated;
GRANT ALL ON public.user_access TO service_role;

-- Ensure RLS is enabled but allows all operations for now
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Users" ON public.user_access;
CREATE POLICY "Public Access Users" ON public.user_access FOR ALL USING (true) WITH CHECK (true);

-- Refresh schema cache
NOTIFY pgrst, 'reload config';
