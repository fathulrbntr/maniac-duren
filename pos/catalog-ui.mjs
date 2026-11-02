import {inventoryPanel} from "./inventory-ui.mjs";
export function catalogPanel(products,filter={},state={},store=""){return inventoryPanel({...state,products},store,filter,"products");}
export {productDialog} from "./product-dialog.mjs";
