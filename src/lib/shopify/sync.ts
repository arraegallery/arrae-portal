import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { freshStorageLink, signedImageUrls } from "@/lib/images";
import { nameKeys } from "@/lib/shopify-bios";
import { checkUserErrors, shopifyConfigured, shopifyGql, shopifyMissingSettings } from "./admin";
import { bioHtml, freeHandle, nextSku, priceText, productDescriptionHtml, productTags, sameText, showTag, slugify } from "./format";
import { loadCollections, loadProductIndex, loadProductsByIds, loadPublications, loadSkus, primaryLocation, type StoreCollection, type StoreProduct } from "./store";

/* ------------------------------------------------------------------ reading */

/** Artists who count as accepted: an application or a work Selected for any show. */
async function acceptedArtistIds() {
  const apps = await db.select({ id: s.applications.artistId }).from(s.applications).where(eq(s.applications.status, "Selected"));
  const works = await db
    .select({ id: s.works.artistId })
    .from(s.showWorks)
    .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
    .where(eq(s.showWorks.status, "Selected"));
  return new Set([...apps.map((a) => a.id), ...works.map((w) => w.id)].filter((x): x is string => !!x));
}

function collectionByHandle(cols: StoreCollection[]) {
  return new Map(cols.map((c) => [c.handle, c]));
}

/** An existing Shopify collection that looks like this artist's (same name), for linking. */
function guessCollection(name: string, cols: StoreCollection[]) {
  const keys = new Set(nameKeys(name));
  const hits = cols.filter((c) => !c.smart && (nameKeys(c.title).some((k) => keys.has(k)) || keys.has(c.handle.replace(/-/g, " "))));
  return hits.length === 1 ? hits[0] : null;
}

export type ArtistDiff = "title" | "bio" | "image";

export async function getArtistSync() {
  if (!shopifyConfigured()) return { connected: false as const, missing: shopifyMissingSettings() };
  const [ids, cols] = await Promise.all([acceptedArtistIds(), loadCollections()]);
  const artists = ids.size ? await db.select().from(s.artists).where(inArray(s.artists.id, [...ids])) : [];
  const byHandle = collectionByHandle(cols);
  const usedHandles = new Set(cols.map((c) => c.handle));
  const counts = await db
    .select({ artistId: s.works.artistId, productId: s.works.shopifyProductId })
    .from(s.works)
    .where(and(inArray(s.works.artistId, [...ids].length ? [...ids] : ["-"]), isNotNull(s.works.shopifyProductId)));
  const photos = await signedImageUrls(artists.map((a) => a.photoPath));

  const rows = artists.map((a, i) => {
    const col = a.shopifyCollectionHandle ? byHandle.get(a.shopifyCollectionHandle) ?? null : null;
    const proposedHandle = freeHandle(a.name, usedHandles);
    const diffs: ArtistDiff[] = [];
    if (col) {
      if (col.title.trim() !== a.name.trim()) diffs.push("title");
      if (a.arraeBio?.trim() && !sameText(col.descriptionHtml, a.arraeBio)) diffs.push("bio");
      if (!col.imageUrl && a.photoPath) diffs.push("image");
    }
    const state: "new" | "missing" | "differs" | "matches" = !a.shopifyCollectionHandle ? "new" : !col ? "missing" : diffs.length ? "differs" : "matches";
    return {
      id: a.id,
      name: a.name,
      bio: a.arraeBio?.trim() || "",
      photo: photos[i],
      hasPhoto: !!a.photoPath,
      handle: a.shopifyCollectionHandle,
      proposedHandle,
      suggestion: !col ? guessCollection(a.name, cols) : null,
      collection: col ? { id: col.id, title: col.title, handle: col.handle, bio: col.descriptionHtml, image: col.imageUrl, products: col.productsCount } : null,
      worksOnShopify: counts.filter((c) => c.artistId === a.id).length,
      diffs,
      state,
    };
  });
  rows.sort((x, y) => x.name.localeCompare(y.name));
  return { connected: true as const, rows };
}

export type WorkDiff = "title" | "price" | "vendor" | "collection" | "showTag";

