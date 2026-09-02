-- Ensure every new complaint stores the correct category and canonical office.
-- Re-runs when title, description, or category changes — not on office-only admin reassignments.

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
    when 'Planning and Zoning Concerns' then 'City Planning and Development Office / Zoning Office'
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
    when 'Business Permit and Licensing Concerns' then 'City Business Permit and Licensing Office'
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
begin
  combined := lower(trim(coalesce(p_title, '') || ' ' || coalesce(p_description, '')));
  resolved := nullif(trim(coalesce(p_ai_category, '')), '');
  keyword_category := null;

  if combined = '' then
    return coalesce(resolved, 'Unclassified');
  end if;

  if combined ~* '(fire|sunog|smoke|gas leak|explosion|bfp)' then
    keyword_category := 'Fire Safety Concerns';
  elsif combined ~* '(disaster|emergency|rescue|landslide|earthquake|calamity)' then
    keyword_category := 'Disaster and Emergency Concerns';
  elsif combined ~* '(crime|robbery|shooting|stabbing|murder|police|violence)' then
    keyword_category := 'Peace and Order Concerns';
  elsif combined ~* '(water|tubig|no water|dirty water|burst pipe|broken pipe)' then
    keyword_category := 'Water Concerns';
  elsif combined ~* '(electricity|brownout|power outage|kuryente|live wire|electric post)' then
    keyword_category := 'Electricity Concerns';
  elsif combined ~* '(traffic|road safety|illegal parking|reckless driving|crosswalk|road obstruction)' then
    keyword_category := 'Traffic and Road Safety Concerns';
  elsif combined ~* '(building permit|construction permit|illegal structure|building official|obo|structural)' then
    keyword_category := 'Building and Construction Concerns';
  elsif combined ~* '(business permit|mayor''s permit|mayors permit|bplo|business license|permit application|permit process)' then
    keyword_category := 'Business Permit and Licensing Concerns';
  elsif combined ~* '(birth certificate|marriage certificate|death certificate|civil registrar|civil registry|birth cert|marriage cert|death cert)' then
    keyword_category := 'Civil Registry Concerns';
  elsif combined ~* '(assessor|property valuation|land valuation|tax declaration)' then
    keyword_category := 'Property Assessment Concerns';
  elsif combined ~* '(real property tax|property tax|tax payment|tax receipt|community tax|cedula|treasurer|treasury)' then
    keyword_category := 'Tax and Treasury Concerns';
  elsif combined ~* '(drainage|flooding|flooded|baha|canal|sewer)' then
    keyword_category := 'Drainage and Flooding Concerns';
  elsif combined ~* '(public library|bogo public library|library book|reading room|langas sa library)' then
    keyword_category := 'Public Library Concerns';
  elsif combined ~* '(city hall|gym|covered court|waiting area|public restroom|city facility|multi-purpose hall)' then
    keyword_category := 'City Facility Concerns';
  end if;

  if keyword_category is not null then
    if resolved is null
      or resolved = 'Unclassified'
      or resolved = 'City Facility Concerns'
      or keyword_category in (
        'Business Permit and Licensing Concerns',
        'Civil Registry Concerns',
        'Tax and Treasury Concerns',
        'Property Assessment Concerns',
        'Public Library Concerns',
        'Traffic and Road Safety Concerns',
        'Drainage and Flooding Concerns',
        'Fire Safety Concerns',
        'Peace and Order Concerns',
        'Water Concerns',
        'Electricity Concerns',
        'Building and Construction Concerns'
      )
    then
      return keyword_category;
    end if;
  end if;

  return coalesce(resolved, 'Unclassified');
end;
$$;

create or replace function public.enforce_complaint_routing()
returns trigger
language plpgsql
as $$
declare
  resolved_category text;
  resolved_office text;
begin
  resolved_category := public.reconcile_complaint_category_from_text(
    new.title,
    new.description,
    new.category
  );

  resolved_office := public.complaint_office_for_category(resolved_category);

  if resolved_category is not null and resolved_category <> '' then
    new.category := resolved_category;
  end if;

  if resolved_office is not null and resolved_office <> '' then
    new.assigned_office := resolved_office;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_complaint_routing_trigger on public.complaints;
drop trigger if exists enforce_complaint_routing_insert_trigger on public.complaints;
drop trigger if exists enforce_complaint_routing_update_trigger on public.complaints;

create trigger enforce_complaint_routing_insert_trigger
before insert on public.complaints
for each row
execute function public.enforce_complaint_routing();

create trigger enforce_complaint_routing_update_trigger
before update of title, description, category on public.complaints
for each row
execute function public.enforce_complaint_routing();
