import { storage } from "./storage";

/**
 * Canonical entitlement check - single source of truth for "is user paid/active?"
 * Mirrors the full logic of /api/access-status so that /api/usage, /api/daily-limits,
 * and any other endpoint that needs to know "paid vs free" all agree.
 */

export interface AccessEntitlement {
  hasActiveSubscription: boolean;  // effectively unlimited (don't show CTA)
  isExpired: boolean;              // effectively expired
  source: 'saas' | 'reseller' | 'none';
  planName: string | null;         // "Plano Revenda" or SaaS plan name
}

export async function getAccessEntitlement(userId: string): Promise<AccessEntitlement> {
  const subscription = await storage.getUserSubscription(userId);
  const resellerClient = await storage.getResellerClientByUserId(userId);

  const now = new Date();

  // ---- SaaS evaluation ----
  const subscriptionIsActive = subscription?.status === 'active';
  const subscriptionExpiredByDataFim = subscription?.dataFim
    ? new Date(subscription.dataFim) < now
    : false;
  const saasHasActive = subscriptionIsActive && !subscriptionExpiredByDataFim;

  // ---- Reseller evaluation (takes priority if exists) ----
  if (resellerClient) {
    let reseller: any = null;
    try {
      reseller = await storage.getReseller(resellerClient.resellerId);
    } catch (e) {
      // If reseller lookup fails, fall through to SaaS logic
    }

    // Cascading block: reseller itself is blocked
    if (reseller?.resellerStatus === 'blocked') {
      return {
        hasActiveSubscription: false,
        isExpired: true,
        source: 'reseller',
        planName: 'Plano Revenda',
      };
    }

    // Free client of reseller is always active (unless reseller blocked - handled above)
    if (resellerClient.isFreeClient) {
      return {
        hasActiveSubscription: true,
        isExpired: false,
        source: 'reseller',
        planName: 'Plano Revenda',
      };
    }

    // Reseller client with suspended/cancelled/blocked status
    if (
      resellerClient.status === 'suspended' ||
      resellerClient.status === 'cancelled' ||
      resellerClient.status === 'blocked'
    ) {
      return {
        hasActiveSubscription: false,
        isExpired: true,
        source: 'reseller',
        planName: 'Plano Revenda',
      };
    }

    // Reseller client with active status - check payment dates
    if (resellerClient.status === 'active') {
      // PRIORITY: Check saasPaidUntil (granular payments)
      if (resellerClient.saasPaidUntil) {
        const paidUntil = new Date(resellerClient.saasPaidUntil);
        const expired = now > paidUntil;
        return {
          hasActiveSubscription: !expired,
          isExpired: expired,
          source: 'reseller',
          planName: 'Plano Revenda',
        };
      }

      // FALLBACK: Check nextPaymentDate with 5-day tolerance
      if (resellerClient.nextPaymentDate) {
        const nextPayment = new Date(resellerClient.nextPaymentDate);
        const daysOverdue = Math.floor(
          (now.getTime() - nextPayment.getTime()) / (1000 * 60 * 60 * 24)
        );
        const expired = daysOverdue > 5;
        return {
          hasActiveSubscription: !expired,
          isExpired: expired,
          source: 'reseller',
          planName: 'Plano Revenda',
        };
      }

      // No payment date info - permissive fallback (same spirit as /api/access-status)
      return {
        hasActiveSubscription: true,
        isExpired: false,
        source: 'reseller',
        planName: 'Plano Revenda',
      };
    }
  }

  // ---- SaaS only (no reseller) ----
  if (saasHasActive) {
    return {
      hasActiveSubscription: true,
      isExpired: false,
      source: 'saas',
      planName: subscription?.plan?.nome ?? null,
    };
  }

  // Subscription exists but is expired or inactive
  if (subscription) {
    return {
      hasActiveSubscription: false,
      isExpired: true,
      source: 'saas',
      planName: subscription?.plan?.nome ?? null,
    };
  }

  // No subscription at all, no reseller - free/trial user
  return {
    hasActiveSubscription: false,
    isExpired: false,
    source: 'none',
    planName: null,
  };
}
