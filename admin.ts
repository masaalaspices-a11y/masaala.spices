import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { slugify } from "@/lib/utils";

export type ProductInput = {
  id?: string;
  slug: string;
  sku: string;
  nameAr: string;
  nameFr: string;
  shortAr: string;
  shortFr: string;
  descriptionAr: string;
  descriptionFr: string;
  ingredientsAr?: string;
  ingredientsFr?: string;
  usageAr?: string;
  usageFr?: string;
  storageAr?: string;
  storageFr?: string;
  originAr?: string;
  originFr?: string;
  weightLabel: string;
  weightGrams?: number | null;
  priceDzd: number;
  compareAtDzd?: number | null;
  stock: number;
  minStock: number;
  isNew: boolean;
  isBestseller: boolean;
  isPremium: boolean;
  isOnSale: boolean;
  isActive: boolean;
  isPack: boolean;
  searchAliases?: string;
  imageMain: string;
  images: string[];
  categoryIds: string[];
};

async function requireAdmin(userId: string) {
  const sql = await getSql();
  const existing = await sql<{ user_id: string }>`select user_id from admin_users`;
  if (existing.length === 0) {
    await sql`insert into admin_users (user_id) values (${userId})`;
    return { first: true as const };
  }
  if (!existing.some((r) => r.user_id === userId)) {
    throw new Error("Forbidden");
  }
  return { first: false as const };
}

export const hasAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql`select 1 from admin_users limit 1`;
  return rows.length > 0;
});

export const peekAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ user_id: string }>`
      select user_id from admin_users where user_id = ${context.userId} limit 1`;
    return rows.length > 0;
  });

export const checkAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => requireAdmin(context.userId));


export const adminStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const totals = await sql<{
      sales: number;
      orders: number;
      aov: number;
    }>`select coalesce(sum(total_dzd),0)::int as sales,
              count(*)::int as orders,
              coalesce(avg(total_dzd),0)::int as aov
       from orders where status <> 'cancelled'`;
    const byStatus = await sql<{ status: string; n: number }>`
      select status, count(*)::int as n from orders group by status`;
    const low = await sql<{ id: string; name_ar: string; name_fr: string; stock: number; min_stock: number }>`
      select id, name_ar, name_fr, stock, min_stock from products
      where is_active = true and stock <= min_stock order by stock asc`;
    const top = await sql<{ id: string; name_ar: string; name_fr: string; sold_count: number; image_main: string }>`
      select id, name_ar, name_fr, sold_count, image_main from products
      order by sold_count desc limit 6`;
    const wilaya = await sql<{ wilaya_code: string; sales: number; n: number }>`
      select wilaya_code, coalesce(sum(total_dzd),0)::int as sales, count(*)::int as n
      from orders where status <> 'cancelled' group by wilaya_code order by sales desc limit 8`;
    const recent = await sql<{
      id: string;
      customer_first: string;
      customer_last: string;
      total_dzd: number;
      status: string;
      created_at: string;
    }>`select id, customer_first, customer_last, total_dzd, status, created_at::text
       from orders order by created_at desc limit 8`;
    const statusMap: Record<string, number> = {};
    for (const r of byStatus) statusMap[r.status] = r.n;
    return {
      sales: totals[0]?.sales ?? 0,
      orders: totals[0]?.orders ?? 0,
      aov: totals[0]?.aov ?? 0,
      newOrders: statusMap.new ?? 0,
      delivered: statusMap.delivered ?? 0,
      cancelled: statusMap.cancelled ?? 0,
      low,
      top,
      wilaya,
      recent,
    };
  });

export const adminListProducts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<{
      id: string;
      slug: string;
      sku: string;
      name_ar: string;
      name_fr: string;
      price_dzd: number;
      stock: number;
      min_stock: number;
      is_active: boolean;
      image_main: string;
      is_new: boolean;
      is_bestseller: boolean;
    }>`select id, slug, sku, name_ar, name_fr, price_dzd, stock, min_stock, is_active, image_main, is_new, is_bestseller
       from products order by updated_at desc`;
  });

