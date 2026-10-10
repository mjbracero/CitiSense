-- Treat City Planning and Zoning as one office.
-- Do not split assigned_office on the word "and" (that broke Planning names).

create or replace function public.office_matches_moderator_department(
  p_assigned_office text,
  p_moderator_department text
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  assigned text;
  dept text;
  part text;
begin
  assigned := lower(trim(both from regexp_replace(coalesce(p_assigned_office, ''), '''+', '', 'g')));
  dept := lower(trim(both from regexp_replace(coalesce(p_moderator_department, ''), '''+', '', 'g')));
  assigned := regexp_replace(assigned, '\s+', ' ', 'g');
  dept := regexp_replace(dept, '\s+', ' ', 'g');

  if dept = '' or assigned = '' then
    return false;
  end if;

  if assigned = dept then
    return true;
  end if;

  if assigned like '%' || dept || '%' then
    return true;
  end if;

  if dept like '%' || assigned || '%' then
    return true;
  end if;

  -- Dual-routed offices only use "&" as separator.
  foreach part in array regexp_split_to_array(coalesce(p_assigned_office, ''), '\s*&\s*')
  loop
    part := lower(trim(both from regexp_replace(part, '''+', '', 'g')));
    part := regexp_replace(part, '\s+', ' ', 'g');

    if part = '' then
      continue;
    end if;

    if part = dept or part like '%' || dept || '%' or dept like '%' || part || '%' then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.complaint_office_for_category(p_category text)
returns text
language sql
immutable
as $$
  select case trim(coalesce(p_category, ''))
    when 'Water Concerns' then 'Bogo Water District'
    when 'Electricity Concerns' then 'CEBECO II'
    when 'Streetlight Concerns' then 'City Engineering Office'
    when 'Road and Infrastructure Concerns' then 'City Engineering Office'
    when 'Drainage and Flooding Concerns' then 'City Engineering Office & CDRRMO'
    when 'Waste and Environmental Concerns' then 'CENRO'
    when 'Traffic and Road Safety Concerns' then 'BTMO & Bogo City Police Station / PNP'
    when 'Transport Terminal Concerns' then 'Bogo City Central Bus Terminal Office'
    when 'Port Concerns' then 'Polambato Port Office'
    when 'Health and Sanitation Concerns' then 'City Health Office & CENRO'
    when 'Animal Concerns' then 'City Veterinary Office'
    when 'Building and Construction Concerns' then 'Office of the Building Official & City Engineering Office'
    when 'Planning and Zoning Concerns' then 'City Planning and Zoning Office'
    when 'Public Market Concerns' then 'Bogo Public Market Office'
    when 'Public Plaza Concerns' then 'Bogo Public Plaza Office'
    when 'Public Library Concerns' then 'Bogo Public Library Office'
    when 'City Facility Concerns' then 'General Services Office'
    when 'Tourism Site / Public Attraction Concerns' then 'City Tourism Office'
    when 'Disaster and Emergency Concerns' then 'CDRRMO & BFP Bogo City Fire Station'
    when 'Fire Safety Concerns' then 'BFP Bogo City Fire Station & CDRRMO'
    when 'Peace and Order Concerns' then 'Bogo City Police Station / PNP'
    when 'Coastal and Marine Protection Concerns' then 'Bantay Dagat & CENRO'
    when 'PWD Accessibility Concerns' then 'PDAO'
    when 'Tax and Treasury Concerns' then 'City Treasurer''s Office'
    when 'Property Assessment Concerns' then 'City Assessor''s Office'
    when 'Civil Registry Concerns' then 'City Civil Registrar''s Office'
    else null
  end;
$$;

-- Normalize existing Planning/Zoning office labels to the single canonical name.
update public.complaints
set assigned_office = 'City Planning and Zoning Office'
where lower(trim(assigned_office)) in (
  'city planning and development office / zoning office',
  'city planning and development office',
  'city planning and zoning office',
  'zoning office',
  'city planning office',
  'planning and zoning office',
  'planning and development office'
);

update public.profiles
set department = 'City Planning and Zoning Office'
where lower(trim(department)) in (
  'city planning and development office / zoning office',
  'city planning and development office',
  'city planning and zoning office',
  'zoning office',
  'city planning office',
  'planning and zoning office',
  'planning and development office'
);
