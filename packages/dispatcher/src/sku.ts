// SKU判定ロジック
// 最後のセグメントを除いたものをSKUとして分類する

export type LineItem = {
  id: string;
  sku: string;
  productTitle: string;
  variantTitle: string | null;
  remainingQuantity: number;
  originalUnitPriceSet?: {
    shopMoney: {
      amount: string;
    };
  };
};

function getSkuGroup(sku: string): string {
  return sku.replace(/-[^\[\]-]+$/, "");
}

// lineItemsをskuグループごとに分類
export function groupBySkuGroup(
  lineItems: LineItem[],
): Map<string, LineItem[]> {
  const groups = new Map<string, LineItem[]>();
  for (const lineItem of lineItems) {
    const group = getSkuGroup(lineItem.sku);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(lineItem);
  }
  return groups;
}
