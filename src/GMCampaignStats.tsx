import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export type CampaignStat = { id:string; name:string; description:string; statNumber:number; value:number; maxValue:number };
type Definition = { id:string; name:string; description:string|null; stat_number:number; max_value:number|null };
type StatValue = { character_id:string; stat_id:string; value:number };
type Store = { byCharacter:Record<string,CampaignStat[]>; loading:boolean; error:string; refresh:()=>Promise<void> };
const Context=createContext<Store|null>(null);
export function useGMCampaignStats(){const data=useContext(Context);if(!data)throw new Error('Campaign stats provider missing');return data;}

export function GMCampaignStatsProvider({campaignId,children}:{campaignId:string;children:ReactNode}){
 const [byCharacter,setByCharacter]=useState<Record<string,CampaignStat[]>>({});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  try{
   const [defs,values]=await Promise.all([
    supabase.from('stat_definitions').select('id,name,description,stat_number,max_value,display_order').eq('campaign_id',campaignId).order('display_order').order('stat_number'),
    supabase.from('character_stats').select('character_id,stat_id,value').eq('campaign_id',campaignId)
   ]);
   if(defs.error)throw defs.error;
   if(values.error)throw values.error;
   const definitions=(defs.data??[]) as Definition[];
   const grouped:Record<string,Map<string,number>>={};
   for(const entry of (values.data??[]) as StatValue[]){
    (grouped[entry.character_id]??=new Map()).set(entry.stat_id,Number(entry.value));
   }
   const next:Record<string,CampaignStat[]>={};
   for(const [id,entries] of Object.entries(grouped)){
    next[id]=definitions.filter(def=>entries.has(def.id)).map(def=>({
     id:def.id,name:def.name,description:def.description??'',statNumber:def.stat_number,
     maxValue:def.max_value??20,value:entries.get(def.id)??0
    }));
   }
   setByCharacter(next);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load stats')}
  finally{setLoading(false)}
 },[campaignId]);
 useEffect(()=>{
  setLoading(true);setByCharacter({});void refresh();
  const channel=supabase.channel('gm-campaign-stats-'+campaignId)
   .on('postgres_changes',{event:'*',schema:'public',table:'character_stats'},()=>{void refresh()})
   .on('postgres_changes',{event:'*',schema:'public',table:'stat_definitions'},()=>{void refresh()})
   .subscribe();
  return()=>{void supabase.removeChannel(channel)};
 },[campaignId,refresh]);
 const value=useMemo(()=>({byCharacter,loading,error,refresh}),[byCharacter,loading,error,refresh]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
