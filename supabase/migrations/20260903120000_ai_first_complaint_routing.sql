-- Prefer AI category for routing; keywords only correct catch-alls and high-risk misroutes.

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
  elsif combined ~* '(disaster|emergency|rescue|landslide|earthquake|calamity|evacuation|cdrrmo)' then
    keyword_category := 'Disaster and Emergency Concerns';
  elsif combined ~* '(water|tubig|no water|walay tubig|dirty water|burst pipe|broken pipe|bogo water)' then
    keyword_category := 'Water Concerns';
  elsif combined ~* '(electricity|brownout|power outage|kuryente|live wire|electric post|cebeco)' then
    keyword_category := 'Electricity Concerns';
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
  elsif combined ~* '(tourism|tourist|tourist spot|public attraction|tourism site|heritage site)' then
    keyword_category := 'Tourism Site / Public Attraction Concerns';
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
  elsif combined ~* '(city hall|covered court|waiting area|public restroom|city facility|multi-purpose hall|sports complex|general services|\bgso\b)' then
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
