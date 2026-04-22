'use strict';

const pool    = require('../db');
const m       = require('../models/catnatModel');
const { createContractPDF } = require('../utils/pdfGenerator');
const { sendContractEmail } = require('../utils/mailer');
const {
  generateInsuranceNumber,
  generatePolicyReference,
  getAnnualContractDates,
  issueAuthToken,
} = require('../utils/subscriptionHelpers');

async function resolveOrCreateClientForUser(conn, authenticatedUserId) {
  const [userRows] = await conn.execute(
    `SELECT id, email, first_name, last_name, role, is_active, must_change_password
     FROM users
     WHERE id = ?
     FOR UPDATE`,
    [authenticatedUserId]
  );

  const user = userRows[0] || null;
  if (!user) {
    const err = new Error('Authenticated user not found');
    err.status = 401;
    throw err;
  }

  if (user.role !== 'client') {
    const err = new Error('Only client accounts can purchase subscriptions');
    err.status = 403;
    throw err;
  }

  if (!user.is_active) {
    const err = new Error('Your account is deactivated. Please contact support.');
    err.status = 403;
    throw err;
  }

  const [clientRows] = await conn.execute(
    'SELECT id FROM clients WHERE user_id = ? FOR UPDATE',
    [authenticatedUserId]
  );

  if (clientRows.length > 0) {
    return { user, client_id: clientRows[0].id };
  }

  const clientId = await m.createClient(conn, {
    user_id: authenticatedUserId,
    insurance_number: generateInsuranceNumber(),
  });

  return { user, client_id: clientId };
}

// ─── HELPERS ─────────────────────────────────────────────────

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

async function createQuote(data, authenticatedUserId) {
  const {
    client_id,
    first_name, last_name, email, phone,
    construction_type, usage_type,
    built_area, num_floors,
    year_construction, declared_value,
    address, wilaya_id, city_id,
    is_seismic_compliant, has_notarial_deed, is_commercial,
    extra_coverages,
  } = data;

  // Backend calculates premium — no plan dependency
  const estimated_amount = calculatePremium({
    declared_value,
    construction_type,
    is_seismic_compliant,
    is_commercial,
    extra_coverages,
  });

  const product = await m.getCatnatProduct();
  if (!product) throw new Error('CATNAT product not found');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const resolved = await resolveOrCreateClientForUser(conn, authenticatedUserId);
    const user = resolved.user;
    const resolvedClientId = resolved.client_id;

    if (typeof client_id !== 'undefined' && client_id !== null) {
      const requestedClientId = parseInt(client_id, 10);
      if (Number.isNaN(requestedClientId) || requestedClientId !== resolvedClientId) {
        const err = new Error('Forbidden: request client_id does not match authenticated account');
        err.status = 403;
        throw err;
      }
    }

    if (email && String(email).trim().toLowerCase() !== String(user.email).toLowerCase()) {
      const err = new Error('Forbidden: request email does not match authenticated account');
      err.status = 403;
      throw err;
    }

    console.info(
      `[CATNAT] createQuote user_id=${authenticatedUserId} resolved_client_id=${resolvedClientId}`
    );

    const propertyId = await m.createProperty(conn, {
      client_id: resolvedClientId,
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
      client_id:        resolvedClientId,
      property_id:      propertyId,
      product_id:       product.id,
      plan_id:          null,   // no plan for CATNAT — premium calculated server-side
      estimated_amount,
    });

    // Notification
    await conn.execute(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, ?, ?, ?)`,
      [authenticatedUserId, 'Quote created', `Your CATNAT quote #${quoteId} has been created.`, 'info']
    );

    // Audit log — use correct column names (table_name, record_id, description)
    await conn.execute(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
       VALUES (?, ?, ?, ?, ?)`,
      [authenticatedUserId, 'CREATE', 'quotes', quoteId, `CATNAT quote created for property_id=${propertyId}`]
    );

    await conn.commit();

    const token = issueAuthToken(user);

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

    // FIX: query must return user_id for ownership check
    const [rows] = await conn.execute(
      `SELECT q.*, c.user_id
       FROM quotes q
       JOIN clients c ON c.id = q.client_id
       WHERE q.id = ?
       FOR UPDATE`,
      [quoteId]
    );
    const quote = rows[0] || null;

    if (!quote) throw Object.assign(new Error('Quote not found'), { status: 404 });

    // FIX: ownership check
    if (quote.user_id !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

    // Only pending quotes can be confirmed
    if (quote.status !== 'pending') {
      throw Object.assign(
        new Error(`Quote cannot be confirmed (current status: ${quote.status})`),
        { status: 409 }
      );
    }

    await conn.execute(
      'UPDATE quotes SET status = ? WHERE id = ?',
      ['confirmed', quoteId]
    );

    // Notification
    await conn.execute(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, ?, ?, ?)`,
      [userId, 'Quote confirmed', `Your quote #${quoteId} has been confirmed.`, 'success']
    );

    // Audit log
    await conn.execute(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, 'CONFIRM', 'quotes', quoteId, `CATNAT quote #${quoteId} confirmed`]
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

