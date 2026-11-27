-- Player-to-player Ghost//Link messaging. Apply this migration in Supabase before using the UI.
-- All reads/writes use checked RPCs; direct table access is deliberately unavailable.
create table if not exists public.phone_player_dm_settings (
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 mode text not null default 'disabled' check(mode in ('disabled','private','monitored'))
);
create table if not exists public.phone_player_dm_messages (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 sender_character_id uuid not null references public.characters(id) on delete cascade,
 recipient_character_id uuid not null references public.characters(id) on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),
 check(sender_character_id<>recipient_character_id)
);
create index if not exists phone_player_dm_inbox_idx on public.phone_player_dm_messages(recipient_character_id,created_at desc);
create index if not exists phone_player_dm_sender_idx on public.phone_player_dm_messages(sender_character_id,created_at desc);
alter table public.phone_player_dm_settings enable row level security;
alter table public.phone_player_dm_messages enable row level security;
revoke all on public.phone_player_dm_settings,public.phone_player_dm_messages from anon,authenticated;

create or replace function public.phone_player_dm_mode(p_campaign_id uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare v_mode text;
begin
 if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and
 (c.gm_id=auth.uid() or exists(select 1 from public.characters ch where ch.campaign_id=c.id and ch.player_id=auth.uid())))
 then raise exception 'Not authorized for campaign'; end if;
 select mode into v_mode from public.phone_player_dm_settings where campaign_id=p_campaign_id;
 return coalesce(v_mode,'disabled');
end;$$;

create or replace function public.phone_player_dm_set_mode(p_campaign_id uuid,p_mode text)
returns text language plpgsql security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then raise exception 'GM access required'; end if;
 if p_mode not in ('disabled','private','monitored') or p_mode is null then raise exception 'Invalid messaging mode'; end if;
 insert into public.phone_player_dm_settings(campaign_id,mode) values(p_campaign_id,p_mode)
 on conflict(campaign_id) do update set mode=excluded.mode;
 return p_mode;
end;$$;

create or replace function public.phone_player_dm_contacts(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_campaign uuid;v_mode text;
begin
 select campaign_id into v_campaign from public.characters where id=p_character_id and player_id=auth.uid();
 if v_campaign is null then raise exception 'Not authorized for character'; end if;
 select coalesce(s.mode,'disabled') into v_mode from public.campaigns c left join public.phone_player_dm_settings s on s.campaign_id=c.id where c.id=v_campaign;
 if v_mode='disabled' then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',ch.id,'name',ch.name) order by ch.name)
 from public.characters ch where ch.campaign_id=v_campaign and ch.id<>p_character_id and ch.player_id is not null),'[]'::jsonb);
end;$$;

create or replace function public.phone_player_dm_history(p_character_id uuid,p_other_character_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_campaign uuid;v_mode text;
begin
 select campaign_id into v_campaign from public.characters where id=p_character_id and player_id=auth.uid();
 if v_campaign is null then raise exception 'Not authorized for character'; end if;
 select coalesce(s.mode,'disabled') into v_mode from public.campaigns c left join public.phone_player_dm_settings s on s.campaign_id=c.id where c.id=v_campaign;
 if v_mode='disabled' then raise exception 'Player messaging is disabled'; end if;
 if not exists(select 1 from public.characters where id=p_other_character_id and campaign_id=v_campaign and player_id is not null)
 then raise exception 'Invalid recipient'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_character_id,'body',m.body,'created_at',m.created_at) order by m.created_at,m.id)
 from (select * from public.phone_player_dm_messages
 where campaign_id=v_campaign and ((sender_character_id=p_character_id and recipient_character_id=p_other_character_id)
 or (sender_character_id=p_other_character_id and recipient_character_id=p_character_id))
 order by created_at desc,id desc limit 200) m),'[]'::jsonb);
end;$$;

create or replace function public.phone_player_dm_send(p_character_id uuid,p_recipient_character_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_campaign uuid;v_mode text;v_id uuid;
begin
 select campaign_id into v_campaign from public.characters where id=p_character_id and player_id=auth.uid();
 if v_campaign is null then raise exception 'Not authorized for character'; end if;
 select coalesce(s.mode,'disabled') into v_mode from public.campaigns c left join public.phone_player_dm_settings s on s.campaign_id=c.id where c.id=v_campaign;
 if v_mode='disabled' then raise exception 'Player messaging is disabled'; end if;
 if p_character_id=p_recipient_character_id or not exists(select 1 from public.characters where id=p_recipient_character_id and campaign_id=v_campaign and player_id is not null)
 then raise exception 'Invalid recipient'; end if;
 insert into public.phone_player_dm_messages(campaign_id,sender_character_id,recipient_character_id,body)
 values(v_campaign,p_character_id,p_recipient_character_id,btrim(p_body)) returning id into v_id;
 return v_id;
end;$$;

create or replace function public.phone_player_dm_monitor(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.campaigns where id=p_campaign_id and gm_id=auth.uid()) then raise exception 'GM access required'; end if;
 if not exists(select 1 from public.phone_player_dm_settings where campaign_id=p_campaign_id and mode='monitored')
 then raise exception 'Player messages are not available for GM monitoring'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender',sender.name,'recipient',recipient.name,'body',m.body,'created_at',m.created_at) order by m.created_at desc,m.id desc)
 from (select * from public.phone_player_dm_messages where campaign_id=p_campaign_id order by created_at desc,id desc limit 300) m
 join public.characters sender on sender.id=m.sender_character_id
 join public.characters recipient on recipient.id=m.recipient_character_id),'[]'::jsonb);
end;$$;

revoke all on function public.phone_player_dm_mode(uuid),public.phone_player_dm_set_mode(uuid,text),public.phone_player_dm_contacts(uuid),public.phone_player_dm_history(uuid,uuid),public.phone_player_dm_send(uuid,uuid,text),public.phone_player_dm_monitor(uuid) from public,anon,authenticated;
grant execute on function public.phone_player_dm_mode(uuid),public.phone_player_dm_set_mode(uuid,text),public.phone_player_dm_contacts(uuid),public.phone_player_dm_history(uuid,uuid),public.phone_player_dm_send(uuid,uuid,text),public.phone_player_dm_monitor(uuid) to authenticated;
