-- Add 'bulan' column to input_maintenance table
ALTER TABLE public.input_maintenance 
ADD COLUMN IF NOT EXISTS bulan TEXT;

-- Optional: Backfill existing data based on 'tanggal'
UPDATE public.input_maintenance 
SET bulan = TRIM(TO_CHAR(tanggal, 'Month YYYY'))
WHERE bulan IS NULL;

-- Refresh schema cache
NOTIFY pgrst, 'reload config';
