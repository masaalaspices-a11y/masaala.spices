import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/verify.server";
import { orderNumber } from "@/lib/utils";
import { authMiddleware } from "@/lib/auth/middleware";

type ItemIn = { productId: string; variantId?: string; quantity: number };

export const previewCoupon = createServerFn({ method: "POST" })
  .validator((input: { code: string; subtotal: number }) => input)
  .handler(async ({ data }) => {
    const sql = await getSql();
    const code = data.code.trim().toUpperCase();
    const rows = await sql<{
      code: string;
      type: string;
      value: number;
      min_order_dzd: number;
      max_uses: number | null;
      used_count: number;
      is_active: boolean;
    }>`select code, type, value, min_order_dzd, max_uses, used_count, is_active from coupons where code = ${code}`;
    const c = rows[0];
    if (!c || !c.is_active) return { ok: false as const, error: "invalid" };
    if (c.max_uses != null && c.used_count >= c.max_uses) return { ok: false as const, error: "invalid" };
    if (data.subtotal < c.min_order_dzd) return { ok: false as const, error: "min" };
    const discount = c.type === "percent"
      ? Math.round((data.subtotal * c.value) / 100)
      : Math.min(c.value, data.subtotal);
    return { ok: true as const, code: c.code, discount };
  });

export const placeOrder = createServerFn({ method: "POST" })
  .validator((input: {
    items: ItemIn[];
    firstName: string;
    lastName: string;
    phone: string;
    wilayaCode: string;
    commune: string;
    address: string;
    notes?: string;
    coupon?: string;
  }) => input)
  .handler(async ({ data }) => {
    if (!data.items.length) throw new Error("Empty cart");
    if (!data.firstName.trim() || !data.lastName.trim()) throw new Error("Name required");
    if (!data.phone.trim() || !data.wilayaCode || !data.commune.trim() || !data.address.trim()) {
      throw new Error("Address required");
    }
    const sql = await getSql();
    let userId: string | null = null;
    try {
      const u = await getSessionUser();
      userId = u?.id ?? null;
    } catch {
      userId = null;
    }

    const ids = [...new Set(data.items.map((i) => i.productId))];
    const ph = ids.map((_, i) => `$${i + 1}`).join(",");
    const products = await sql.query<{
      id: string;
      name_ar: string;
      name_fr: string;
      image_main: string;
      weight_label: string;
      price_dzd: number;
      stock: number;
    }>(`select id, name_ar, name_fr, image_main, weight_label, price_dzd, stock from products where id in (${ph}) and is_active = true`, ids);
    const byId = new Map(products.map((p) => [p.id, p]));
    const variants = data.items.some((i) => i.variantId)
      ? await sql.query<{ id: string; product_id: string; price_dzd: number; stock: number; weight_label: string | null; label_ar: string }>(
          `select id, product_id, price_dzd, stock, weight_label, label_ar from product_variants`,
        )
      : [];
    const vById = new Map(variants.map((v) => [v.id, v]));

    const lines: {
      productId: string;
      variantId: string | null;
      nameAr: string;
      nameFr: string;
      image: string;
      weightLabel: string;
      unit: number;
      qty: number;
      total: number;
    }[] = [];
    for (const it of data.items) {
      const p = byId.get(it.productId);
      if (!p) throw new Error("Unknown product");
      const qty = Math.max(1, Math.round(it.quantity));
      let unit = p.price_dzd;
      let stock = p.stock;
      let weight = p.weight_label;
      if (it.variantId) {
        const v = vById.get(it.variantId);
        if (!v || v.product_id !== p.id) throw new Error("Unknown variant");
        unit = v.price_dzd;
        stock = v.stock;
        weight = v.weight_label || p.weight_label;
      }
      if (stock < qty) throw new Error("Out of stock");
      lines.push({
        productId: p.id,
        variantId: it.variantId ?? null,
        nameAr: p.name_ar,
        nameFr: p.name_fr,
        image: p.image_main,
        weightLabel: weight,
        unit,
        qty,
        total: unit * qty,
      });
    }
    const subtotal = lines.reduce((n, l) => n + l.total, 0);
    const ship = await sql<{ price_dzd: number }>`select price_dzd from shipping_rates where wilaya_code = ${data.wilayaCode}`;
    const shipping = ship[0]?.price_dzd ?? 0;
    let discount = 0;
    let couponCode: string | null = null;
    if (data.coupon?.trim()) {
      const preview = await previewCoupon({ data: { code: data.coupon, subtotal } });
      if (preview.ok) {
        discount = preview.discount;
        couponCode = preview.code;
      }
    }
    const total = Math.max(0, subtotal + shipping - discount);
    const id = orderNumber();

    await sql.query(
      `insert into orders (
        id, user_id, customer_first, customer_last, customer_phone, wilaya_code, commune, address, notes,
        payment_method, status, subtotal_dzd, shipping_dzd, discount_dzd, total_dzd, coupon_code
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'cod','new',$10,$11,$12,$13,$14)`,
      [
        id, userId, data.firstName.trim(), data.lastName.trim(), data.phone.trim(),
        data.wilayaCode, data.commune.trim(), data.address.trim(), data.notes?.trim() || null,
        subtotal, shipping, discount, total, couponCode,
      ],
    );
    for (const l of lines) {
      await sql.query(
        `insert into order_items (order_id, product_id, variant_id, name_ar, name_fr, image, weight_label, unit_price_dzd, quantity, line_total_dzd)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, l.productId, l.variantId, l.nameAr, l.nameFr, l.image, l.weightLabel, l.unit, l.qty, l.total],
      );
      if (l.variantId) {
        await sql`update product_variants set stock = stock - ${l.qty} where id = ${l.variantId}`;
      }
      await sql`update products set stock = stock - ${l.qty} where id = ${l.productId}`;
    }
    if (couponCode) {
      await sql`update coupons set used_count = used_count + 1 where code = ${couponCode}`;
    }
    return { id, total, shipping, discount, subtotal };
  });

export const getPublicOrder = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const sql = await getSql();
    const orders = await sql<Record<string, unknown>>`select id, customer_first, wilaya_code, commune, status, subtotal_dzd, shipping_dzd, discount_dzd, total_dzd, created_at::text as created_at from orders where id = ${id}`;
    if (!orders[0]) return null;
    const items = await sql<{
      name_ar: string;
      name_fr: string;
      image: string | null;
      quantity: number;
      unit_price_dzd: number;
      line_total_dzd: number;
      weight_label: string | null;
    }>`select name_ar, name_fr, image, quantity, unit_price_dzd, line_total_dzd, weight_label from order_items where order_id = ${id}`;
    return { order: orders[0], items };
  });

export const submitWholesale = createServerFn({ method: "POST" })
  .validator((input: {
    name: string;
    company?: string;
    wilayaCode?: string;
    phone: string;
    productsNeeded?: string;
    quantityNote?: string;
  }) => input)
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql`insert into wholesale_inquiries (name, company, wilaya_code, phone, products_needed, quantity_note)
      values (${data.name.trim()}, ${data.company?.trim() || null}, ${data.wilayaCode || null}, ${data.phone.trim()}, ${data.productsNeeded || null}, ${data.quantityNote || null})`;
    return { ok: true };
  });

export const myOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: string;
      status: string;
      total_dzd: number;
      created_at: string;
    }>`select id, status, total_dzd, created_at::text from orders where user_id = ${context.userId} order by created_at desc`;
  });

export const toggleWishlist = createServerFn({ method: "POST" })
  .validator((productId: string) => productId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: productId }) => {
    const sql = await getSql();
    const existing = await sql`select 1 from wishlists where user_id = ${context.userId} and product_id = ${productId}`;
    if (existing.length) {
      await sql`delete from wishlists where user_id = ${context.userId} and product_id = ${productId}`;
      return { on: false };
    }
    await sql`insert into wishlists (user_id, product_id) values (${context.userId}, ${productId})`;
    return { on: true };
  });

export const myWishlist = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ product_id: string }>`select product_id from wishlists where user_id = ${context.userId}`;
  });