export async function getWorkSync(showId: string | undefined) {
  const shows = await db.select({ id: s.shows.id, name: s.shows.name, type: s.shows.type, opensOn: s.shows.opensOn }).from(s.shows).orderBy(desc(s.shows.opensOn));
  const show = shows.find((x) => x.id === showId) ?? shows.find((x) => x.id === "volume-iv") ?? shows[0];
  if (!shopifyConfigured()) return { connected: false as const, missing: shopifyMissingSettings(), shows, show };
  if (!show) return { connected: true as const, shows, show: null, showCollection: null, tag: "", rows: [] };

  const tag = showTag(show);
  const rows = await db
    .select({ sw: s.showWorks, work: s.works, artist: s.artists })
    .from(s.showWorks)
    .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
    .leftJoin(s.artists, eq(s.artists.id, s.works.artistId))
    .where(and(eq(s.showWorks.showId, show.id), eq(s.showWorks.status, "Selected")));
  const ids = rows.map((r) => r.work.id);
  const images = ids.length ? await db.select().from(s.workImages).where(inArray(s.workImages.workId, ids)) : [];
  const mains = ids.map((id) => images.filter((i) => i.workId === id).sort((a, b) => a.position - b.position)[0] ?? null);
  const thumbs = await signedImageUrls(mains.map((m) => m?.thumbPath ?? m?.storagePath ?? null));

  const cols = await loadCollections();
  const index = await loadProductIndex();
  const showCollection = findShowCollection(show, cols);
  const byHandle = collectionByHandle(cols);
  const indexByHandle = new Map(index.map((p) => [p.handle, p]));
  const titleKey = (title: string, vendor: string) => `${slugify(title)}|${slugify(vendor)}`;
  const indexByTitle = new Map(index.map((p) => [titleKey(p.title, p.vendor), p]));
  // A product that may be this work although the portal doesn't link them: same handle, or same title and artist.
  const guessFor = (w: typeof s.works.$inferSelect, a: typeof s.artists.$inferSelect | null) =>
    (w.shopifyHandle ? indexByHandle.get(w.shopifyHandle) : undefined) ??
    indexByHandle.get(slugify(`${w.title}-${a?.shopifyCollectionHandle ?? ""}`)) ??
    (a ? indexByTitle.get(titleKey(w.title, a.name)) : undefined);
  // Full details only for the products these works point at (or might match).
  const wanted = rows.flatMap((r) => [r.work.shopifyProductId ?? "", guessFor(r.work, r.artist)?.id ?? ""]);
  const details = await loadProductsByIds(wanted);
  const productById = new Map(details.map((p) => [p.id, p]));
  const linkedIds = new Set((await db.select({ id: s.works.shopifyProductId }).from(s.works).where(isNotNull(s.works.shopifyProductId))).map((x) => x.id));

  const out = rows.map((r, i) => {
    const w = r.work;
    const a = r.artist;
    const artistCol = a?.shopifyCollectionHandle ? byHandle.get(a.shopifyCollectionHandle) ?? null : null;
    const product: StoreProduct | null = (w.shopifyProductId && productById.get(w.shopifyProductId)) || null;
    // Not linked yet, but a product with the handle the work used to have (or the one we'd give it) may already be there.
    const guessId = !product ? guessFor(w, a)?.id : undefined;
    const guess = guessId ? productById.get(guessId) ?? null : null;
    // A product another work already points at isn't a match.
    const match = guess && !linkedIds.has(guess.id) ? guess : null;
    const problems: string[] = [];
    if (!a) problems.push("No artist");
    else if (!a.shopifyCollectionHandle) problems.push("Artist has no Shopify collection yet");
    else if (!artistCol) problems.push("Artist's collection isn't on Shopify");
    if (w.priceUsd === null) problems.push("No price");
    if (!mains[i]?.storagePath) problems.push("No photo");
    if (w.soldAt) problems.push("Sold");
    const diffs: WorkDiff[] = [];
    if (product && a) {
      if (product.title.trim() !== w.title.trim()) diffs.push("title");
      if (priceText(product.price) !== priceText(w.priceUsd)) diffs.push("price");
      if (product.vendor.trim() !== a.name.trim()) diffs.push("vendor");
      if (artistCol && !product.collectionIds.includes(artistCol.id)) diffs.push("collection");
      if (!showMembership(product, tag, showCollection)) diffs.push("showTag");
    }
    const state: "new" | "blocked" | "link" | "differs" | "matches" = product ? (diffs.length ? "differs" : "matches") : match ? "link" : problems.length ? "blocked" : "new";
    return {
      id: w.id,
      title: w.title,
      year: w.year,
      medium: w.medium,
      category: w.category,
      price: w.priceUsd === null ? null : Number(w.priceUsd),
      width: w.width,
      height: w.height,
      depth: w.depth,
      unit: w.unit,
      sizeAsEntered: w.sizeAsEntered,
      description: w.description,
      image: mains[i] ? { id: mains[i]!.id, thumb: thumbs[i], full: null as string | null, w: mains[i]!.widthPx, h: mains[i]!.heightPx } : null,
      artist: a ? { id: a.id, name: a.name, handle: a.shopifyCollectionHandle, collectionOnShopify: !!artistCol } : null,
      product: product
        ? { id: product.id, title: product.title, handle: product.handle, price: product.price, vendor: product.vendor, status: product.status, image: product.imageUrl, sku: product.sku, stock: product.totalInventory }
        : null,
      match: match ? { id: match.id, title: match.title, handle: match.handle, price: match.price, vendor: match.vendor, image: match.imageUrl } : null,
      problems: problems.filter((p) => !(product && p === "Sold")),
      diffs,
      state,
      preview: a && !product ? previewProduct(w, a.name, a.shopifyCollectionHandle ?? slugify(a.name), tag) : null,
    };
  });
  out.sort((x, y) => (x.artist?.name ?? "").localeCompare(y.artist?.name ?? "") || x.title.localeCompare(y.title));
  return {
    connected: true as const,
    shows,
    show,
    tag,
    showCollection: showCollection ? { id: showCollection.id, title: showCollection.title, handle: showCollection.handle, smart: showCollection.smart, products: showCollection.productsCount } : null,
    rows: out,
  };
}

