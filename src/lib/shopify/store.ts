import { shopifyGql } from "./admin";

export type StoreCollection = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  imageUrl: string | null;
  templateSuffix: string | null;
  productsCount: number;
  /** Tag values of a smart collection's "product tag is …" rules. Empty for manual collections. */
  tagRules: string[];
  smart: boolean;
};

export type StoreProduct = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  totalInventory: number | null;
  imageUrl: string | null;
  variantId: string | null;
  price: string | null;
  sku: string | null;
  collectionIds: string[];
};

const COLLECTIONS = `query($after: String) {
  collections(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle descriptionHtml templateSuffix
      image { url }
      productsCount { count }
      sources { ... on CollectionConditionsSource { inclusion { conditions { __typename ... on CollectionSourceInclusionConditionProductTag { values } } } } }
    }
  }
}`;

const PRODUCT_FIELDS = `
  id title handle vendor productType tags status totalInventory
  featuredMedia { preview { image { url } } }
  variants(first: 1) { nodes { id price sku } }
  collections(first: 10) { nodes { id } }
`;

type Page<N> = { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: N[] };

async function all<N>(query: string, key: string): Promise<N[]> {
  const out: N[] = [];
  let after: string | null = null;
  for (let i = 0; i < 100; i++) {
    const data: Record<string, Page<N>> = await shopifyGql<Record<string, Page<N>>>(query, { after });
    const page: Page<N> = data[key];
    out.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  return out;
}

type RawCollection = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  templateSuffix: string | null;
  image: { url: string } | null;
  productsCount: { count: number } | null;
  sources: { inclusion?: { conditions: { __typename: string; values?: string[] }[] } }[];
};

type RawProduct = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  totalInventory: number | null;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  variants: { nodes: { id: string; price: string; sku: string | null }[] };
  collections: { nodes: { id: string }[] };
};

export async function loadCollections(): Promise<StoreCollection[]> {
  const raw = await all<RawCollection>(COLLECTIONS, "collections");
  return raw.map((c) => {
    const conditions = c.sources.flatMap((s) => s.inclusion?.conditions ?? []);
    return {
      id: c.id,
      title: c.title,
      handle: c.handle,
      descriptionHtml: c.descriptionHtml ?? "",
      imageUrl: c.image?.url ?? null,
      templateSuffix: c.templateSuffix,
      productsCount: c.productsCount?.count ?? 0,
      tagRules: conditions.flatMap((x) => x.values ?? []),
      smart: conditions.length > 0,
    };
  });
}

function toProduct(p: RawProduct): StoreProduct {
  const v = p.variants.nodes[0];
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    vendor: p.vendor,
    productType: p.productType,
    tags: p.tags,
    status: p.status,
    totalInventory: p.totalInventory,
    imageUrl: p.featuredMedia?.preview?.image?.url ?? null,
    variantId: v?.id ?? null,
    price: v?.price ?? null,
    sku: v?.sku ?? null,
    collectionIds: p.collections.nodes.map((c) => c.id),
  };
}

/** Every product's id, handle, title and vendor: cheap, for matching and picking free handles. */
export async function loadProductIndex(): Promise<{ id: string; handle: string; title: string; vendor: string }[]> {
  return all<{ id: string; handle: string; title: string; vendor: string }>(
    `query($after: String) { products(first: 250, after: $after) { pageInfo { hasNextPage endCursor } nodes { id handle title vendor } } }`,
    "products",
  );
}

/** Full details for these products (missing ones are left out). */
export async function loadProductsByIds(ids: string[]): Promise<StoreProduct[]> {
  const out: StoreProduct[] = [];
  const unique = [...new Set(ids.filter((id) => id.startsWith("gid://shopify/Product/")))];
  for (let i = 0; i < unique.length; i += 40) {
    const data = await shopifyGql<{ nodes: (RawProduct | null)[] }>(`query($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { ${PRODUCT_FIELDS} } } }`, { ids: unique.slice(i, i + 40) });
    for (const n of data.nodes) if (n && n.id) out.push(toProduct(n));
  }
  return out;
}

/** Every SKU on the store (all variants), for picking the next ART number. */
export async function loadSkus(): Promise<string[]> {
  const raw = await all<{ sku: string | null }>(`query($after: String) { productVariants(first: 250, after: $after) { pageInfo { hasNextPage endCursor } nodes { sku } } }`, "productVariants");
  return raw.map((v) => v.sku ?? "").filter(Boolean);
}

/** Sales channels (Online Store, Point of Sale, Shop, Facebook, Google…) to publish new things to. */
export async function loadPublications(): Promise<string[]> {
  const data = await shopifyGql<{ publications: { nodes: { id: string }[] } }>(`{ publications(first: 25) { nodes { id } } }`);
  return data.publications.nodes.map((p) => p.id);
}

export async function primaryLocation(): Promise<string> {
  const data = await shopifyGql<{ locations: { nodes: { id: string; isActive: boolean }[] } }>(`{ locations(first: 10) { nodes { id isActive } } }`);
  const loc = data.locations.nodes.find((l) => l.isActive) ?? data.locations.nodes[0];
  if (!loc) throw new Error("Shopify has no location to keep stock at.");
  return loc.id;
}
