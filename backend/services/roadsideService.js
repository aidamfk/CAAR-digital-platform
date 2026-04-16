/**
 * PATCH: roadsideService.js — createQuote notification hook
 *
 * Add this require at the top of roadsideService.js:
 *   const notificationService = require('./notificationService');
 *
 * Then, inside createQuote(), immediately after `await conn.commit();`
 * and before `const token = signToken(...)`, insert:
 *
 *   // ── NOTIFICATION: notify admins about new roadside subscription ────────
 *   try {
 *     const displayName = (first_name + ' ' + last_name).trim() || email;
 *     await notificationService.roadsideCreated(pool, {
 *       quote_id:    quoteId,
 *       client_name: displayName,
 *     });
 *   } catch (notifErr) {
 *     console.error('[Roadside] roadsideCreated notification failed:', notifErr.message);
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Below is the complete updated roadsideService.js with the hook already
 * applied so you can drop it in directly.
 */

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const pool   = require('../db');
const m      = require('../models/roadsideModel');
const notificationService = require('/notificationService');
const { createContractPDF } = require('../utils/pdfGenerator');
const { sendContractEmail } = require('../utils/mailer');
const SECRET_KEY = process.env.JWT_SECRET || 'SECRET_KEY_CAAR';

// ─── Helpers (unchanged) ─────────────────────────────────────────────────────

function generateInsuranceNumber() {
  const today = new Date();
  const date  = today.toISOString().slice(0, 10).replace(/-/g, '');
  const rand  = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  return `CAAR-${date}-${rand}`;
}

function generatePolicyReference(quoteId) {
  const today  = new Date();
  const date   = today.toISOString().slice(0, 10).replace(/-/g, '');
  const padded = String(quoteId).padStart(6, '0');
  return `RSA-${date}-${padded}`;
}

function getContractDates() {
  const start = new Date();
  const end   = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start_date: fmt(start), end_date: fmt(end) };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    SECRET_KEY,
    { expiresIn: '1d' }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE QUOTE  (notification added)
// ─────────────────────────────────────────────────────────────────────────────

