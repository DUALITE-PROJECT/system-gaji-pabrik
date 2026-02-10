-- Add 'bulan' column to input_data_produksi table
ALTER TABLE public.input_data_produksi ADD COLUMN IF NOT EXISTS bulan TEXT;

-- Refresh schema cache
NOTIFY pgrst, 'reload config';