function findShowCollection(show: { id: string; name: string; type: string }, cols: StoreCollection[]) {
  const tag = showTag(show).toLowerCase();
  return (
    cols.find((c) => c.tagRules.some((t) => t.toLowerCase() === tag)) ??
    cols.find((c) => c.handle === show.id) ??
    cols.find((c) => c.title.trim().toLowerCase() === show.name.trim().toLowerCase()) ??
    null
  );
}

function showMembership(p: StoreProduct, tag: string, col: StoreCollection | null) {
  if (col && !col.smart) return p.collectionIds.includes(col.id);
  return p.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
}

function previewProduct(w: typeof s.works.$inferSelect, artistName: string, artistHandle: string, tag: string) {
  return {
    title: w.title,
    vendor: artistName,
    productType: w.category || "",
    tags: productTags(w, artistHandle, [tag]),
    price: priceText(w.priceUsd),
    descriptionHtml: productDescriptionHtml(w),
  };
}

/* ------------------------------------------------------------------ writing */

async function log(artistId: string | null, workId: string | null, body: string, actor: string, showId: string | null = null) {
  await db.insert(s.activity).values({ artistId, workId, showId, kind: "shopify", body, actor });
}

async function publishAll(id: string) {
  const pubs = await loadPublications();
  if (!pubs.length) return;
  const data = await shopifyGql<{ publishablePublish: { userErrors: { field: string[] | null; message: string }[] } }>(
    `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
    { id, input: pubs.map((publicationId) => ({ publicationId })) },
  );
  checkUserErrors(data.publishablePublish, "Publishing to sales channels");
}

async function artistOrThrow(artistId: string) {
  const [a] = await db.select().from(s.artists).where(eq(s.artists.id, artistId));
  if (!a) throw new Error("That artist isn't in the portal.");
  return a;
}

/** Creates the artist's collection on Shopify, the way ARRAE's other artist collections are set up. */
export async function createArtistCollection(artistId: string, handleWanted: string, actor: string) {
  const a = await artistOrThrow(artistId);
  if (!a.arraeBio?.trim()) throw new Error(`${a.name} has no ARRAE bio yet. Add one on their profile first.`);
  const cols = await loadCollections();
  if (a.shopifyCollectionHandle && cols.some((c) => c.handle === a.shopifyCollectionHandle)) throw new Error(`${a.name} already has a collection (${a.shopifyCollectionHandle}).`);
  const handle = slugify(handleWanted || a.name);
  if (!handle) throw new Error("The web address (handle) can't be empty.");
  if (cols.some((c) => c.handle === handle)) throw new Error(`Shopify already has a collection at /collections/${handle}. Link to it instead, or pick another address.`);
  const image = a.photoPath ? await freshStorageLink(a.photoPath, 24 * 3600) : null;
  const data = await shopifyGql<{ collectionCreate: { collection: { id: string; handle: string } | null; userErrors: { field: string[] | null; message: string }[] } }>(
    `mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id handle } userErrors { field message } } }`,
    {
      input: {
        title: a.name,
        handle,
        descriptionHtml: bioHtml(a.arraeBio),
        templateSuffix: "artists",
        sortOrder: "BEST_SELLING",
        ...(image ? { image: { src: image, altText: a.name } } : {}),
      },
    },
  );
  checkUserErrors(data.collectionCreate, "Creating the collection");
  const col = data.collectionCreate.collection!;
  await db.update(s.artists).set({ shopifyCollectionHandle: col.handle }).where(eq(s.artists.id, a.id));
  await publishAll(col.id);
  await log(a.id, null, `Created Shopify collection /collections/${col.handle}`, actor);
  return col.handle;
}

/** Links an artist to a collection that's already on Shopify (no change on Shopify). */
export async function linkArtistCollection(artistId: string, handle: string, actor: string) {
  const a = await artistOrThrow(artistId);
  const cols = await loadCollections();
  const col = cols.find((c) => c.handle === handle);
  if (!col) throw new Error(`No collection at /collections/${handle} on Shopify.`);
  if (col.smart) throw new Error(`/collections/${handle} is an automatic collection, not an artist collection.`);
  await db.update(s.artists).set({ shopifyCollectionHandle: col.handle }).where(eq(s.artists.id, a.id));
  await log(a.id, null, `Linked to Shopify collection /collections/${col.handle}`, actor);
}

/** Sends the portal's name, ARRAE bio and/or photo to the artist's existing collection. */
export async function updateArtistCollection(artistId: string, fields: ArtistDiff[], actor: string) {
  const a = await artistOrThrow(artistId);
  if (!a.shopifyCollectionHandle) throw new Error(`${a.name} has no collection yet.`);
  const col = (await loadCollections()).find((c) => c.handle === a.shopifyCollectionHandle);
  if (!col) throw new Error(`/collections/${a.shopifyCollectionHandle} isn't on Shopify any more.`);
  const input: Record<string, unknown> = { id: col.id };
  if (fields.includes("title")) input.title = a.name;
  if (fields.includes("bio")) {
    if (!a.arraeBio?.trim()) throw new Error(`${a.name} has no ARRAE bio in the portal.`);
    input.descriptionHtml = bioHtml(a.arraeBio);
  }
  if (fields.includes("image")) {
    const image = a.photoPath ? await freshStorageLink(a.photoPath, 24 * 3600) : null;
    if (!image) throw new Error(`${a.name} has no photo in the portal.`);
    input.image = { src: image, altText: a.name };
  }
  if (Object.keys(input).length === 1) return;
  const data = await shopifyGql<{ collectionUpdate: { userErrors: { field: string[] | null; message: string }[] } }>(
    `mutation($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id } userErrors { field message } } }`,
    { input },
  );
  checkUserErrors(data.collectionUpdate, "Updating the collection");
  await log(a.id, null, `Updated Shopify collection (${fields.join(", ")})`, actor);
}

