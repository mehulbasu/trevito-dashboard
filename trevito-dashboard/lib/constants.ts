/** SKU → Product name mapping */
export const SKU_PRODUCT_MAP: Record<string, string> = {
  'TR PF001': 'Allure',
  'TR PF002': 'Bliss',
  'TR PF003': 'Celeste',
  'TR PF004': 'Allure',
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
