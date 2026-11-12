import { useEffect, useMemo, useState } from 'react';
import { Crosshair, FileText, Package, Search } from 'lucide-react';
import { supabase } from './supabase';
import './ItemCatalog.css';
import { ArtworkZoomButton } from './ArtworkViewer';

type Item = { id:string; name:string; description:string|null; category:string; rarity:string; price:number; properties:Record<string,unknown>|null };
const str=(v:unknown)=>typeof v==='string'&&v?v:'—';
const sub=(x:Item)=>str(x.properties?.weapon_class??x.properties?.subtype);
export default function ItemCatalog(){
 const [descriptionOpen,setDescriptionOpen]=useState(false);
 const savedCatalog = (() => { try { return JSON.parse(sessionStorage.getItem('gm-item-catalog') || '{}'); } catch { return {}; } })();
 const [items,setItems]=useState<Item[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selectedId,setSelectedId]=useState(savedCatalog.selectedId || ''),[query,setQuery]=useState(savedCatalog.query || ''),[category,setCategory]=useState(savedCatalog.category || 'all'),[sort,setSort]=useState(savedCatalog.sort || 'name');
 useEffect(()=>{let active=true;void (async()=>{const {data,error}=await supabase.from('items').select('id,name,description,category,rarity,price,properties').order('name');if(active){setItems((data??[]) as Item[]);setError(error?.message??'');setLoading(false)}})();return()=>{active=false}},[]);
 useEffect(()=>{sessionStorage.setItem('gm-item-catalog',JSON.stringify({selectedId,query,category,sort}));},[selectedId,query,category,sort]);
 const categories=[...new Set(items.map(x=>x.category))].sort();
 const visible=useMemo(()=>items.filter(x=>(category==='all'||x.category===category)&&`${x.name} ${x.category} ${sub(x)}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==='subtype'?sub(a).localeCompare(sub(b)):sort==='rarity'?a.rarity.localeCompare(b.rarity):sort==='price'?a.price-b.price:a.name.localeCompare(b.name)),[items,category,query,sort]);
 const selected=visible.find(x=>x.id===selectedId)??visible[0],p=selected?.properties??{};
 const nested=(key:string):Record<string,unknown>=>{const value=p[key];return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}};
 const attack=nested('attack'),magazine=nested('magazine'),delivery=nested('delivery');
 const number=(value:unknown,legacy?:unknown)=>typeof value==='number'?String(value):typeof legacy==='number'?String(legacy):'—';
 const stats=[
  ['Attack dice',number(attack.dice,p.rate_of_fire)==='—'?'—':number(attack.dice,p.rate_of_fire)+'d6'],
  ['Accuracy',number(attack.accuracy_threshold,p.accuracy_threshold)==='—'?'—':number(attack.accuracy_threshold,p.accuracy_threshold)+'+'],
  ['Damage',number(attack.damage_per_success,p.damage_blocks)],
  ['Action cost',number(attack.action_cost)],
  ['Magazine',number(magazine.capacity)],
  ['Reload cost',number(magazine.reload_cost)],
  ['Delivery',str(delivery.method)==='—'?'—':str(delivery.method)],
  ['Silent',typeof delivery.silent==='boolean'?(delivery.silent?'Yes':'No'):'—']
 ];
 return <section className="item-catalog">
 <header className="item-catalog-header"><div><h2>Item Catalog</h2><p>Browse global and GM items</p></div><span>{visible.length} items</span></header>
 <div className="item-catalog-controls"><label className="item-catalog-search"><Search size={17}/><input aria-label="Search items" placeholder="Search items..." value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter by type" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All types</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select><select aria-label="Sort items" value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Sort: Name</option><option value="subtype">Sort: Subtype</option><option value="rarity">Sort: Rarity</option><option value="price">Sort: Price</option></select></div>
 {error&&<p role="alert" className="item-catalog-error">Unable to load items: {error}</p>}
 {loading?<p>Loading items...</p>:<div className="item-catalog-layout"><div className="item-catalog-table-wrap"><table className="item-catalog-table"><thead><tr><th>Item</th><th>Type</th><th>Rarity</th><th>Price</th><th>Subtype</th></tr></thead><tbody>{visible.map(x=><tr key={x.id} className={selected?.id===x.id?'selected':''} onClick={()=>{setSelectedId(x.id);setDescriptionOpen(false)}}><td><button type="button" className="item-catalog-item" onClick={()=>setSelectedId(x.id)}>{x.category==='Weapon'?<Crosshair size={17}/>:<Package size={17}/>}<span>{x.name}</span></button></td><td>{x.category}</td><td>{x.rarity}</td><td>{x.price===0?'—':`${x.price} E$`}</td><td>{sub(x)}</td></tr>)}</tbody></table>{!visible.length&&<p className="item-catalog-empty">No matching items</p>}</div><aside className="item-catalog-detail">{selected?<><div className="item-catalog-detail-head"><h3>{selected.name}</h3><div className="item-catalog-detail-actions"><div className="item-catalog-description-anchor"><button type="button" className="item-catalog-description-button" aria-expanded={descriptionOpen} onClick={()=>setDescriptionOpen(!descriptionOpen)}><FileText size={14}/>Description</button>{descriptionOpen&&<div className="item-catalog-description-popover" role="dialog" aria-label={`${selected.name} description`}><div className="item-catalog-popover-head"><strong>{selected.name}</strong><button type="button" aria-label="Close description" onClick={()=>setDescriptionOpen(false)}>×</button></div><p>{selected.description||'No description'}</p></div>}</div><span className="item-catalog-rarity">{selected.rarity}</span></div></div><p className="item-catalog-detail-subtype">{selected.category} / {sub(selected)}{p.weapon_type?` / ${str(p.weapon_type)}`:''}</p><div className="item-catalog-art" style={{position:'relative'}}>{typeof p.image==='string'?<><img src={p.image} alt={selected.name}/><ArtworkZoomButton src={p.image} alt={selected.name}/></>:<Package size={48}/>}</div>{selected.category==='Weapon'&&<section className="item-catalog-weapon-stats" aria-label="Weapon Stats"><h4>Weapon Stats</h4><dl>{stats.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>}</>:<p>Select an item</p>}</aside></div>}
 </section>;
}
