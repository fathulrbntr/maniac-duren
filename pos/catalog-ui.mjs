import {inventoryPanel} from "./inventory-ui.mjs?v=45";
export function catalogPanel(products,filter={},state={},store=""){return inventoryPanel({...state,products},store,filter,"products");}
export {productDialog} from "./product-dialog.mjs?v=45";
