import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import type { Category, Product, ProductVariant, Recipe, ShippingRate, UsageGuide } from "@/lib/types";

type PRow = Record<string, unknown>;

function n(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}
function b(v: unknown): boolean {
  return v === true || v === "t" || v === "true";
}
function s(v: unknown): string {
  return v == null ? "" : String(v);
}
function sn(v: unknown): string | null {
  return v == null || v === "" ? null : String(v);
}

function cardOf(r: PRow): Product {
  return {
    id: s(r.id),
    slug: s(r.slug),
    sku: s(r.sku),
    nameAr: s(r.name_ar),
    nameFr: s(r.name_fr),
    shortAr: s(r.short_ar),
    shortFr: s(r.short_fr),
    descriptionAr: s(r.description_ar),
    descriptionFr: s(r.description_fr),
    ingredientsAr: sn(r.ingredients_ar),
    ingredientsFr: sn(r.ingredients_fr),
    usageAr: sn(r.usage_ar),
    usageFr: sn(r.usage_fr),
    storageAr: sn(r.storage_ar),
    storageFr: sn(r.storage_fr),
    originAr: s(r.origin_ar) || "الجزائر",
    originFr: s(r.origin_fr) || "Algérie",
    allergensAr: sn(r.allergens_ar),
    allergensFr: sn(r.allergens_fr),
    nutritionAr: sn(r.nutrition_ar),
    nutritionFr: sn(r.nutrition_fr),
    brandNoteAr: sn(r.brand_note_ar),
    brandNoteFr: sn(r.brand_note_fr),
    weightLabel: s(r.weight_label),
    weightGrams: r.weight_grams == null ? null : n(r.weight_grams),
    priceDzd: n(r.price_dzd),
    compareAtDzd: r.compare_at_dzd == null ? null : n(r.compare_at_dzd),
    stock: n(r.stock),
    minStock: n(r.min_stock),
    soldCount: n(r.sold_count),
    isNew: b(r.is_new),
    isBestseller: b(r.is_bestseller),
    isPremium: b(r.is_premium),
    isOnSale: b(r.is_on_sale),
    isActive: b(r.is_active),
    isPack: b(r.is_pack),
    searchAliases: s(r.search_aliases),
    seoTitleAr: sn(r.seo_title_ar),
    seoTitleFr: sn(r.seo_title_fr),
    seoDescAr: sn(r.seo_desc_ar),
    seoDescFr: sn(r.seo_desc_fr),
    seoKeywords: sn(r.seo_keywords),
    imageMain: s(r.image_main),
    images: [],
    categoryIds: [],
    variants: [],
  };
}

async function attach(products: Product[]): Promise<Product[]> {
  if (!products.length) return products;
  const sql = await getSql();
  const ids = products.map((p) => p.id);
  const ph = ids.map((_, i) => `$${i + 1}`).join(",");
  const images = await sql.query<{ product_id: string; url: string }>(
    `select product_id, url from product_images where product_id in (${ph}) order by sort_order`,
    ids,
  );
  const cats = await sql.query<{ product_id: string; category_id: string }>(
    `select product_id, category_id from product_categories where product_id in (${ph})`,
    ids,
  );
  const vars = await sql.query<PRow>(
    `select * from product_variants where product_id in (${ph})`,
    ids,
  );
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const img of images) {
    const p = byId.get(img.product_id);
    if (p && !p.images.includes(img.url)) p.images.push(img.url);
  }
  for (const p of products) {
    if (!p.images.length && p.imageMain) p.images = [p.imageMain];
  }
  for (const c of cats) byId.get(c.product_id)?.categoryIds.push(c.category_id);
  for (const v of vars) {
    const p = byId.get(s(v.product_id));
    if (!p) continue;
    p.variants.push({
      id: s(v.id),
      productId: s(v.product_id),
      labelAr: s(v.label_ar),
      labelFr: s(v.label_fr),
      sku: s(v.sku),
      weightLabel: sn(v.weight_label),
      priceDzd: n(v.price_dzd),
      compareAtDzd: v.compare_at_dzd == null ? null : n(v.compare_at_dzd),
      stock: n(v.stock),
      isDefault: b(v.is_default),
    } satisfies ProductVariant);
  }
  return products;
}

