-- Add the missing column to the Garut borongan table
ALTER TABLE public.data_gaji_borongan_pabrik_garut 
ADD COLUMN IF NOT EXISTS perusahaan TEXT;

-- Refresh the API schema cache to recognize the new column immediately
NOTIFY pgrst, 'reload config';
