import { applySupplyResponse, supplyActions } from "../warehouse-flow.mjs";

// One route per mutation. Database authorization and retry IDs remain authoritative.
const payloadRoutes = new Map([
  ["pos_category_save", "pos_menu_category_save"],
  ["product_variants_save", "pos_product_variants_save"],
  ["payment_settings_save", "pos_payment_settings_save"],
  ["receipt_batch", "pos_receive_shipment"],
]);
const actionRoutes = new Map([
  ["expense_funding", "pos_warehouse_mutate"],
  ["cash_deposit_save", "pos_cash_deposit_mutate"],
  ["cash_deposit_void", "pos_cash_deposit_mutate"],
  ["cashier_shift_open", "pos_cashier_shift_mutate"],
  ["cashier_shift_close", "pos_cashier_shift_mutate"],
]);

export async function commitMutation(state, action, payload, request) {
  const supply = supplyActions.has(action);
  const payloadOnly = payloadRoutes.has(action);
  const rpc = supply
    ? "pos_warehouse_mutate"
    : payloadRoutes.get(action) || actionRoutes.get(action) || "pos_mutate_027";
  const response = await request(
    "/rest/v1/rpc/" + rpc,
    payloadOnly ? { payload } : { action, payload },
  );
  return supply ? applySupplyResponse(state, response) : response;
}
