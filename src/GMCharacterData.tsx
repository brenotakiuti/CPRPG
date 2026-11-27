import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export type SharedInventory = { id:string; character_id:string; item_id:string; quantity:number; equipped_slot:string|null };
export type SharedCyberware = { id:string; character_id:string; item_id:string|null; name:string; description:string|null; position_id:string; image_url:string|null };
export type SharedItem = { id:string; name:string; category:string; rarity:string; description:string|null };
type Data = { inventory:SharedInventory[]; cyberware:SharedCyberware[]; items:SharedItem[]; loading:boolean; error:string; refresh:()=>Promise<void> };
const Context = createContext<Data|null>(null);
export function useGMCharacterData() { const value=useContext(Context); if(!value) throw new Error('GM character data provider missing'); return value; }
export function GMCharacterDataProvider({campaignId,children}:{campaignId:string;children:ReactNode}) {
 const [inventory,setInventory]=useState<SharedInventory[]>([]);
 const [cyberware,setCyberware]=useState<SharedCyberware[]>([]);
 const [items,setItems]=useState<SharedItem[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
   const characters=await supabase.from('characters').select('id').eq('campaign_id',campaignId);
   if(characters.error){setError(characters.error.message);setLoading(false);return;}
   const ids=(characters.data??[]).map(c=>c.id);
   const [catalog,inv,implants]=await Promise.all([
     supabase.from('items').select('id,name,category,rarity,description'),
     ids.length?supabase.from('character_inventory').select('id,character_id,item_id,quantity,equipped_slot').in('character_id',ids):Promise.resolve({data:[],error:null}),
     ids.length?supabase.from('character_cyberware').select('id,character_id,item_id,name,description,position_id,image_url').in('character_id',ids).is('removed_at',null):Promise.resolve({data:[],error:null})
   ]);
   const failure=catalog.error??inv.error??implants.error;
   if(failure){setError(failure.message);setLoading(false);return;}
   setItems((catalog.data??[]) as SharedItem[]);
   setInventory((inv.data??[]) as SharedInventory[]);
   setCyberware((implants.data??[]) as SharedCyberware[]);
   setError('');setLoading(false);
 },[campaignId]);
 useEffect(()=>{void refresh();const channel=supabase.channel('gm-character-shared-'+campaignId)
  .on('postgres_changes',{event:'*',schema:'public',table:'character_inventory'},()=>{void refresh()})
  .on('postgres_changes',{event:'*',schema:'public',table:'character_cyberware'},()=>{void refresh()})
  .on('postgres_changes',{event:'*',schema:'public',table:'items'},()=>{void refresh()})
  .subscribe();
  return ()=>{void supabase.removeChannel(channel)};
 },[campaignId,refresh]);
 const value=useMemo(()=>({inventory,cyberware,items,loading,error,refresh}),[inventory,cyberware,items,loading,error,refresh]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
