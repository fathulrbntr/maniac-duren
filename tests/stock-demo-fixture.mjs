import {emptyState,today,id} from '../pos/core.mjs';
import {defaultPosCategories} from '../pos/pos-categories.mjs';
export const day=today();
export function fixture(){
 const p=(name,itemType,stockUnit,salePrice)=>({id:id(),sku:id(),name,itemType,stockUnit,salePrice,category:itemType==='recipe'?'Dessert':'Minuman',posCategoryIds:[]});
 const fruit={...p('Musang King Fresh','direct','kg_butir',null),category:'Buah',priceKg:90000,pricePiece:180000};
 const group=id(),small={...p('Durpas Bawor 500 gr','finished','pcs',40000),variantGroupId:group,variantGroupName:'Durpas Bawor',variant:'500 gr'},large={...p('Durpas Bawor 1 kg','finished','pcs',75000),variantGroupId:group,variantGroupName:'Durpas Bawor',variant:'1 kg'};
 const water=p('Air mineral','direct','pcs',5000),prep=p('Cendol','prep','g',null),raw=p('Susu','raw','ml',null),menu=p('Es durian','recipe','porsi',20000),otherMenu=p('Es cendol','recipe','porsi',15000),unpriced=p('Coral','finished','kg',null);
 const stores=[{id:id(),name:'Outlet A'},{id:id(),name:'Outlet B'}];
 const state={...emptyState(),stores,products:[fruit,small,large,water,prep,raw,menu,otherMenu,unpriced],posCategories:defaultPosCategories(),posCategoryMembershipVersion:2,access:{master:true,sell:true,kitchen:true,cancel:true},me:{id:id()},employees:[],suppliers:[{id:id(),name:'Supplier asli'}],opsVersion:19,orderStockVersion:11,orderRoutingVersion:13,orders:[{id:id(),status:'queued',lines:[]}],events:[{id:id()}],journal:[{qty:7}],money:[{amount:123}],attendance:[{id:id()}]};
 state.recipes=[{id:id(),version:1,outputId:menu.id,yieldQty:1,ingredients:[{productId:prep.id,qty:30},{productId:raw.id,qty:10}]},{id:id(),version:1,outputId:otherMenu.id,yieldQty:1,ingredients:[{productId:prep.id,qty:20}]}];
 state.unitLots=[{id:id(),storeId:stores[0].id,productId:small.id,date:day,qty:7,unit:'pcs'}];
 state.lots=[{id:id(),storeId:stores[0].id,productId:fruit.id,date:day,kg:4,pieces:2,quality:'ready'}];
 return {state,fruit,small,large,water,prep,raw,menu,otherMenu,unpriced,store:stores[0].id,otherStore:stores[1].id};
}
export const line=(product,qty=1)=>({productId:product.id,qty,price:product.salePrice});
export const order=(store,lines,extra={})=>({id:id(),storeId:store,date:day,lines,payment:'Tunai',paid:lines.reduce((sum,l)=>sum+l.qty*l.price,0),...extra});
export const qty=(s,p,store)=>s.unitLots.filter(l=>l.productId===p.id&&l.storeId===store).reduce((n,l)=>n+l.qty,0);
