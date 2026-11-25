-- Anonymous shared Tactical//Feed display. A capability token grants ONLY
-- a filtered read projection and movement of player markers.
create table if not exists public.tactical_shared_displays (
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 token uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now()
);
alter table public.tactical_shared_displays enable row level security;
revoke all on public.tactical_shared_displays from anon, authenticated;
create or replace function public.ensure_tactical_shared_display(p_campaign_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_token uuid;
begin
 if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then
  raise exception 'GM access denied';
 end if;
 insert into public.tactical_shared_displays(campaign_id) values(p_campaign_id)
 on conflict(campaign_id) do nothing;
 select token into v_token from public.tactical_shared_displays where campaign_id=p_campaign_id;
 return v_token;
end $$;
revoke all on function public.ensure_tactical_shared_display(uuid) from public,anon,authenticated;
grant execute on function public.ensure_tactical_shared_display(uuid) to authenticated;

create or replace function public.get_shared_tactical_feed(p_token uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_campaign uuid; v_session public.combat_map_sessions%rowtype; v_layout jsonb; v_units jsonb;
begin
 select campaign_id into v_campaign from public.tactical_shared_displays where token=p_token;
 if v_campaign is null then raise exception 'Invalid display link'; end if;
 select * into v_session from public.combat_map_sessions where campaign_id=v_campaign and broadcasting=true;
 if not found then return jsonb_build_object('broadcasting',false); end if;
 select layout into v_layout from public.combat_maps where id=v_session.map_id and campaign_id=v_campaign;
 if v_layout is null then return jsonb_build_object('broadcasting',false); end if;
 -- Strip editor-only marker placements and marker-layer visibility metadata.
 v_layout:=jsonb_set(v_layout,'{objects}',coalesce((
  select jsonb_agg(o.value) from jsonb_array_elements(coalesce(v_layout->'objects','[]'::jsonb)) o
  where o.value->>'type' not in ('player','enemy','target','poi','objective')
 ),'[]'::jsonb));
 v_layout:=jsonb_set(v_layout,'{layerVisibility}',coalesce((
  select jsonb_object_agg(e.key,e.value)
  from jsonb_each(coalesce(v_layout->'layerVisibility','{}'::jsonb)) e
  where exists(select 1 from jsonb_array_elements(coalesce(v_layout->'groups','[]'::jsonb)) g where g.value->>'id'=e.key)
 ),'{}'::jsonb));
 select coalesce(jsonb_agg(jsonb_build_object(
  'key',u.value->>'key','label',u.value->>'label','type',u.value->>'type',
  'x',u.value->'x','y',u.value->'y','name',u.value->>'name',
  'visible',coalesce((u.value->>'visible')::boolean,true),
  'manualReveal',case when v_session.reveal_mode='manual' then coalesce(u.value->'manualReveal','{}'::jsonb) else '{}'::jsonb end,
  'layers',coalesce(v_layout->'layerVisibility'->(u.value->>'key'),'{}'::jsonb)
 )), '[]'::jsonb) into v_units
 from jsonb_array_elements(coalesce(v_session.units,'[]'::jsonb)) u
 where u.value->>'type'='player'
    or (u.value->>'type' in ('enemy','target','objective')
        and u.value->>'visible'='true'
        and (v_session.reveal_mode<>'manual'
          or coalesce(u.value->'manualReveal'->>'tactical','hidden')='revealed'));
 return jsonb_build_object('broadcasting',true,'layout',v_layout,'units',v_units,
  'visibilityMode',v_session.visibility_mode,'visibilityRadius',v_session.visibility_radius,
  'revealMode',v_session.reveal_mode);
end $$;
revoke all on function public.get_shared_tactical_feed(uuid) from public,anon,authenticated;
grant execute on function public.get_shared_tactical_feed(uuid) to anon,authenticated;

create or replace function public.move_shared_tactical_player(
 p_token uuid,p_marker_key text,p_x integer,p_y integer
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_campaign uuid;v_session public.combat_map_sessions%rowtype;v_layout jsonb;v_idx integer;v_unit jsonb;v_units jsonb;
begin
 select campaign_id into v_campaign from public.tactical_shared_displays where token=p_token;
 if v_campaign is null then raise exception 'Invalid display link'; end if;
 select * into v_session from public.combat_map_sessions where campaign_id=v_campaign for update;
 if not found or not v_session.broadcasting then raise exception 'No active broadcast'; end if;
 select layout into v_layout from public.combat_maps where id=v_session.map_id and campaign_id=v_campaign;
 if p_x is null or p_y is null or p_x<0 or p_y<0 or p_x>=coalesce((v_layout->>'width')::integer,0)
    or p_y>=coalesce((v_layout->>'height')::integer,0) then raise exception 'Invalid destination'; end if;
 select (u.ordinality-1)::integer,u.value into v_idx,v_unit
 from jsonb_array_elements(v_session.units) with ordinality u(value,ordinality)
 where u.value->>'key'=p_marker_key and u.value->>'type'='player';
 if v_idx is null then raise exception 'Only player markers may be moved'; end if;
 v_units:=jsonb_set(v_session.units,array[v_idx::text],
  jsonb_set(jsonb_set(v_unit,'{x}',to_jsonb(p_x)),'{y}',to_jsonb(p_y)));
 update public.combat_map_sessions set units=v_units,updated_at=now() where campaign_id=v_campaign;
 return true;
end $$;
revoke all on function public.move_shared_tactical_player(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.move_shared_tactical_player(uuid,text,integer,integer) to anon,authenticated;
