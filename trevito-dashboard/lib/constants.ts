/** SKU → Product name mapping */
export const SKU_PRODUCT_MAP: Record<string, string> = {
  'TR PF001': 'Allure',
  'TR PF002': 'Bliss',
  'TR PF003': 'Celeste',
  'TR PF004': 'Elixir',
  'TR PF005': 'Escape',
  'TR PF006': 'Euphoria',
  'TR PF007': "Men's Gift Set",
  'TR PF008': "Women's Gift Set",
  'TR PF009': 'Illusion',
  'TR PF010': 'Legend',
};

export function getProductName(sku: string | null): string {
  if (!sku) return 'Unknown';
  return SKU_PRODUCT_MAP[sku] ?? sku;
}

/** Canonical product display order: Women's, Men's, Gift Sets */
export const PRODUCT_ORDER: string[] = [
  'TR PF001', // Allure (Women's)
  'TR PF002', // Bliss (Women's)
  'TR PF003', // Celeste (Women's)
  'TR PF006', // Euphoria (Women's)
  'TR PF008', // Women's Gift Set
  'TR PF004', // Elixir (Men's)
  'TR PF005', // Escape (Men's)
  'TR PF009', // Illusion (Men's)
  'TR PF010', // Legend (Men's)
  'TR PF007', // Men's Gift Set
];

export const ALL_PRODUCT_SKUS = PRODUCT_ORDER;

export const PRODUCTS = PRODUCT_ORDER.map((sku) => ({
  value: sku,
  label: SKU_PRODUCT_MAP[sku] ?? sku,
}));

export const CHANNELS = [
  { value: 'amazon', label: 'Amazon' },
  { value: 'flipkart', label: 'Flipkart' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'vyapar', label: 'Vyapar' },
] as const;

export const ALL_CHANNEL_VALUES = CHANNELS.map((c) => c.value);

export const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.value, c.label]),
);

export const GROUP_BY_OPTIONS = [
  { value: 'product-channel', label: 'Product → Channel' },
  { value: 'product', label: 'Product' },
  { value: 'channel', label: 'Channel' },
] as const;

export type GroupBy = (typeof GROUP_BY_OPTIONS)[number]['value'];
