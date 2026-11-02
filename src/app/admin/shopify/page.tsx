import { getShopifyCheck } from "@/lib/shopify-check";
import { requireOwner } from "@/lib/team";
import { ShopifyCheck } from "./ShopifyCheck";

export default async function ShopifyPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireOwner();
  const { show } = await searchParams;
  return <ShopifyCheck {...await getShopifyCheck(show)} />;
}
