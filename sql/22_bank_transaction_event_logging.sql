-- 22 - Bank Transaction Event Logging
-- Run in Supabase SQL Editor after campaign_events.sql and
-- campaign_events_audience_migration.sql.
-- Keeps the existing RPC signatures and validates/logs in the same transaction.
-- Existing function ownership, grants, and security settings are not intentionally changed.

create or replace function public.grant_money(character_id uuid, grant_amount bigint)
returns void
language plpgsql
as $function$
declare
    v_campaign_id uuid;
begin
    if grant_amount is null or grant_amount <= 0 then
        raise exception 'Amount must be positive';
    end if;

    update public.characters as c
    set balance = c.balance + grant_amount
    where c.id = character_id
      and exists (
          select 1
          from public.campaigns as campaign
          where campaign.id = c.campaign_id
            and campaign.gm_id = (select auth.uid())
      )
    returning c.campaign_id into v_campaign_id;

    if not found then
        raise exception 'Character not found or not authorized';
    end if;

    insert into public.campaign_events (campaign_id, character_id, audience, category, message)
    values (v_campaign_id, character_id, 'character', 'system', 'RECEIVED ' || grant_amount || ' E$');
end;
$function$;

create or replace function public.withdraw_money(p_character_id uuid, p_amount bigint)
returns void
language plpgsql
as $function$
declare
    v_balance bigint;
    v_campaign_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if p_amount is null or p_amount <= 0 then
        raise exception 'Amount must be a positive whole number';
    end if;

    select ch.balance, ch.campaign_id into v_balance, v_campaign_id
    from public.characters ch
    join public.campaigns ca on ca.id = ch.campaign_id
    where ch.id = p_character_id and ca.gm_id = auth.uid()
    for update of ch;

    if not found then
        raise exception 'Character not found or access denied';
    end if;

    if v_balance < p_amount then
        raise exception 'Insufficient funds';
    end if;

    update public.characters
    set balance = balance - p_amount
    where id = p_character_id;

    insert into public.campaign_events (campaign_id, character_id, audience, category, message)
    values (v_campaign_id, p_character_id, 'character', 'system', 'DEDUCTED ' || p_amount || ' E$');
end;
$function$;

create or replace function public.transfer_money(sender_id uuid, recipient_id uuid, transfer_amount bigint)
returns void
language plpgsql
as $function$
declare
    sender_balance bigint;
    v_campaign_id uuid;
    v_sender_name text;
    v_recipient_name text;
begin
    if transfer_amount is null or transfer_amount <= 0 then
        raise exception 'Transfer amount must be positive';
    end if;

    if sender_id is null
       or recipient_id is null
       or sender_id = recipient_id then
        raise exception 'Invalid sender or recipient';
    end if;

    if not exists (
        select 1
        from public.characters sender
        join public.characters recipient
          on sender.campaign_id = recipient.campaign_id
        join public.campaigns campaign
          on campaign.id = sender.campaign_id
        where sender.id = sender_id
          and recipient.id = recipient_id
          and campaign.gm_id = (select auth.uid())
    ) then
        raise exception 'Transfer not authorized';
    end if;

    perform 1
    from public.characters
    where id in (sender_id, recipient_id)
    order by id
    for update;

    select balance, campaign_id, name
    into sender_balance, v_campaign_id, v_sender_name
    from public.characters
    where id = sender_id;

    if sender_balance < transfer_amount then
        raise exception 'Insufficient funds';
    end if;

    select name into v_recipient_name
    from public.characters
    where id = recipient_id;

    update public.characters
    set balance = balance - transfer_amount
    where id = sender_id;

    update public.characters
    set balance = balance + transfer_amount
    where id = recipient_id;

    insert into public.campaign_events (campaign_id, character_id, audience, category, message)
    values
      (v_campaign_id, sender_id, 'character', 'system', 'SENT ' || transfer_amount || ' E$ TO ' || v_recipient_name),
      (v_campaign_id, recipient_id, 'character', 'system', 'RECEIVED ' || transfer_amount || ' E$ FROM ' || v_sender_name);
end;
$function$;
