/** Fields of a user record that are safe to send to the browser. */
export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    plan: user.plan,
    subscriptionStatus: user.subscription_status,
    hasBillingAccount: Boolean(user.stripe_customer_id),
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  };
}
