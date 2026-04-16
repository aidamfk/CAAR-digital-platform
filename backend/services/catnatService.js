'use strict';

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const pool    = require('../db');
const m       = require('../models/catnatModel');

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) throw new Error('FATAL: JWT_SECRET is not set.');

// ─── HELPERS ─────────────────────────────────────────────────

function _generateInsuranceNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand  = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  return `CAAR-${date}-${rand}`;
}

function _generatePolicyReference(quoteId) {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const padded = String(quoteId).padStart(6, '0');
  return `CAT-${date}-${padded}`;
}

function _getContractDates() {
  const start = new Date();
  const end   = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start_date: fmt(start), end_date: fmt(end) };
}

function _signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    SECRET_KEY,
    { expiresIn: '1d' }
  );
}

// ─── PREMIUM ─────────────────────────────────────────────────

function calculatePremium({
  declared_value,
  construction_type,
  is_seismic_compliant,
  is_commercial,
  extra_coverages,
}) {
  let premium = declared_value * 0.0004;

  if (construction_type === 'Villa') premium *= 1.2;
  if (!is_seismic_compliant) premium *= 1.3;
  if (is_commercial) premium *= 1.25;

  if (Array.isArray(extra_coverages)) {
    if (extra_coverages.includes('floods')) premium += 2000;
    if (extra_coverages.includes('storms')) premium += 1500;
    if (extra_coverages.includes('ground')) premium += 1800;
  }

  const taxes = premium * 0.19;
  return premium + taxes;
}

// ─── CREATE QUOTE ────────────────────────────────────────────

async function createQuote(data) {
  const {
    first_name, last_name, email, phone,
    construction_type, usage_type,
    built_area, num_floors,
    year_construction, declared_value,
    address, wilaya_id, city_id,
    is_seismic_compliant, has_notarial_deed, is_commercial,
    extra_coverages,
  } = data;

  const estimated_amount = calculatePremium({
    declared_value,
    construction_type,
    is_seismic_compliant,
    is_commercial,
    extra_coverages,
  });

  const product = await m.getCatnatProduct();
  if (!product) throw new Error('CATNAT product not found');

  const existingUser = await m.findUserByEmail(email);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let userId;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const tempPassword  = crypto.randomBytes(12).toString('hex');
      const password_hash = await bcrypt.hash(tempPassword, 12);
      userId = await m.createUser(conn, { first_name, last_name, email, password_hash, phone });
    }

    const existingClient = await m.findClientByUserId(userId);
    const clientId = existingClient
      ? existingClient.id
      : await m.createClient(conn, {
          user_id: userId,
          insurance_number: _generateInsuranceNumber(),
        });

    const propertyId = await m.createProperty(conn, {
      client_id: clientId,
      construction_type,
      usage_type,
      built_area,
      num_floors,
      year_construction,
      declared_value,
      address,
      wilaya_id,
      city_id,
      is_seismic_compliant,
      has_notarial_deed,
      is_commercial,
      extra_coverages,
    });

    const quoteId = await m.createQuote(conn, {
      client_id: clientId,
      property_id: propertyId,
      product_id: product.id,
      plan_id: null,
      estimated_amount,
    });

    // ✅ NOTIFICATION
    await conn.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, ?, ?, ?)`,
      [userId, 'Quote created', `Your CATNAT quote #${quoteId} has been created.`, 'info']
    );

    // ✅ AUDIT LOG
    await conn.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id)
       VALUES (?, ?, ?, ?)`,
      [userId, 'CREATE', 'QUOTE', quoteId]
    );

    await conn.commit();

    const token = _signToken({ id: userId, email });

    return { quote_id: quoteId, estimated_amount, token };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─── CONFIRM ─────────────────────────────────────────────────

async function confirmQuote(quoteId, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const quote = await m.getQuoteByIdForUpdate(conn, quoteId);
    if (!quote) throw new Error('Quote not found');
    if (quote.user_id !== userId) throw new Error('Forbidden');

    await m.updateQuoteStatus(conn, quoteId, 'confirmed');

    // ✅ NOTIFICATION
    await conn.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, ?, ?, ?)`,
      [userId, 'Quote confirmed', `Your quote #${quoteId} has been confirmed.`, 'success']
    );

    // ✅ AUDIT LOG
    await conn.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id)
       VALUES (?, ?, ?, ?)`,
      [userId, 'CONFIRM', 'QUOTE', quoteId]
    );

    await conn.commit();

    return { message: 'Quote confirmed', quote_id: quoteId };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─── PAYMENT ─────────────────────────────────────────────────

async function processPayment(quoteId, userId, documentData = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const quote = await m.getQuoteByIdForUpdate(conn, quoteId);
    if (!quote) throw new Error('Quote not found');
    if (quote.user_id !== userId) throw new Error('Forbidden');

    const { start_date, end_date } = _getContractDates();
    const policy_reference = _generatePolicyReference(quoteId);

    const contractId = await m.createContract(conn, {
      client_id: quote.client_id,
      property_id: quote.property_id,
      product_id: quote.product_id,
      plan_id: null,
      start_date,
      end_date,
      premium_amount: quote.estimated_amount,
      policy_reference,
    });

    await m.createPayment(conn, {
      contract_id: contractId,
      amount: quote.estimated_amount,
      payment_date: new Date().toISOString().slice(0, 10),
    });

    // ✅ NOTIFICATION
    await conn.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, ?, ?, ?)`,
      [userId, 'Payment successful', `Your policy ${policy_reference} is now active.`, 'success']
    );

    // ✅ AUDIT LOG
    await conn.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id)
       VALUES (?, ?, ?, ?)`,
      [userId, 'PAY', 'CONTRACT', contractId]
    );

    await conn.commit();

    return {
      message: 'Payment successful',
      contract_id: contractId,
      policy_reference,
      start_date,
      end_date,
      amount_paid: quote.estimated_amount,
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { createQuote, confirmQuote, processPayment };