async function createQuote({
  first_name, last_name, email, phone,
  license_plate, brand, model, year, wilaya, plan_id,
}) {
  const plan = await m.getPlanById(plan_id);
  if (!plan) {
    const err = new Error(`Plan with id ${plan_id} not found`);
    err.status = 404; throw err;
  }

  const product = await m.getRoadsideProduct();
  if (!product) {
    const err = new Error('Roadside Assistance product not found in database');
    err.status = 500; throw err;
  }

  const existingUser = await m.findUserByEmail(email);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let userId, userEmail = email, userRole = 'client', isNewUser = false;

    if (existingUser) {
      userId   = existingUser.id;
      userRole = existingUser.role;
    } else {
      const tempPassword  = crypto.randomBytes(12).toString('hex');
      const password_hash = await bcrypt.hash(tempPassword, 12);
      userId    = await m.createUser(conn, { first_name, last_name, email, password_hash, phone });
      isNewUser = true;
    }

    let clientId;
    const existingClient = isNewUser ? null : await m.findClientByUserId(userId);
    if (existingClient) {
      clientId = existingClient.id;
    } else {
      clientId = await m.createClient(conn, {
        user_id:          userId,
        insurance_number: generateInsuranceNumber(),
      });
    }

    const vehicleId = await m.createVehicle(conn, {
      client_id: clientId, license_plate, brand, model,
      year: parseInt(year, 10), wilaya,
    });

    const quoteId = await m.createQuote(conn, {
      client_id:        clientId,
      vehicle_id:       vehicleId,
      product_id:       product.id,
      plan_id:          parseInt(plan_id, 10),
      estimated_amount: plan.price,
    });

    await conn.commit();

    // ── NOTIFICATION: notify all admins about new roadside subscription ──
    try {
      const displayName = (first_name + ' ' + last_name).trim() || email;
      await notificationService.roadsideCreated(pool, {
        quote_id:    quoteId,
        client_name: displayName,
      });
    } catch (notifErr) {
      console.error('[Roadside] roadsideCreated notification failed:', notifErr.message);
    }

    const token = signToken({ id: userId, email: userEmail, role: userRole });

    return {
      quote_id:         quoteId,
      estimated_amount: parseFloat(plan.price),
      plan_name:        plan.name,
      token,
    };
  } catch (err) {
    await conn.rollback(); throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONFIRM QUOTE (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

async function confirmQuote(quoteId, authenticatedUserId) {
  const quote = await m.getQuoteById(quoteId);

  if (!quote) {
    const err = new Error('Quote not found'); err.status = 404; throw err;
  }
  if (quote.user_id !== authenticatedUserId) {
    const err = new Error('Forbidden: this quote does not belong to you');
    err.status = 403; throw err;
  }
  if (quote.status !== 'pending') {
    const err = new Error(`Quote cannot be confirmed (current status: ${quote.status})`);
    err.status = 409; throw err;
  }

  await m.updateQuoteStatus(quoteId, 'confirmed');
  return { message: 'Quote confirmed successfully', quote_id: quoteId };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PROCESS PAYMENT (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

async function processPayment(quoteId, authenticatedUserId, documentData = null) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const quote = await m.getQuoteByIdForUpdate(conn, quoteId);
    if (!quote) {
      const err = new Error('Quote not found'); err.status = 404; throw err;
    }
    if (quote.user_id !== authenticatedUserId) {
      const err = new Error('Forbidden: this quote does not belong to you');
      err.status = 403; throw err;
    }
    if (quote.status !== 'confirmed') {
      const err = new Error(
        `Quote cannot be paid (current status: ${quote.status}). Please confirm the quote first.`
      );
      err.status = 409; throw err;
    }

    const policy_reference          = generatePolicyReference(quoteId);
    const { start_date, end_date }  = getContractDates();
    const today                     = new Date().toISOString().slice(0, 10);

    const contractId = await m.createContract(conn, {
      client_id:      quote.client_id,
      vehicle_id:     quote.vehicle_id,
      product_id:     quote.product_id,
      plan_id:        quote.plan_id,
      start_date, end_date,
      premium_amount:  quote.estimated_amount,
      policy_reference,
    });

    await m.createPayment(conn, {
      contract_id:  contractId,
      amount:       quote.estimated_amount,
      payment_date: today,
    });

    if (documentData && documentData.file_name && documentData.file_path) {
      await m.createDocument(conn, {
        client_id:   quote.client_id,
        contract_id: contractId,
        file_name:   documentData.file_name,
        file_path:   documentData.file_path,
        file_type:   documentData.file_type || null,
      });
    }

    let user = null;
    try {
      const [userRows] = await conn.execute(
        `SELECT u.email, u.first_name, u.last_name
         FROM clients c JOIN users u ON c.user_id = u.id
         WHERE c.id = ?`,
        [quote.client_id]
      );
      user = userRows[0];
      const pdfBuffer = await createContractPDF({
        policy_reference,
        client_name: `${user.first_name} ${user.last_name}`,
        product_name: 'Roadside Assistance',
        start_date, end_date,
        amount: quote.estimated_amount,
      });
      sendContractEmail({ to: user.email, pdfBuffer, policy_reference })
        .catch(err => console.error('Email failed:', err));
    } catch (e) {
      console.warn('PDF/Email skipped:', e.message);
    }

    await m.createAuditLog(conn, {
      user_id:    authenticatedUserId,
      action:     'CREATE_CONTRACT',
      table_name: 'contracts',
      record_id:  contractId,
      description: `Roadside Assistance contract created via online payment. Quote #${quoteId}, Policy: ${policy_reference}`,
    });

    await m.updateQuoteStatusTx(conn, quoteId, 'accepted');
    await conn.commit();

    return {
      message:          'Payment processed successfully',
      policy_reference,
      contract_id:      contractId,
      start_date, end_date,
      amount_paid:      parseFloat(quote.estimated_amount),
    };
  } catch (err) {
    await conn.rollback(); throw err;
  } finally {
    conn.release();
  }
}

module.exports = { createQuote, confirmQuote, processPayment };