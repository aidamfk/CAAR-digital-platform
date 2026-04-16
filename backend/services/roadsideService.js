/**
 * Roadside service layer.
 * Supports both the subscription quote/payment flow and
 * the contract-backed roadside assistance request workflow.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool   = require('../db');
const m      = require('../models/roadsideModel');
const notificationService = require('./notificationService');
const { createContractPDF } = require('../utils/pdfGenerator');
const { sendContractEmail } = require('../utils/mailer');
const {
  assertRoadsideRequestStatusTransition,
} = require('../utils/roadsideLifecycle');
const {
  generateInsuranceNumber,
  generatePolicyReference,
  getAnnualContractDates,
  issueAuthToken,
} = require('../utils/subscriptionHelpers');


function generateRoadsideRequestReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `RSA-REQ-${date}-${rand}`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 1. CREATE QUOTE  (notification added)

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

    // â”€â”€ NOTIFICATION: notify all admins about new roadside subscription â”€â”€
    try {
      const displayName = (first_name + ' ' + last_name).trim() || email;
      await notificationService.roadsideCreated(pool, {
        quote_id:    quoteId,
        client_name: displayName,
      });
    } catch (notifErr) {
      console.error('[Roadside] roadsideCreated notification failed:', notifErr.message);
    }

    const token = issueAuthToken({ id: userId, email: userEmail, role: userRole });

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 2. CONFIRM QUOTE (unchanged)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 3. PROCESS PAYMENT (unchanged)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    const policy_reference          = generatePolicyReference('RSA', quoteId);
    const { start_date, end_date }  = getAnnualContractDates();
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

async function createRoadsideRequest(
  {
    contract_id,
    problem_type,
    description,
    contact_phone,
    location_address,
    wilaya_code,
    city,
  },
  authenticatedUserId
) {
  const missing = [];
  if (!contract_id) missing.push('contract_id');
  if (!problem_type) missing.push('problem_type');
  if (!description) missing.push('description');
  if (!contact_phone) missing.push('contact_phone');
  if (!location_address) missing.push('location_address');
  if (!wilaya_code) missing.push('wilaya_code');

  if (missing.length) {
    const err = new Error(`Missing required fields: ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const contractIdNum = parseInt(contract_id, 10);
  if (isNaN(contractIdNum) || contractIdNum < 1) {
    const err = new Error('contract_id must be a positive integer');
    err.status = 400;
    throw err;
  }

  const normalizedProblemType = String(problem_type).trim();
  const normalizedDescription = String(description).trim();
  const normalizedPhone = String(contact_phone).trim();
  const normalizedAddress = String(location_address).trim();
  const normalizedWilaya = String(wilaya_code).trim();
  const normalizedCity = city ? String(city).trim() : null;

  if (normalizedProblemType.length < 3) {
    const err = new Error('problem_type must be at least 3 characters');
    err.status = 400;
    throw err;
  }

  if (normalizedDescription.length < 10) {
    const err = new Error('description must be at least 10 characters');
    err.status = 400;
    throw err;
  }

  if (normalizedPhone.length < 6) {
    const err = new Error('contact_phone must be at least 6 characters');
    err.status = 400;
    throw err;
  }

  if (!/^\d{1,3}$/.test(normalizedWilaya)) {
    const err = new Error('wilaya_code must be a numeric wilaya code');
    err.status = 400;
    throw err;
  }

  const contract = await m.getActiveRoadsideContractByIdAndUserId(
    contractIdNum,
    authenticatedUserId
  );
  if (!contract) {
    const err = new Error(
      'Contract not found, does not belong to your account, is not active, or is not a roadside assistance contract'
    );
    err.status = 403;
    throw err;
  }

  const requestReference = generateRoadsideRequestReference();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const requestId = await m.createRoadsideRequest(conn, {
      contract_id: contractIdNum,
      client_id: contract.client_id,
      request_reference: requestReference,
      problem_type: normalizedProblemType,
      contact_phone: normalizedPhone,
      location_address: normalizedAddress,
      wilaya_code: normalizedWilaya,
      city: normalizedCity,
      description: normalizedDescription,
    });

    await notificationService.roadsideRequestCreated(conn, {
      request_id: requestId,
      request_reference: requestReference,
      client_name: contract.client_name,
      contract_id: contractIdNum,
    });

    await conn.commit();

    return {
      request_id: requestId,
      request_reference: requestReference,
      contract_id: contractIdNum,
      status: 'pending',
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function listMyRoadsideRequests(authenticatedUserId) {
  return m.getRoadsideRequestsByUserId(authenticatedUserId);
}

async function listAllRoadsideRequests() {
  return m.getAllRoadsideRequests();
}

async function updateRoadsideRequestStatus(requestId, status) {
  const nextStatus = typeof status === 'string' ? status.trim() : status;
  if (!nextStatus) {
    const err = new Error('status is required');
    err.status = 400;
    throw err;
  }

  const request = await m.getRoadsideRequestById(requestId);
  if (!request) {
    const err = new Error('Roadside request not found');
    err.status = 404;
    throw err;
  }

  assertRoadsideRequestStatusTransition(request.status, nextStatus);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await m.updateRoadsideRequestStatusTx(conn, requestId, nextStatus);
    await notificationService.roadsideRequestStatusUpdated(conn, {
      request_id: requestId,
      request_reference: request.request_reference,
      new_status: nextStatus,
      client_user_id: request.user_id,
    });

    await conn.commit();

    return {
      request_id: requestId,
      request_reference: request.request_reference,
      status: nextStatus,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  createQuote,
  confirmQuote,
  processPayment,
  createRoadsideRequest,
  listMyRoadsideRequests,
  listAllRoadsideRequests,
  updateRoadsideRequestStatus,
};
