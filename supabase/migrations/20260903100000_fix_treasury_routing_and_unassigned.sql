-- Strengthen Tax/Treasury keyword routing so treasurer complaints are not left Unassigned.

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
  elsif combined ~* '(real property tax|property tax|tax payment|tax receipt|community tax|cedula|treasurer|treasury|city treasurer|bayad sa tax|bayad sa treasurer|\mtax\M)' then
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

-- Backfill recent Unassigned treasury-related complaints.
update public.complaints
set
  category = 'Tax and Treasury Concerns',
  assigned_office = 'City Treasurer''s Office'
where coalesce(assigned_office, '') in ('', 'Unassigned')
  and (
    lower(coalesce(title, '') || ' ' || coalesce(description, ''))
      ~* '(treasurer|treasury|real property tax|tax payment|cedula|bayad sa tax|bayad sa treasurer)'
    or lower(coalesce(category, '')) like '%tax%'
    or lower(coalesce(category, '')) like '%treasury%'
  );
