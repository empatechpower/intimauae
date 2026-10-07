-- Copy phone from auth signup metadata into profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role, preferred_lang, preferred_currency)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), ''),
    'customer',
    'ar',
    'AED'
  );
  return new;
end;
$$;

-- Helpful uniqueness for login-by-phone (allows multiple nulls)
create unique index if not exists profiles_phone_unique
  on public.profiles (phone)
  where phone is not null and length(trim(phone)) > 0;
