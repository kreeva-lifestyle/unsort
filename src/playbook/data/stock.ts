// A product's stock (pb_products.in_stock), set by hand on the product page.
// The server saves it and sends the stock to the stores the product is on sale
// on (set_stock, supabase/functions/pb-products/stock.ts). A vendor's stock-out
// notice changes the same fields (stockNotice.ts); a source website never does.
import { supabase } from '../../lib/supabase';
import { logPbActivity as logActivity } from './listings';
import { pbCall } from './pbFunctions';

/** In stock / out of stock, saved at once. `resent` = the stores it reached straight away; `waiting` = the stores that
 *  could not be reached yet (Playbook keeps trying). Switching it on also ends a vendor's "permanent stock out". */
export const setStock = (productId: string, inStock: boolean) => pbCall<{ resent: number; waiting?: number }>('set_stock', { product_id: productId, in_stock: inStock });

/** Take away the "temporarily out of stock" note a vendor's notice left (it never changed anything on the websites). */
export async function clearTempOut(productId: string) {
  const { error } = await supabase.from('pb_products').update({ temp_out_at: null }).eq('id', productId);
  if (error) throw error;
  logActivity({ product_id: productId, action: 'stock', details: { temporary: false } });
}