export const listProducts = createServerFn({ method: "GET" })
  .validator((input: { category?: string; q?: string; sort?: string } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const sql = await getSql();
    let rows: PRow[];
    if (data.q && data.q.trim()) {
      const q = `%${data.q.trim()}%`;
      rows = await sql.query<PRow>(
        `select * from products where is_active = true and (
          name_ar ilike $1 or name_fr ilike $1 or short_ar ilike $1 or short_fr ilike $1
          or search_aliases ilike $1 or slug ilike $1
        ) order by is_bestseller desc, sold_count desc`,
        [q],
      );
    } else {
      rows = await sql`select * from products where is_active = true order by is_bestseller desc, sold_count desc, name_fr`;
    }
    let products = await attach(rows.map(cardOf));
    if (data.category) {
      products = products.filter((p) => p.categoryIds.includes(data.category!));
    }
    if (data.sort === "price-asc") products.sort((a, b) => a.priceDzd - b.priceDzd);
    if (data.sort === "price-desc") products.sort((a, b) => b.priceDzd - a.priceDzd);
    return products;
  });

export const getProductBySlug = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const sql = await getSql();
    const rows = await sql<PRow>`select * from products where slug = ${slug} and is_active = true`;
    if (!rows[0]) return null;
    const [product] = await attach([cardOf(rows[0])]);
    if (product.isPack) {
      const items = await sql.query<{
        product_id: string;
        quantity: number;
        name_ar: string;
        name_fr: string;
        slug: string;
      }>(
        `select pi.product_id, pi.quantity, p.name_ar, p.name_fr, p.slug
         from pack_items pi join products p on p.id = pi.product_id
         where pi.pack_id = $1`,
        [product.id],
      );
      product.packItems = items.map((i) => ({
        productId: i.product_id,
        quantity: n(i.quantity),
        nameAr: i.name_ar,
        nameFr: i.name_fr,
        slug: i.slug,
      }));
    }
    return product;
  });

export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<PRow>`select * from categories order by sort_order, name_fr`;
  return rows.map(
    (r): Category => ({
      id: s(r.id),
      slug: s(r.slug),
      nameAr: s(r.name_ar),
      nameFr: s(r.name_fr),
      featured: b(r.featured),
    }),
  );
});

function parseList(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String);
  const t = String(raw);
  try {
    const v = JSON.parse(t) as unknown;
    return Array.isArray(v) ? v.map(String) : t.split("\n").filter(Boolean);
  } catch {
    return t.split("\n").filter(Boolean);
  }
}

export const listRecipes = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<PRow>`select * from recipes order by created_at desc`;
  const links = await sql<{ recipe_id: string; product_id: string }>`select recipe_id, product_id from recipe_products`;
  return rows.map((r): Recipe => ({
    id: s(r.id),
    slug: s(r.slug),
    titleAr: s(r.title_ar),
    titleFr: s(r.title_fr),
    excerptAr: sn(r.excerpt_ar),
    excerptFr: sn(r.excerpt_fr),
    image: s(r.image),
    minutes: n(r.minutes),
    difficulty: s(r.difficulty),
    servings: r.servings == null ? null : n(r.servings),
    ingredientsAr: parseList(r.ingredients_ar),
    ingredientsFr: parseList(r.ingredients_fr),
    stepsAr: parseList(r.steps_ar),
    stepsFr: parseList(r.steps_fr),
    productIds: links.filter((l) => l.recipe_id === r.id).map((l) => l.product_id),
  }));
});

export const getRecipeBySlug = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const all = await listRecipes();
    return all.find((r) => r.slug === slug) ?? null;
  });

export const listGuides = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<PRow>`select * from usage_guides`;
  return rows.map(
    (r): UsageGuide => ({
      id: s(r.id),
      slug: s(r.slug),
      titleAr: s(r.title_ar),
      titleFr: s(r.title_fr),
      productId: sn(r.product_id),
      image: sn(r.image),
      itemsAr: parseList(r.items_ar),
      itemsFr: parseList(r.items_fr),
    }),
  );
});

export const listShipping = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<PRow>`select * from shipping_rates order by wilaya_code`;
  return rows.map(
    (r): ShippingRate => ({
      wilayaCode: s(r.wilaya_code),
      wilayaAr: s(r.wilaya_ar),
      wilayaFr: s(r.wilaya_fr),
      priceDzd: n(r.price_dzd),
      daysMin: n(r.days_min),
      daysMax: n(r.days_max),
    }),
  );
});

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<{ key: string; value: string }>`select key, value from site_settings`;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
});

export const getHomeData = createServerFn({ method: "GET" }).handler(async () => {
  const [products, recipes, guides, categories, settings] = await Promise.all([
    listProducts({ data: {} }),
    listRecipes(),
    listGuides(),
    listCategories(),
    getSettings(),
  ]);
  return {
    products,
    bestsellers: products.filter((p) => p.isBestseller).slice(0, 8),
    news: products.filter((p) => p.isNew).slice(0, 8),
    packs: products.filter((p) => p.isPack),
    recipes,
    guides,
    categories,
    settings,
  };
});

export const searchProducts = createServerFn({ method: "GET" })
  .validator((q: string) => q)
  .handler(async ({ data: q }) => listProducts({ data: { q } }));