export const adminGetProduct = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<Record<string, unknown>>`select * from products where id = ${id}`;
    if (!rows[0]) return null;
    const images = await sql<{ url: string }>`select url from product_images where product_id = ${id} order by sort_order`;
    const cats = await sql<{ category_id: string }>`select category_id from product_categories where product_id = ${id}`;
    const r = rows[0];
    return {
      id: String(r.id),
      slug: String(r.slug),
      sku: String(r.sku),
      nameAr: String(r.name_ar),
      nameFr: String(r.name_fr),
      shortAr: String(r.short_ar ?? ""),
      shortFr: String(r.short_fr ?? ""),
      descriptionAr: String(r.description_ar ?? ""),
      descriptionFr: String(r.description_fr ?? ""),
      ingredientsAr: String(r.ingredients_ar ?? ""),
      ingredientsFr: String(r.ingredients_fr ?? ""),
      usageAr: String(r.usage_ar ?? ""),
      usageFr: String(r.usage_fr ?? ""),
      storageAr: String(r.storage_ar ?? ""),
      storageFr: String(r.storage_fr ?? ""),
      originAr: String(r.origin_ar ?? "الجزائر"),
      originFr: String(r.origin_fr ?? "Algérie"),
      weightLabel: String(r.weight_label ?? ""),
      weightGrams: r.weight_grams == null ? null : Number(r.weight_grams),
      priceDzd: Number(r.price_dzd),
      compareAtDzd: r.compare_at_dzd == null ? null : Number(r.compare_at_dzd),
      stock: Number(r.stock),
      minStock: Number(r.min_stock),
      isNew: r.is_new === true,
      isBestseller: r.is_bestseller === true,
      isPremium: r.is_premium === true,
      isOnSale: r.is_on_sale === true,
      isActive: r.is_active === true,
      isPack: r.is_pack === true,
      searchAliases: String(r.search_aliases ?? ""),
      imageMain: String(r.image_main ?? ""),
      images: images.map((i) => i.url),
      categoryIds: cats.map((c) => c.category_id),
    } satisfies ProductInput;
  });

export const adminSaveProduct = createServerFn({ method: "POST" })
  .validator((input: ProductInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const nameAr = data.nameAr.trim();
    const nameFr = data.nameFr.trim() || nameAr;
    if (!nameAr) throw new Error("Name required");
    if (!data.priceDzd || data.priceDzd < 0) throw new Error("Price required");
    if (!data.imageMain) throw new Error("Image required");
    const sql = await getSql();
    const slug = (data.slug || slugify(nameFr || nameAr)).slice(0, 80);
    const id = data.id || slug;
    const sku = data.sku.trim() || `MSL-${id.slice(0, 8).toUpperCase()}`;
    const existing = await sql<{ id: string }>`select id from products where id = ${id}`;
    const payload = {
      slug,
      sku,
      name_ar: nameAr,
      name_fr: nameFr,
      short_ar: data.shortAr.trim() || nameAr,
      short_fr: data.shortFr.trim() || nameFr,
      description_ar: data.descriptionAr.trim() || data.shortAr.trim(),
      description_fr: data.descriptionFr.trim() || data.shortFr.trim(),
      ingredients_ar: data.ingredientsAr || null,
      ingredients_fr: data.ingredientsFr || null,
      usage_ar: data.usageAr || null,
      usage_fr: data.usageFr || null,
      storage_ar: data.storageAr || null,
      storage_fr: data.storageFr || null,
      origin_ar: data.originAr || "الجزائر",
      origin_fr: data.originFr || "Algérie",
      weight_label: data.weightLabel || "—",
      weight_grams: data.weightGrams ?? null,
      price_dzd: Math.round(data.priceDzd),
      compare_at_dzd: data.compareAtDzd ? Math.round(data.compareAtDzd) : null,
      stock: Math.round(data.stock),
      min_stock: Math.round(data.minStock || 10),
      is_new: data.isNew,
      is_bestseller: data.isBestseller,
      is_premium: data.isPremium,
      is_on_sale: data.isOnSale,
      is_active: data.isActive,
      is_pack: data.isPack,
      search_aliases: data.searchAliases || `${data.nameAr} ${data.nameFr}`,
      image_main: data.imageMain,
    };
    if (existing[0]) {
      await sql.query(
        `update products set
          slug=$2, sku=$3, name_ar=$4, name_fr=$5, short_ar=$6, short_fr=$7,
          description_ar=$8, description_fr=$9, ingredients_ar=$10, ingredients_fr=$11,
          usage_ar=$12, usage_fr=$13, storage_ar=$14, storage_fr=$15,
          origin_ar=$16, origin_fr=$17, weight_label=$18, weight_grams=$19,
          price_dzd=$20, compare_at_dzd=$21, stock=$22, min_stock=$23,
          is_new=$24, is_bestseller=$25, is_premium=$26, is_on_sale=$27,
          is_active=$28, is_pack=$29, search_aliases=$30, image_main=$31, updated_at=now()
         where id=$1`,
        [
          id, payload.slug, payload.sku, payload.name_ar, payload.name_fr, payload.short_ar, payload.short_fr,
          payload.description_ar, payload.description_fr, payload.ingredients_ar, payload.ingredients_fr,
          payload.usage_ar, payload.usage_fr, payload.storage_ar, payload.storage_fr,
          payload.origin_ar, payload.origin_fr, payload.weight_label, payload.weight_grams,
          payload.price_dzd, payload.compare_at_dzd, payload.stock, payload.min_stock,
          payload.is_new, payload.is_bestseller, payload.is_premium, payload.is_on_sale,
          payload.is_active, payload.is_pack, payload.search_aliases, payload.image_main,
        ],
      );
    } else {
      await sql.query(
        `insert into products (
          id, slug, sku, name_ar, name_fr, short_ar, short_fr, description_ar, description_fr,
          ingredients_ar, ingredients_fr, usage_ar, usage_fr, storage_ar, storage_fr,
          origin_ar, origin_fr, weight_label, weight_grams, price_dzd, compare_at_dzd,
          stock, min_stock, is_new, is_bestseller, is_premium, is_on_sale, is_active, is_pack,
          search_aliases, image_main
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31
        )`,
        [
          id, payload.slug, payload.sku, payload.name_ar, payload.name_fr, payload.short_ar, payload.short_fr,
          payload.description_ar, payload.description_fr, payload.ingredients_ar, payload.ingredients_fr,
          payload.usage_ar, payload.usage_fr, payload.storage_ar, payload.storage_fr,
          payload.origin_ar, payload.origin_fr, payload.weight_label, payload.weight_grams,
          payload.price_dzd, payload.compare_at_dzd, payload.stock, payload.min_stock,
          payload.is_new, payload.is_bestseller, payload.is_premium, payload.is_on_sale,
          payload.is_active, payload.is_pack, payload.search_aliases, payload.image_main,
        ],
      );
    }
    await sql`delete from product_images where product_id = ${id}`;
    const imgs = [data.imageMain, ...data.images.filter((u) => u && u !== data.imageMain)];
    for (let i = 0; i < imgs.length; i++) {
      await sql.query(
        `insert into product_images (product_id, url, sort_order) values ($1,$2,$3)`,
        [id, imgs[i], i],
      );
    }
    await sql`delete from product_categories where product_id = ${id}`;
    for (const cid of data.categoryIds) {
      await sql.query(
        `insert into product_categories (product_id, category_id) values ($1,$2) on conflict do nothing`,
        [id, cid],
      );
    }
    return { id, slug };
  });

