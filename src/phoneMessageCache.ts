// In-memory, session-scoped cache. Never persist private messages to localStorage.
export type CachedMessage={message_id:string;sender_identity_id:string;body:string;created_at:string};
const histories=new Map<string,CachedMessage[]>();
const MAX_CHATS=80;
export const historyKey=(owner:string,kind:'npc'|'player',id:string)=>owner+':'+kind+':'+id;
export function getHistory(key:string):CachedMessage[]|undefined{return histories.get(key)}
export function putHistory(key:string,items:CachedMessage[]):CachedMessage[]{
 const unique=new Map<string,CachedMessage>();
 for(const item of items)unique.set(item.message_id,item);
 const sorted=[...unique.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at));
 histories.delete(key);histories.set(key,sorted);
 if(histories.size>MAX_CHATS)histories.delete(histories.keys().next().value!);
 return sorted;
}
export function appendHistory(key:string,item:CachedMessage):CachedMessage[]{
 return putHistory(key,[...(histories.get(key)??[]),item]);
}
export function replaceHistoryId(key:string,tempId:string,item:CachedMessage):CachedMessage[]{
 return putHistory(key,[...(histories.get(key)??[]).filter(m=>m.message_id!==tempId),item]);
}
export function removeHistoryId(key:string,id:string):CachedMessage[]{
 return putHistory(key,(histories.get(key)??[]).filter(m=>m.message_id!==id));
}
