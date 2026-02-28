/**
 * LumeFlow Payment Integration
 * 基于 Creem.io + Supabase
 */

// 配置常量
const PAYMENT_CONFIG = {
  SUPABASE_URL: 'https://egyvbbugupicfrqvfyah.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVneXZiYnVndXBpY2ZycXZmeWFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwODI3NTUsImV4cCI6MjA4NzY1ODc1NX0.q0mIu5wT8N3v25NWnZks7xqhvcj08WK-y1K8sdUQHr4',

  // Creem 产品配置
  PRODUCTS: {
    // 积分产品（一次性购买）
    credits_100: {
      id: 'prod_4LcwUgIZI8hZPsIx2J2bkM',
      type: 'credits',
      name: '100 Credits',
      price: 999,
      credits: 100,
    },
    credits_500: {
      id: 'prod_4LcwUgIZI8hZPsIx2J2bkM',
      type: 'credits',
      name: '500 Credits',
      price: 3999,
      credits: 500,
    },
    // 订阅产品
    subscription_monthly: {
      id: 'prod_UUqPJwEkQamn03zDPIzss',
      type: 'subscription',
      name: 'Pro Monthly',
      price: 999,
      billingPeriod: 'monthly',
    },
    subscription_yearly: {
      id: 'prod_UUqPJwEkQamn03zDPIzss',
      type: 'subscription',
      name: 'Pro Yearly',
      price: 9999,
      billingPeriod: 'yearly',
    },
  },
}

/**
 * 获取当前登录用户
 * @returns {object|null}
 */
function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

/**
 * 获取当前用户ID
 * @returns {string|null}
 */
function getCurrentUserId() {
  const user = getCurrentUser();
  return user ? user.id : null;
}

/**
 * 创建支付 Checkout
 * @param {string} productKey - 产品键名 (credits_100, credits_500, subscription_monthly, subscription_yearly)
 * @param {string} userId - 用户 UUID (可选，默认获取当前登录用户)
 * @param {object} options - 额外选项 (success_url, cancel_url)
 */
window.createCheckout = async function(productKey, userId = null, options = {}) {
  // 如果没有传入 userId，自动获取当前登录用户
  if (!userId) {
    userId = getCurrentUserId();
  }

  // 如果没有用户ID，使用临时ID（Creem会收集邮箱）
  if (!userId) {
    console.log('用户未登录，将使用临时标识');
    userId = 'guest_' + Date.now();
  }

  const product = PAYMENT_CONFIG.PRODUCTS[productKey]
  if (!product) {
    throw new Error(`Invalid product key: ${productKey}`)
  }

  const { success_url, cancel_url } = options

  const requestBody = {
    product_id: product.id,
    product_type: product.type,
    user_id: userId,
    success_url: success_url || window.location.origin + '/success',
    cancel_url: cancel_url || window.location.origin + '/cancel',
  }

  console.log('Creating checkout with:', requestBody)

  const response = await fetch(
    `${PAYMENT_CONFIG.SUPABASE_URL}/functions/v1/create-checkout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAYMENT_CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(requestBody),
    }
  )

  const data = await response.json()

  console.log('Checkout response:', response.status, data)

  if (data.checkout_url) {
    // 跳转到 Creem 支付页面
    window.location.href = data.checkout_url
    return data
  } else {
    throw new Error(data.error || 'Failed to create checkout')
  }
}

/**
 * 获取用户积分余额
 * @param {string} userId - 用户 UUID (可选，默认当前用户)
 * @returns {Promise<number>}
 */
async function getUserCredits(userId = null) {
  if (!userId) {
    userId = getCurrentUserId();
  }
  if (!userId) {
    return 0;
  }

  const response = await fetch(
    `${PAYMENT_CONFIG.SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${userId}`,
    {
      headers: {
        'Authorization': `Bearer ${PAYMENT_CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': PAYMENT_CONFIG.SUPABASE_ANON_KEY,
      },
    }
  )

  const data = await response.json()
  if (data && data.length > 0) {
    return data[0].balance
  }
  return 0
}

/**
 * 获取用户订阅状态
 * @param {string} userId - 用户 UUID (可选，默认当前用户)
 * @returns {Promise<object|null>}
 */
async function getUserSubscription(userId = null) {
  if (!userId) {
    userId = getCurrentUserId();
  }
  if (!userId) {
    return null;
  }

  const response = await fetch(
    `${PAYMENT_CONFIG.SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&status=eq.active`,
    {
      headers: {
        'Authorization': `Bearer ${PAYMENT_CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': PAYMENT_CONFIG.SUPABASE_ANON_KEY,
      },
    }
  )

  const data = await response.json()
  if (data && data.length > 0) {
    return data[0]
  }
  return null
}

/**
 * 获取用户购买历史
 * @param {string} userId - 用户 UUID (可选，默认当前用户)
 * @returns {Promise<array>}
 */
async function getPurchaseHistory(userId = null) {
  if (!userId) {
    userId = getCurrentUserId();
  }
  if (!userId) {
    return [];
  }

  const response = await fetch(
    `${PAYMENT_CONFIG.SUPABASE_URL}/rest/v1/credits?user_id=eq.${userId}&order=created_at.desc`,
    {
      headers: {
        'Authorization': `Bearer ${PAYMENT_CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': PAYMENT_CONFIG.SUPABASE_ANON_KEY,
      },
    }
  )

  return await response.json()
}

/**
 * 检查用户是否为 Pro 会员
 * @param {string} userId - 用户 UUID (可选，默认当前用户)
 * @returns {Promise<boolean>}
 */
async function isProMember(userId = null) {
  const subscription = await getUserSubscription(userId)
  return subscription !== null
}

/**
 * 扣除用户积分（用于视频生成）
 * @param {number} credits - 要扣除的积分数量
 * @param {string} userId - 用户 UUID (可选，默认当前用户)
 * @returns {Promise<boolean>}
 */
async function deductCredits(credits, userId = null) {
  if (!userId) {
    userId = getCurrentUserId();
  }
  if (!userId) {
    return false;
  }

  // 先检查余额
  const balance = await getUserCredits(userId)
  if (balance < credits) {
    return false
  }

  // 调用 RPC 函数扣除积分
  const response = await fetch(
    `${PAYMENT_CONFIG.SUPABASE_URL}/rest/v1/user_credits`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAYMENT_CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': PAYMENT_CONFIG.SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        balance: balance - credits,
      }),
    }
  )

  return response.ok
}

// 便捷函数：简化调用
// 购买积分（自动获取当前用户）
window.buyCredits = function(productKey) {
  return createCheckout(productKey);
};

// 购买订阅（自动获取当前用户）
window.buySubscription = function(productKey) {
  return createCheckout(productKey);
};

// 检查当前用户是否已登录
window.isLoggedIn = function() {
  return getCurrentUserId() !== null;
};

// 导出所有函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PAYMENT_CONFIG,
    getCurrentUser,
    getCurrentUserId,
    createCheckout,
    getUserCredits,
    getUserSubscription,
    getPurchaseHistory,
    isProMember,
    deductCredits,
    buyCredits,
    buySubscription,
    isLoggedIn,
  }
}