export const adminDeleteProduct = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`update products set is_active = false, updated_at = now() where id = ${id}`;
    return { ok: true };
  });

export const adminListOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<{
      id: string;
      customer_first: string;
      customer_last: string;
      customer_phone: string;
      wilaya_code: string;
      commune: string;
      total_dzd: number;
      status: string;
      created_at: string;
    }>`select id, customer_first, customer_last, customer_phone, wilaya_code, commune,
              total_dzd, status, created_at::text
       from orders order by created_at desc`;
  });

export const adminGetOrder = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const orders = await sql<Record<string, unknown>>`select * from orders where id = ${id}`;
    if (!orders[0]) return null;
    const items = await sql<Record<string, unknown>>`select * from order_items where order_id = ${id}`;
    return { order: orders[0], items };
  });

export const adminSetOrderStatus = createServerFn({ method: "POST" })
  .validator((input: { id: string; status: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const allowed = ["new", "confirmed", "preparing", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(data.status)) throw new Error("Bad status");
    const sql = await getSql();
    await sql`update orders set status = ${data.status}, updated_at = now() where id = ${data.id}`;
    if (data.status === "delivered") {
      const items = await sql<{ product_id: string; quantity: number }>`
        select product_id, quantity from order_items where order_id = ${data.id}`;
      for (const it of items) {
        await sql`update products set sold_count = sold_count + ${it.quantity} where id = ${it.product_id}`;
      }
    }
    return { ok: true };
  });

export const adminSaveShipping = createServerFn({ method: "POST" })
  .validator((rows: { wilayaCode: string; priceDzd: number }[]) => rows)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    for (const r of data) {
      await sql`update shipping_rates set price_dzd = ${Math.round(r.priceDzd)} where wilaya_code = ${r.wilayaCode}`;
    }
    return { ok: true };
  });

export const adminListCoupons = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<Record<string, unknown>>`select * from coupons order by id desc`;
  });

export const adminSaveCoupon = createServerFn({ method: "POST" })
  .validator((input: {
    id?: number;
    code: string;
    type: string;
    value: number;
    minOrderDzd: number;
    maxUses?: number | null;
    isActive: boolean;
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const code = data.code.trim().toUpperCase();
    if (data.id) {
      await sql`update coupons set code = ${code}, type = ${data.type}, value = ${data.value},
        min_order_dzd = ${data.minOrderDzd}, max_uses = ${data.maxUses ?? null}, is_active = ${data.isActive}
        where id = ${data.id}`;
    } else {
      await sql`insert into coupons (code, type, value, min_order_dzd, max_uses, is_active)
        values (${code}, ${data.type}, ${data.value}, ${data.minOrderDzd}, ${data.maxUses ?? null}, ${data.isActive})`;
    }
    return { ok: true };
  });

export const adminSaveSettings = createServerFn({ method: "POST" })
  .validator((input: Record<string, string>) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    for (const [key, value] of Object.entries(data)) {
      await sql`insert into site_settings (key, value) values (${key}, ${value})
        on conflict (key) do update set value = excluded.value`;
    }
    return { ok: true };
  });

export const adminWholesale = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<Record<string, unknown>>`select * from wholesale_inquiries order by created_at desc`;
  });
