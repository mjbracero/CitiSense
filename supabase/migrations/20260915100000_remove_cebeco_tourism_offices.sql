-- Remove CEBECO II (Electricity Concerns) and City Tourism Office
-- (Tourism Site / Public Attraction Concerns) from routing.
-- Tourist spots and public attractions are handled as City Facility Concerns (GSO).
-- Power concerns are outside CitiSense scope; live wires route to CDRRMO.

create or replace function public.complaint_office_for_category(p_category text)
returns text
language sql
immutable
as $$
  select case trim(coalesce(p_category, ''))
    when 'Water Concerns' then 'Bogo Water District'
    when 'Streetlight Concerns' then 'City Engineering Office'
    when 'Road and Infrastructure Concerns' then 'City Engineering Office'
    when 'Drainage and Flooding Concerns' then 'City Engineering Office'
    when 'Waste and Environmental Concerns' then 'CENRO'
    when 'Traffic and Road Safety Concerns' then 'BTMO'
    when 'Transport Terminal Concerns' then 'Bogo City Central Bus Terminal Office'
    when 'Port Concerns' then 'Polambato Port Office'
    when 'Health and Sanitation Concerns' then 'City Health Office'
    when 'Animal Concerns' then 'City Veterinary Office'
    when 'Building and Construction Concerns' then 'Office of the Building Official'
    when 'Planning and Zoning Concerns' then 'City Planning and Development Office'
    when 'Public Market Concerns' then 'Bogo Public Market Office'
    when 'Public Plaza Concerns' then 'Bogo Public Plaza Office'
    when 'Public Library Concerns' then 'Bogo Public Library Office'
    when 'City Facility Concerns' then 'General Services Office'
    when 'Disaster and Emergency Concerns' then 'CDRRMO'
    when 'Fire Safety Concerns' then 'BFP Bogo City Fire Station'
    when 'Peace and Order Concerns' then 'Bogo City Police Station / PNP'
    when 'Coastal and Marine Protection Concerns' then 'Bantay Dagat'
    when 'PWD Accessibility Concerns' then 'PDAO'
    when 'Tax and Treasury Concerns' then 'City Treasurer''s Office'
    when 'Property Assessment Concerns' then 'City Assessor''s Office'
    when 'Civil Registry Concerns' then 'City Civil Registrar''s Office'
    else null
  end;
$$;

create or replace function public.reconcile_complaint_category_from_text(
  p_title text,
  p_description text,
  p_ai_category text
)
returns text
language plpgsql
immutable
as $$
declare
  combined text;
  resolved text;
  keyword_category text;
  hard_override boolean := false;