/** Creates the show's smart collection ("product tag is …"), like Volume II and III. */
export async function createShowCollection(showId: string, actor: string) {
  const [show] = await db.select().from(s.shows).where(eq(s.shows.id, showId));
  if (!show) throw new Error("Unknown show.");
  const cols = await loadCollections();
  if (findShowCollection(show, cols)) throw new Error(`${show.name} already has a Shopify collection.`);
  const tag = showTag(show);
  const handle = freeHandle(show.id, new Set(cols.map((c) => c.handle)));
  const data = await shopifyGql<{ collectionCreate: { collection: { id: string; handle: string } | null; userErrors: { field: string[] | null; message: string }[] } }>(
    `mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id handle } userErrors { field message } } }`,
    {
      input: {
        title: show.name,
        handle,
        ruleSet: { appliedDisjunctively: false, rules: [{ column: "TAG", relation: "EQUALS", condition: tag }] },
      },
    },
  );
  checkUserErrors(data.collectionCreate, "Creating the show collection");
  await publishAll(data.collectionCreate.collection!.id);
  await log(null, null, `Created Shopify collection /collections/${data.collectionCreate.collection!.handle} (works tagged "${tag}")`, actor, show.id);
}

async function workContext(workId: string, showId: string) {
  const [row] = await db
    .select({ work: s.works, artist: s.artists })
    .from(s.works)
    .leftJoin(s.artists, eq(s.artists.id, s.works.artistId))
    .where(eq(s.works.id, workId));
  if (!row) throw new Error("Work not found.");
  const [show] = await db.select().from(s.shows).where(eq(s.shows.id, showId));
  if (!show) throw new Error("Unknown show.");
  return { ...row, show };
}

