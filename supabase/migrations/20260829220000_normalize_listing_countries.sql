-- Normalize known historical aliases without guessing unrecognized locations.
update public.listings
set location_country = case lower(trim(location_country))
  when 'spain' then 'Spain'
  when 'españa' then 'Spain'
  when 'espana' then 'Spain'
  when 'czech republic' then 'Czech Republic'
  when 'czechia' then 'Czech Republic'
  when 'prague, czech republic' then 'Czech Republic'
  when 'belgium' then 'Belgium'
  when 'belgique' then 'Belgium'
  when 'belgie' then 'Belgium'
  when 'turkey' then 'Türkiye'
  when 'turkiye' then 'Türkiye'
  when 'türkiye' then 'Türkiye'
  else trim(regexp_replace(location_country, '[[:space:]]+', ' ', 'g'))
end
where location_country is not null;
