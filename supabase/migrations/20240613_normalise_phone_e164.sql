-- Normalise existing phone numbers in profiles to E.164 format (+27XXXXXXXXX)
-- Run once in Supabase SQL Editor.
-- Handles: "071 234 5678", "0712345678", "+27 71 234 5678", "27 71 234 5678"

UPDATE profiles
SET phone = (
  CASE
    -- Strip all non-digits first, then reformat
    WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^0[0-9]{9}$'
      -- Local SA format: 0XXXXXXXXX → +27XXXXXXXXX
      THEN '+27' || substr(regexp_replace(phone, '[^0-9]', '', 'g'), 2)

    WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^27[0-9]{9}$'
      -- Already has country code without +: 27XXXXXXXXX → +27XXXXXXXXX
      THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')

    WHEN phone LIKE '+%'
      -- Already starts with +, just strip spaces/dashes
      THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')

    ELSE phone  -- Leave anything else untouched
  END
)
WHERE phone IS NOT NULL
  AND phone != '';