/**
 * Creates Shopify products for these works (one batch; the page sends a few at a time).
 * Returns per-work results so one bad work doesn't stop the rest.
 */
export async function createProducts(workIds: string[], showId: string, actor: string) {
  const [cols, index, skus, location] = [await loadCollections(), await loadProductIndex(), await loadSkus(), await primaryLocation()];
  const usedHandles = new Set(index.map((p) => p.handle));
  const onStore = new Set(index.map((p) => p.id));
  const takenSkus = new Set<string>();
  const results: { id: string; ok: boolean; message: string }[] = [];
  for (const workId of workIds) {
    try {
      const { work: w, artist: a, show } = await workContext(workId, showId);
      if (!a) throw new Error("No artist");
      if (w.shopifyProductId && onStore.has(w.shopifyProductId)) throw new Error("Already on Shopify");
      if (w.soldAt) throw new Error("Marked sold");
      if (w.priceUsd === null) throw new Error("No price");
      const artistCol = cols.find((c) => c.handle === a.shopifyCollectionHandle);
      if (!artistCol) throw new Error("Create the artist's collection first");
      const [img] = await db.select().from(s.workImages).where(eq(s.workImages.workId, w.id)).orderBy(s.workImages.position).limit(1);
      const src = img?.storagePath ? await freshStorageLink(img.storagePath, 24 * 3600) : null;
      if (!src) throw new Error("No photo");
      const tag = showTag(show);
      const showCol = findShowCollection(show, cols);
      const collections = [artistCol.id, ...(showCol && !showCol.smart ? [showCol.id] : [])];
      const handle = freeHandle(`${w.title}-${artistCol.handle}`, usedHandles);
      const sku = nextSku(skus, takenSkus);
      const data = await shopifyGql<{ productSet: { product: { id: string; handle: string } | null; userErrors: { field: string[] | null; message: string }[] } }>(
        `mutation($input: ProductSetInput!) { productSet(input: $input, synchronous: true) { product { id handle } userErrors { field message } } }`,
        {
          input: {
            title: w.title,
            handle,
            vendor: a.name,
            productType: w.category || "",
            tags: productTags(w, artistCol.handle, [tag]),
            descriptionHtml: productDescriptionHtml(w),
            status: "ACTIVE",
            collections,
            // Named after the product, so no file name from storage (ids, old names) ends up on the store.
            files: [{ originalSource: src, contentType: "IMAGE", alt: `${w.title} by ${a.name}`, filename: `${handle}.${(img.storagePath!.split(".").pop() || "jpg").toLowerCase()}` }],
            productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
            variants: [
              {
                optionValues: [{ optionName: "Title", name: "Default Title" }],
                price: priceText(w.priceUsd),
                sku,
                inventoryPolicy: "DENY",
                inventoryItem: { tracked: true },
                inventoryQuantities: [{ locationId: location, name: "available", quantity: 1 }],
              },
            ],
          },
        },
      );
      checkUserErrors(data.productSet, "Creating the product");
      const p = data.productSet.product!;
      usedHandles.add(p.handle);
      takenSkus.add(sku);
      await db.update(s.works).set({ shopifyProductId: p.id, shopifyHandle: p.handle }).where(eq(s.works.id, w.id));
      await publishAll(p.id);
      await log(a.id, w.id, `Created Shopify product /products/${p.handle} (${sku})`, actor, show.id);
      results.push({ id: workId, ok: true, message: p.handle });
    } catch (e) {
      results.push({ id: workId, ok: false, message: (e as Error).message });
    }
  }
  return results;
}

