-- Add SKU column to input_maintenance table
ALTER TABLE public.input_maintenance 
ADD COLUMN IF NOT EXISTS sku TEXT;

-- Refresh schema cache
NOTIFY pgrst, 'reload config';
