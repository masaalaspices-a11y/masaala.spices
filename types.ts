export type ProductVariant = {
  id: string;
  productId: string;
  labelAr: string;
  labelFr: string;
  sku: string;
  weightLabel: string | null;
  priceDzd: number;
  compareAtDzd: number | null;
  stock: number;
  isDefault: boolean;
};

export type Product = {
  id: string;
  slug: string;
  sku: string;
  nameAr: string;
  nameFr: string;
  shortAr: string;
  shortFr: string;
  descriptionAr: string;
  descriptionFr: string;
  ingredientsAr: string | null;
  ingredientsFr: string | null;
  usageAr: string | null;
  usageFr: string | null;
  storageAr: string | null;
  storageFr: string | null;
  originAr: string;
  originFr: string;
  allergensAr: string | null;
  allergensFr: string | null;
  nutritionAr: string | null;
  nutritionFr: string | null;
  brandNoteAr: string | null;
  brandNoteFr: string | null;
  weightLabel: string;
  weightGrams: number | null;
  priceDzd: number;
  compareAtDzd: number | null;
  stock: number;
  minStock: number;
  soldCount: number;
  isNew: boolean;
  isBestseller: boolean;
  isPremium: boolean;
  isOnSale: boolean;
  isActive: boolean;
  isPack: boolean;
  searchAliases: string;
  seoTitleAr: string | null;
  seoTitleFr: string | null;
  seoDescAr: string | null;
  seoDescFr: string | null;
  seoKeywords: string | null;
  imageMain: string;
  images: string[];
  categoryIds: string[];
  variants: ProductVariant[];
  packItems?: { productId: string; quantity: number; nameAr: string; nameFr: string; slug: string }[];
};

export type Category = {
  id: string;
  slug: string;
  nameAr: string;
  nameFr: string;
  featured: boolean;
};

export type Recipe = {
  id: string;
  slug: string;
  titleAr: string;
  titleFr: string;
  excerptAr: string | null;
  excerptFr: string | null;
  image: string;
  minutes: number;
  difficulty: string;
  servings: number | null;
  ingredientsAr: string[];
  ingredientsFr: string[];
  stepsAr: string[];
  stepsFr: string[];
  productIds: string[];
};

export type UsageGuide = {
  id: string;
  slug: string;
  titleAr: string;
  titleFr: string;
  productId: string | null;
  image: string | null;
  itemsAr: string[];
  itemsFr: string[];
};

export type ShippingRate = {
  wilayaCode: string;
  wilayaAr: string;
  wilayaFr: string;
  priceDzd: number;
  daysMin: number;
  daysMax: number;
};

export type OrderStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type CartLine = {
  productId: string;
  variantId?: string;
  slug: string;
  nameAr: string;
  nameFr: string;
  image: string;
  weightLabel: string;
  unitPrice: number;
  quantity: number;
};
