import { createServerFn } from "@tanstack/react-start";
import { listProducts, listRecipes } from "./catalog";

export const askMasaala = createServerFn({ method: "POST" })
  .validator((input: { message: string; lang: "ar" | "fr" }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    const [products, recipes] = await Promise.all([
      listProducts({ data: {} }),
      listRecipes(),
    ]);
    const catalog = products
      .slice(0, 20)
      .map((p) => `${p.slug} | ${p.nameAr} / ${p.nameFr} | ${p.shortAr}`)
      .join("\n");
    const recs = recipes
      .map((r) => `${r.slug} | ${r.titleAr} / ${r.titleFr}`)
      .join("\n");

    if (!apiKey) {
      const q = data.message.toLowerCase();
      const hit =
        products.find((p) =>
          `${p.nameAr} ${p.nameFr} ${p.searchAliases}`.toLowerCase().includes(q),
        ) ||
        (q.includes("دجاج") || q.includes("poulet") || q.includes("شواء")
          ? products.find((p) => p.id === "paprika")
          : q.includes("مرق") || q.includes("merguez") || q.includes("مرڨاز")
            ? products.find((p) => p.id === "gourmi")
            : q.includes("ملوخ")
              ? products.find((p) => p.id === "mloukhia")
              : products[0]);
      const recipe =
        recipes.find((r) => r.productIds.includes(hit?.id ?? "")) ?? recipes[0];
      const text =
        data.lang === "fr"
          ? `Pour « ${data.message} », essayez ${hit?.nameFr ?? "nos mélanges"} — ${hit?.shortFr ?? ""}. Recette : ${recipe?.titleFr ?? ""}.`
          : `لطبق « ${data.message} » جرّب ${hit?.nameAr ?? "خلطاتنا"} — ${hit?.shortAr ?? ""}. وصفة مقترحة: ${recipe?.titleAr ?? ""}.`;
      return {
        ok: true as const,
        text,
        productSlugs: hit ? [hit.slug] : [],
        recipeSlug: recipe?.slug ?? null,
      };
    }

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 280,
        messages: [
          {
            role: "system",
            content:
              `You are the MASAALA shop assistant for an Algerian spice brand. Reply in ${data.lang === "ar" ? "Arabic" : "French"}. Be practical, short, no health claims. Recommend 1-2 catalog products and optionally a recipe. End with a line PRODUCT_SLUGS: slug1,slug2 and RECIPE_SLUG: slug-or-none.\n\nProducts:\n${catalog}\n\nRecipes:\n${recs}`,
          },
          { role: "user", content: data.message.slice(0, 400) },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: "ai" };
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const text = body.choices[0]?.message.content ?? "";
    const slugs = [...text.matchAll(/PRODUCT_SLUGS:\s*([a-z0-9,-]+)/i)][0]?.[1]
      ?.split(",")
      .map((x) => x.trim())
      .filter(Boolean) ?? [];
    const recipeSlug = [...text.matchAll(/RECIPE_SLUG:\s*([a-z0-9-]+)/i)][0]?.[1] ?? null;
    const clean = text.replace(/PRODUCT_SLUGS:.*$/im, "").replace(/RECIPE_SLUG:.*$/im, "").trim();
    return { ok: true as const, text: clean, productSlugs: slugs, recipeSlug };
  });
