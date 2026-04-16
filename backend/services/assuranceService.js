'use strict';

const assuranceModel = require('../models/assuranceModel');

function normalizeProduct(row) {
  return {
    ...row,
    base_price: row.base_price == null ? null : parseFloat(row.base_price),
    is_active: row.is_active == null ? undefined : Boolean(row.is_active),
  };
}

function normalizeBasePrice(basePrice) {
  const value = basePrice == null || basePrice === '' ? 0 : parseFloat(basePrice);
  if (isNaN(value) || value < 0) {
    const err = new Error('base_price must be a non-negative number');
    err.status = 400;
    throw err;
  }
  return value;
}

async function listProducts() {
  const products = await assuranceModel.getAllProducts();
  return products.map(normalizeProduct);
}

async function getProduct(productId) {
  const product = await assuranceModel.getProductById(productId);
  if (!product) {
    const err = new Error('Produit non trouve');
    err.status = 404;
    throw err;
  }
  return normalizeProduct(product);
}

async function createProduct({ name, description, insurance_type, base_price }) {
  if (!name || !description) {
    const err = new Error('name et description sont obligatoires');
    err.status = 400;
    throw err;
  }

  const productId = await assuranceModel.createProduct({
    name: name.trim(),
    description: description.trim(),
    insurance_type: insurance_type ? insurance_type.trim() : null,
    base_price: normalizeBasePrice(base_price),
  });

  return getProduct(productId);
}

async function updateProduct(productId, { name, description, insurance_type, base_price }) {
  if (!name || !description) {
    const err = new Error('name et description sont obligatoires');
    err.status = 400;
    throw err;
  }

  const affectedRows = await assuranceModel.updateProduct(productId, {
    name: name.trim(),
    description: description.trim(),
    insurance_type: insurance_type ? insurance_type.trim() : null,
    base_price: normalizeBasePrice(base_price),
  });

  if (!affectedRows) {
    const err = new Error('Produit non trouve');
    err.status = 404;
    throw err;
  }

  return getProduct(productId);
}

async function deleteProduct(productId) {
  const affectedRows = await assuranceModel.deleteProduct(productId);
  if (!affectedRows) {
    const err = new Error('Produit non trouve');
    err.status = 404;
    throw err;
  }
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
};
