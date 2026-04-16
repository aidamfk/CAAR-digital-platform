'use strict';

const plansModel = require('../models/plansModel');

function normalizePlan(row) {
  return {
    ...row,
    price: parseFloat(row.price),
    is_popular: Boolean(row.is_popular),
    features:
      typeof row.features === 'string'
        ? JSON.parse(row.features)
        : row.features || [],
  };
}

async function listPlans({ product_id, product_name } = {}) {
  let normalizedProductId = null;
  let normalizedProductName = null;

  if (product_id != null && product_id !== '') {
    normalizedProductId = parseInt(product_id, 10);
    if (isNaN(normalizedProductId) || normalizedProductId < 1) {
      const err = new Error('product_id must be a positive integer');
      err.status = 400;
      throw err;
    }
  }

  if (typeof product_name === 'string' && product_name.trim()) {
    normalizedProductName = product_name.trim();
  }

  const plans = await plansModel.getPlans({
    product_id: normalizedProductId,
    product_name: normalizedProductName,
  });

  return plans.map(normalizePlan);
}

module.exports = { listPlans };