async function processPayment(quoteId, userId, documentData = null, requestClientId = undefined) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // FIX: query must return user_id for ownership check
    const [rows] = await conn.execute(
      `SELECT q.*, c.user_id
       FROM quotes q
       JOIN clients c ON c.id = q.client_id
       WHERE q.id = ?
       FOR UPDATE`,
      [quoteId]
    );
    const quote = rows[0] || null;

    if (!quote) throw Object.assign(new Error('Quote not found'), { status: 404 });

    // FIX: ownership check
    if (quote.user_id !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

    const resolved = await resolveOrCreateClientForUser(conn, userId);
    const resolvedClientId = resolved.client_id;

    if (typeof requestClientId !== 'undefined' && requestClientId !== null) {
      const requestedClientId = parseInt(requestClientId, 10);
      if (Number.isNaN(requestedClientId) || requestedClientId !== resolvedClientId) {
        throw Object.assign(new Error('Forbidden: request client_id does not match authenticated account'), { status: 403 });
      }
    }

    if (quote.client_id !== resolvedClientId) {
      throw Object.assign(new Error('Forbidden: quote client binding mismatch for authenticated account'), { status: 403 });
    }

    // FIX: enforce status flow — must be confirmed before payment
    if (quote.status !== 'confirmed') {
      throw Object.assign(
        new Error(`Quote must be confirmed before payment (current status: ${quote.status})`),
        { status: 409 }
      );
    }

    // FIX: prevent duplicate contracts — check via property_id + client_id + product_id
    // Since contracts has no quote_id, we guard on property_id which is unique per quote
    if (quote.property_id) {
      const [existing] = await conn.execute(
        'SELECT id FROM contracts WHERE property_id = ? AND client_id = ? AND product_id = ?',
        [quote.property_id, resolvedClientId, quote.product_id]
      );
      if (existing.length > 0) {
        throw Object.assign(
          new Error('A contract already exists for this property and product'),
          { status: 409 }
        );
      }
    }

    const { start_date, end_date } = getAnnualContractDates();
    const policy_reference = generatePolicyReference('CAT', quoteId);

    const contractId = await m.createContract(conn, {
      client_id:      resolvedClientId,
      property_id:    quote.property_id,
      product_id:     quote.product_id,
      plan_id:        null,
      start_date,
      end_date,
      premium_amount: quote.estimated_amount,
      policy_reference,
    });

    await m.createPayment(conn, {
      contract_id:  contractId,
      amount:       quote.estimated_amount,
      payment_date: new Date().toISOString().slice(0, 10),
    });

    // Optional document
    if (documentData && documentData.file_name && documentData.file_path) {
      await m.createDocument(conn, {
        client_id:   resolvedClientId,
        contract_id: contractId,
        file_name:   documentData.file_name,
        file_path:   documentData.file_path,
        file_type:   documentData.file_type || null,
      });
    }
// 1. Get user email
const [userRows] = await conn.execute(
  `SELECT u.email, u.first_name, u.last_name
   FROM clients c
   JOIN users u ON c.user_id = u.id
   WHERE c.id = ?`,
  [resolvedClientId]
);

const user = userRows[0];

// 2. Generate PDF
const pdfBuffer = await createContractPDF({
  policy_reference,
  client_name: `${user.first_name} ${user.last_name}`,
  product_name: 'CATNAT Insurance',
  start_date,
  end_date,
  amount: quote.estimated_amount
});

// 3. Send email (DO NOT block payment)
await sendContractEmail({
  to: user.email,
  pdfBuffer,
  policy_reference
});
    // Notification
    await conn.execute(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, ?, ?, ?)`,
      [userId, 'Payment successful', `Your policy ${policy_reference} is now active.`, 'success']
    );

    // Audit log
    await conn.execute(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, 'CREATE_CONTRACT', 'contracts', contractId,
       `CATNAT contract created via online payment. Quote #${quoteId}, Policy: ${policy_reference}`]
    );

    // FIX: mark quote as accepted (not 'paid' — not a valid enum value)
    await conn.execute(
      'UPDATE quotes SET status = ? WHERE id = ?',
      ['accepted', quoteId]
    );

    console.info(
      `[CATNAT] processPayment user_id=${userId} resolved_client_id=${resolvedClientId} inserted_contract_client_id=${resolvedClientId} contract_id=${contractId}`
    );

    await conn.commit();

    return {
      message:        'Payment successful',
      contract_id:    contractId,
      policy_reference,
      start_date,
      end_date,
      amount_paid:    parseFloat(quote.estimated_amount),
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { createQuote, confirmQuote, processPayment };
