-- Return the active map name without changing shared display visibility filters.
-- Include enemy status only for markers already authorized by the shared display's visibility filters.
-- Replaces the shared-display RPC without changing permissions or revealing hidden enemies.
create or replace function public.get_shared_tactical_feed(p_token uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_campaign uuid; v_session public.combat_map_sessions%rowtype; v_layout jsonb; v_units jsonb; v_map_name text;
begin
 select campaign_id into v_campaign from public.tactical_shared_displays where token=p_token;
 if v_campaign is null then raise exception 'Invalid display link'; end if;
 select * into v_session from public.combat_map_sessions where campaign_id=v_campaign and broadcasting=true;
 if not found then return jsonb_build_object('broadcasting',false); end if;
 select name, layout into v_map_name, v_layout from public.combat_maps where id=v_session.map_id and campaign_id=v_campaign;
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
  'status',case when u.value->>'type'='enemy' and u.value->>'status' in ('normal','unconscious','dead') then u.value->>'status' else 'normal' end,
  'visible',case when v_session.reveal_mode='manual' then coalesce(u.value->'manualReveal'->>'tactical','hidden')='revealed' else coalesce((u.value->>'visible')::boolean,false) end,
  'manualReveal',case when v_session.reveal_mode='manual' then coalesce(u.value->'manualReveal','{}'::jsonb) else '{}'::jsonb end,
  'layers',coalesce(v_layout->'layerVisibility'->(u.value->>'key'),'{}'::jsonb)
 )), '[]'::jsonb) into v_units
 from jsonb_array_elements(coalesce(v_session.units,'[]'::jsonb)) u
 where u.value->>'type'='player'
    or (u.value->>'type' in ('enemy','target','objective')
        and (case when v_session.reveal_mode='manual'
          then coalesce(u.value->'manualReveal'->>'tactical','hidden')='revealed'
          else coalesce((u.value->>'visible')::boolean,false) end)
        and (
         v_session.visibility_mode='full'
         or exists (
          select 1 from jsonb_array_elements(v_session.units) p
          where p.value->>'type'='player'
           and (v_session.visibility_mode<>'dark'
            or power((p.value->>'x')::numeric-(u.value->>'x')::numeric,2)
             +power((p.value->>'y')::numeric-(u.value->>'y')::numeric,2)
             <=power(greatest(1,least(8,v_session.visibility_radius)),2))
           and not exists (
            select 1 from generate_series(0,
             greatest(abs((p.value->>'x')::integer-(u.value->>'x')::integer),
                      abs((p.value->>'y')::integer-(u.value->>'y')::integer))*4) as gs(step)
            join lateral (
             select floor((p.value->>'x')::numeric+0.5+
               ((u.value->>'x')::numeric-(p.value->>'x')::numeric)
               *step/greatest(1,greatest(abs((p.value->>'x')::integer-(u.value->>'x')::integer),
                      abs((p.value->>'y')::integer-(u.value->>'y')::integer))*4))::integer cx,
                    floor((p.value->>'y')::numeric+0.5+
               ((u.value->>'y')::numeric-(p.value->>'y')::numeric)
               *step/greatest(1,greatest(abs((p.value->>'x')::integer-(u.value->>'x')::integer),
                      abs((p.value->>'y')::integer-(u.value->>'y')::integer))*4))::integer cy
            ) pos on true
            where exists (
             select 1 from jsonb_array_elements(coalesce(v_layout->'objects','[]'::jsonb)) wall
             where (wall.value->>'type'='wall' and (wall.value->>'x')::integer=pos.cx and (wall.value->>'y')::integer=pos.cy)
              or (wall.value->>'type'='pillar' and pos.cx between (wall.value->>'x')::integer and (wall.value->>'x')::integer+1
                 and pos.cy between (wall.value->>'y')::integer and (wall.value->>'y')::integer+1)
            )
           )
         )
        ));
 return jsonb_build_object('broadcasting',true,'mapName',v_map_name,'layout',v_layout,'units',v_units,
  'visibilityMode',v_session.visibility_mode,'visibilityRadius',v_session.visibility_radius,
  'revealMode',v_session.reveal_mode);
end $$;
revoke all on function public.get_shared_tactical_feed(uuid) from public,anon,authenticated;
grant execute on function public.get_shared_tactical_feed(uuid) to anon,authenticated;