/** Links a work to a product already on Shopify (no change on Shopify). */
export async function linkProduct(workId: string, productId: string, actor: string) {
  const data = await shopifyGql<{ product: { id: string; handle: string } | null }>(`query($id: ID!) { product(id: $id) { id handle } }`, { id: productId });
  if (!data.product) throw new Error("That product isn't on Shopify.");
  const [w] = await db.select().from(s.works).where(eq(s.works.id, workId));
  if (!w) throw new Error("Work not found.");
  const [other] = await db.select({ id: s.works.id, title: s.works.title }).from(s.works).where(or(eq(s.works.shopifyProductId, productId)));
  if (other && other.id !== workId) throw new Error(`That product is already linked to "${other.title}".`);
  await db.update(s.works).set({ shopifyProductId: data.product.id, shopifyHandle: data.product.handle }).where(eq(s.works.id, workId));
  await log(w.artistId, w.id, `Linked to Shopify product /products/${data.product.handle}`, actor);
}

export type WorkUpdate = WorkDiff | "description";

/** Sends the chosen portal details to an existing product. */
export async function updateProduct(workId: string, showId: string, fields: WorkUpdate[], actor: string) {
  const { work: w, artist: a, show } = await workContext(workId, showId);
  if (!w.shopifyProductId) throw new Error("Not on Shopify yet.");
  if (!a) throw new Error("No artist");
  const [p] = await loadProductsByIds([w.shopifyProductId]);
  if (!p) throw new Error("The product isn't on Shopify any more.");
  const cols = await loadCollections();
  const input: Record<string, unknown> = { id: p.id };
  if (fields.includes("title")) input.title = w.title;
  if (fields.includes("vendor")) input.vendor = a.name;
  if (fields.includes("description")) input.descriptionHtml = productDescriptionHtml(w);
  const join: string[] = [];
  if (fields.includes("collection")) {
    const col = cols.find((c) => c.handle === a.shopifyCollectionHandle);
    if (!col) throw new Error("The artist's collection isn't on Shopify.");
    join.push(col.id);
  }
  if (fields.includes("showTag")) {
    const showCol = findShowCollection(show, cols);
    if (showCol && !showCol.smart) join.push(showCol.id);
    else input.tags = [...new Set([...p.tags, showTag(show)])];
  }
  if (join.length) input.collectionsToJoin = join;
  if (Object.keys(input).length > 1) {
    const data = await shopifyGql<{ productUpdate: { userErrors: { field: string[] | null; message: string }[] } }>(
      `mutation($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id } userErrors { field message } } }`,
      { product: input },
    );
    checkUserErrors(data.productUpdate, "Updating the product");
  }
  if (fields.includes("price")) {
    const price = priceText(w.priceUsd);
    if (!price) throw new Error("No price in the portal.");
    if (!p.variantId) throw new Error("The product has no variant to price.");
    const data = await shopifyGql<{ productVariantsBulkUpdate: { userErrors: { field: string[] | null; message: string }[] } }>(
      `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } } }`,
      { productId: p.id, variants: [{ id: p.variantId, price }] },
    );
    checkUserErrors(data.productVariantsBulkUpdate, "Updating the price");
  }
  await log(a.id, w.id, `Updated Shopify product /products/${p.handle} (${fields.join(", ")})`, actor, show.id);
}
