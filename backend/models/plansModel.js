'use strict';

const pool = require('../db');

async function getPlans({ product_id, product_name } = {}) {
  const conditions = ['pl.is_active = 1', 'pr.is_active = 1'];
  const params = [];

  if (product_id) {
    conditions.push('pr.id = ?');
    params.push(product_id);
  }

  if (product_name) {
    conditions.push('pr.name = ?');
    params.push(product_name);
  }

  const [rows] = await pool.execute(
    `SELECT
       pl.id,
       pl.name,
       pl.price,
       pl.description,
       pl.features,
       pl.is_popular,
       pr.id AS product_id,
       pr.name AS product_name,
       pr.insurance_type
     FROM plans pl
     JOIN products pr ON pr.id = pl.product_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY pr.id ASC, pl.price ASC`,
    params
  );

  return rows;
}

module.exports = { getPlans };
