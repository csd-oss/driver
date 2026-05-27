import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  restorePurchases,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Purchase,
  type ProductSubscription,
  type EventSubscription,
} from 'react-native-iap';

export const PRODUCT_YEARLY = 'com.smartie.driver.pro.yearly';
export const PRODUCT_WEEKLY = 'com.smartie.driver.pro.weekly';
export const ALL_SKUS = [PRODUCT_YEARLY, PRODUCT_WEEKLY] as const;

let connected = false;
let purchaseSub: EventSubscription | null = null;
let errorSub: EventSubscription | null = null;

export const isIapSupported = (): boolean => Platform.OS === 'ios';

export const initIap = async (): Promise<void> => {
  if (!isIapSupported() || connected) return;
  await initConnection();
  connected = true;
};

export const teardownIap = async (): Promise<void> => {
  purchaseSub?.remove();
  errorSub?.remove();
  purchaseSub = null;
  errorSub = null;
  if (connected) {
    await endConnection();
    connected = false;
  }
};

export const fetchSubscriptions = async (): Promise<ProductSubscription[]> => {
  if (!isIapSupported()) return [];
  const products = await fetchProducts({ skus: [...ALL_SKUS], type: 'subs' });
  return (products ?? []).filter(
    (p): p is ProductSubscription => p && 'subscription' in p
  ) as ProductSubscription[];
};

type Listeners = {
  onSuccess: (purchase: Purchase) => void;
  onError: (message: string) => void;
};

export const attachPurchaseListeners = ({ onSuccess, onError }: Listeners): (() => void) => {
  purchaseSub?.remove();
  errorSub?.remove();
  purchaseSub = purchaseUpdatedListener(async (purchase) => {
    try {
      await finishTransaction({ purchase, isConsumable: false });
    } catch {
      // finishing twice is fine; surface only purchase failures.
    }
    onSuccess(purchase);
  });
  errorSub = purchaseErrorListener((err) => {
    onError(err?.message ?? 'Purchase failed');
  });
  return () => {
    purchaseSub?.remove();
    errorSub?.remove();
    purchaseSub = null;
    errorSub = null;
  };
};

export const purchaseSubscription = async (sku: string): Promise<void> => {
  if (!isIapSupported()) return;
  await requestPurchase({
    request: { ios: { sku } },
    type: 'subs',
  });
};

export const restoreSubscriptions = async (): Promise<boolean> => {
  if (!isIapSupported()) return false;
  await restorePurchases();
  const purchases = await getAvailablePurchases();
  return (purchases ?? []).some((p) =>
    (ALL_SKUS as readonly string[]).includes(p.productId)
  );
};

export const hasActiveDriverEntitlement = async (): Promise<boolean> => {
  if (!isIapSupported()) return false;
  try {
    const purchases = await getAvailablePurchases();
    return (purchases ?? []).some((p) =>
      (ALL_SKUS as readonly string[]).includes(p.productId)
    );
  } catch {
    return false;
  }
};
