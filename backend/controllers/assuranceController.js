'use strict';

const assuranceService = require('../services/assuranceService');

async function list(req, res) {
  try {
    const products = await assuranceService.listProducts();
    return res.status(200).json(products);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function getOne(req, res) {
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId) || productId < 1) {
    return res.status(400).json({ error: 'id must be a positive integer' });
  }

  try {
    const product = await assuranceService.getProduct(productId);
    return res.status(200).json(product);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function create(req, res) {
  try {
    const product = await assuranceService.createProduct(req.body);
    return res.status(201).json({
      message: "Produit d'assurance ajoute",
      product,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function update(req, res) {
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId) || productId < 1) {
    return res.status(400).json({ error: 'id must be a positive integer' });
  }

  try {
    const product = await assuranceService.updateProduct(productId, req.body);
    return res.status(200).json({
      message: 'Produit modifie',
      product,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function remove(req, res) {
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId) || productId < 1) {
    return res.status(400).json({ error: 'id must be a positive integer' });
  }

  try {
    await assuranceService.deleteProduct(productId);
    return res.status(200).json({ message: 'Produit supprime' });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { list, getOne, create, update, remove };
