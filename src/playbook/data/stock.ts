// A product's stock (pb_products.in_stock), set by hand on the product page.
// The server saves it and sends the listings already on Shopify again
// (set_stock, supabase/functions/pb-products/stock.ts); the importer sets the
// same field from the source store on every run (import/stock.ts).
import { supabase } from '../../lib/supabase';
import { logPbActivity as logActivity } from './listings';
import { pbCall } from './pbFunctions';

/** In stock / out of stock, saved at once; `resent` listings on Shopify follow within a few minutes.
 *  Not "kept": the next import from the product's store sets it from that store. */
export const setStock = (productId: string, inStock: boolean) => pbCall<{ resent: number }>('set_stock', { product_id: productId, in_stock: inStock });

/** Take away the "temporarily out of stock" note a vendor's notice left (it never changed anything on the websites). */
export async function clearTempOut(productId: string) {
  const { error } = await supabase.from('pb_products').update({ temp_out_at: null }).eq('id', productId);
  if (error) throw error;
  logActivity({ product_id: productId, action: 'stock', details: { temporary: false } });
}