begin
  combined := lower(trim(coalesce(p_title, '') || ' ' || coalesce(p_description, '')));
  resolved := nullif(trim(coalesce(p_ai_category, '')), '');
  keyword_category := null;

  -- Older clients may still send the removed categories.
  if resolved = 'Tourism Site / Public Attraction Concerns' then
    resolved := 'City Facility Concerns';
  elsif resolved = 'Electricity Concerns' then
    resolved := 'Unclassified';
  end if;

  if combined = '' then
    return coalesce(resolved, 'Unclassified');
  end if;

  -- Strong/hard-override signals first (known AI misroutes).
  if combined ~* '(business permit|mayor''s permit|mayors permit|bplo|business license|permit application|permit process)' then
    keyword_category := 'Business Permit and Licensing Concerns';
    hard_override := true;
  elsif combined ~* '(birth certificate|marriage certificate|death certificate|civil registrar|civil registry|birth cert|marriage cert|death cert)' then
    keyword_category := 'Civil Registry Concerns';
    hard_override := true;
  elsif combined ~* '(real property tax|property tax|tax payment|tax receipt|community tax|cedula|treasurer|treasury|city treasurer|bayad sa tax|bayad sa treasurer)' then
    keyword_category := 'Tax and Treasury Concerns';
    hard_override := true;
  elsif combined ~* '(assessor|property valuation|land valuation|tax declaration|city assessor)' then
    keyword_category := 'Property Assessment Concerns';
    hard_override := true;
  elsif combined ~* '(fire|sunog|smoke|gas leak|explosion|bfp)' then
    keyword_category := 'Fire Safety Concerns';
    hard_override := true;
  elsif combined ~* '(crime|robbery|shooting|stabbing|murder|police|violence|theft|vandalism)' then
    keyword_category := 'Peace and Order Concerns';
    hard_override := true;
  elsif combined ~* '(disaster|emergency|rescue|landslide|earthquake|calamity|evacuation|cdrrmo|live wire|fallen wire|electrocution)' then
    keyword_category := 'Disaster and Emergency Concerns';
  elsif combined ~* '(water|tubig|no water|walay tubig|dirty water|burst pipe|broken pipe|bogo water)' then
    keyword_category := 'Water Concerns';
  elsif combined ~* '(streetlight|street light|lamp post|dark road|broken streetlight)' then
    keyword_category := 'Streetlight Concerns';
  elsif combined ~* '(traffic|road safety|illegal parking|reckless driving|crosswalk|road obstruction|btmo|accident|crash)' then
    keyword_category := 'Traffic and Road Safety Concerns';
  elsif combined ~* '(building permit|construction permit|illegal structure|building official|obo|illegal construction|unsafe structure)' then
    keyword_category := 'Building and Construction Concerns';
  elsif combined ~* '(bus terminal|van terminal|jeepney terminal|transport terminal|terminal fare|overcharging fare|central bus terminal)' then
    keyword_category := 'Transport Terminal Concerns';
  elsif combined ~* '(polambato|passenger port|ferry|barko|wharf|port office)' then
    keyword_category := 'Port Concerns';
  elsif combined ~* '(pwd|wheelchair|handrail|accessibility|disabled|disability|pdao|blocked ramp|senior access)' then
    keyword_category := 'PWD Accessibility Concerns';
  elsif combined ~* '(coastal|marine|illegal fishing|bantay dagat|mangrove|fish kill|coral|shoreline|coastal waste)' then
    keyword_category := 'Coastal and Marine Protection Concerns';
  elsif combined ~* '(drainage|flooding|flooded|baha|canal|sewer|clogged drainage)' then
    keyword_category := 'Drainage and Flooding Concerns';
  elsif combined ~* '(pothole|damaged road|uneven road|sidewalk|bridge|infrastructure)' then
    keyword_category := 'Road and Infrastructure Concerns';
  elsif combined ~* '(garbage|trash|basura|pollution|litter|cenro)' then
    keyword_category := 'Waste and Environmental Concerns';
  elsif combined ~* '(public library|bogo public library|library book|reading room|langas sa library)' then
    keyword_category := 'Public Library Concerns';
  elsif combined ~* '(public market|merkado|wet market|market vendor|market stall)' then
    keyword_category := 'Public Market Concerns';
  elsif combined ~* '(public plaza|playground|park bench)' then
    keyword_category := 'Public Plaza Concerns';
  elsif combined ~* '(zoning|land use|subdivision|setback|building plan approval)' then
    keyword_category := 'Planning and Zoning Concerns';
  elsif combined ~* '(dengue|food poisoning|unsanitary|city health|sanitation|clinic|hospital)' then
    keyword_category := 'Health and Sanitation Concerns';
  elsif combined ~* '(stray dog|stray cat|dog bite|rabies|livestock|veterinary|aggressive dog)' then
    keyword_category := 'Animal Concerns';
  elsif combined ~* '(city hall|covered court|waiting area|public restroom|city facility|multi-purpose hall|sports complex|general services|\bgso\b|tourism|tourist|tourist spot|public attraction|tourism site|heritage site)' then
    keyword_category := 'City Facility Concerns';
  end if;

  -- Prefer AI when it already chose a specific category.
  if resolved is not null
    and resolved <> ''
    and resolved <> 'Unclassified'
    and resolved <> 'City Facility Concerns'
  then
    if hard_override and keyword_category is not null and keyword_category <> resolved then
      return keyword_category;
    end if;
    return resolved;
  end if;

  -- AI catch-all / missing → use keywords when available.
  if keyword_category is not null then
    return keyword_category;
  end if;

  return coalesce(resolved, 'Unclassified');
end;
$$;

-- Existing tourism complaints → City Facility Concerns (GSO).
-- The routing trigger re-runs on category change and sets the office.
update public.complaints
set
  category = 'City Facility Concerns',
  assigned_office = 'General Services Office'
where trim(coalesce(category, '')) = 'Tourism Site / Public Attraction Concerns';

-- Existing electricity complaints → re-classified from text (e.g. live wire → CDRRMO,
-- streetlight → City Engineering), otherwise Unclassified / Unassigned for admin review.
update public.complaints
set
  category = 'Unclassified',
  assigned_office = 'Unassigned'
where trim(coalesce(category, '')) = 'Electricity Concerns';

-- Strip the removed offices from any remaining (including dual-routed) assignments.
update public.complaints
set assigned_office = coalesce(
  nullif(
    array_to_string(
      array_remove(
        array_remove(
          regexp_split_to_array(
            replace(assigned_office, 'City Tourism Office', 'General Services Office'),
            '\s*&\s*'
          ),
          'CEBECO II'
        ),
        ''
      ),
      ' & '
    ),
    ''
  ),
  'Unassigned'
)
where assigned_office ilike '%CEBECO II%'
   or assigned_office ilike '%City Tourism Office%';
