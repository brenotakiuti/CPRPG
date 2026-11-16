import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
export type InstalledCyberware = { id: string; item_id: string | null; name: string; description: string | null; image_url: string | null; position_id: string };
export type PlayerCyberwareData = { installed: InstalledCyberware[]; loading: boolean; error: string };
export function usePlayerCyberware(characterId: string | null): PlayerCyberwareData {
 const [installed,setInstalled]=useState<InstalledCyberware[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const generation=useRef(0);
 const inFlight=useRef(false);
 const pending=useRef(false);
 const refresh=useCallback(async()=>{
  if(!characterId)return;
  if(inFlight.current){pending.current=true;return;}
  inFlight.current=true;
  const version=generation.current;
  do {
   pending.current=false;
   const {data,error:readError}=await supabase.from('character_cyberware').select('id,item_id,name,description,image_url,position_id').eq('character_id',characterId).is('removed_at',null).order('installed_at',{ascending:false});
   if(version!==generation.current)break;
   if(!pending.current){
    if(readError)setError(readError.message);
    else{setInstalled((data??[]) as InstalledCyberware[]);setError('');}
    setLoading(false);
   }
  }while(pending.current&&version===generation.current);
  if(version===generation.current)inFlight.current=false;
 },[characterId]);
 useEffect(()=>{
  ++generation.current;inFlight.current=false;pending.current=false;setInstalled([]);setLoading(true);setError('');
  if(!characterId){setLoading(false);return;}
  const channel=supabase.channel('player-cyberware-'+characterId).on('postgres_changes',{event:'*',schema:'public',table:'character_cyberware',filter:'character_id=eq.'+characterId},()=>{void refresh();}).subscribe();
  void refresh();
  return()=>{++generation.current;inFlight.current=false;pending.current=false;void supabase.removeChannel(channel);};
 },[characterId,refresh]);
 return{installed,loading,error};
}
