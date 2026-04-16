'use strict';

const plansService = require('../services/plansService');

async function list(req, res) {
  try {
    const plans = await plansService.listPlans({
      product_id: req.query.product_id,
      product_name: req.query.product_name,
    });

    return res.status(200).json({ count: plans.length, plans });
  } catch (err) {
    console.error('[Plans] list error:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { list };
