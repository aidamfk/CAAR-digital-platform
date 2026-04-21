'use strict';

const bcrypt = require('bcryptjs');
const pool = require('../db');
const adminModel = require('../models/adminModel');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateTemporaryPassword() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `Exp@${rand}`;
}

function normalizeCreateExpertInput(payload) {
  const first_name = (payload.first_name || '').trim();
  const last_name = (payload.last_name || '').trim();
  const email = (payload.email || '').trim().toLowerCase();
  const specializationRaw = payload.specialization;

  const specialization =
    typeof specializationRaw === 'string' && specializationRaw.trim()
      ? specializationRaw.trim()
      : null;

  if (!first_name || !last_name || !email) {
    const err = new Error('first_name, last_name and email are required');
    err.status = 400;
    throw err;
  }

  if (!EMAIL_REGEX.test(email)) {
    const err = new Error('Invalid email format');
    err.status = 400;
    throw err;
  }

  if (first_name.length > 100 || last_name.length > 100 || email.length > 255) {
    const err = new Error('Input exceeds maximum allowed length');
    err.status = 400;
    throw err;
  }

  if (specialization && specialization.length > 120) {
    const err = new Error('specialization must be 120 characters or less');
    err.status = 400;
    throw err;
  }

  return { first_name, last_name, email, specialization };
}

async function runExpertConsistencyCheck() {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const before = await adminModel.getExpertConsistencySnapshotTx(conn);
    const repairs = await adminModel.repairExpertConsistencyTx(conn);
    const after = await adminModel.getExpertConsistencySnapshotTx(conn);

    await conn.commit();

    return { before, repairs, after };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function createExpert(payload) {
  const input = normalizeCreateExpertInput(payload);
  const temporaryPassword = generateTemporaryPassword();
  const password_hash = await bcrypt.hash(temporaryPassword, 12);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Keep expert domain data healthy before inserting new records.
    await adminModel.repairExpertConsistencyTx(conn);

    const existingUser = await adminModel.findUserByEmailTx(conn, input.email);
    if (existingUser) {
      const err = new Error('Email already in use');
      err.status = 409;
      throw err;
    }

    const userId = await adminModel.createExpertUserTx(conn, {
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      password_hash,
    });

    const existingExpert = await adminModel.findExpertByUserIdTx(conn, userId);
    if (existingExpert) {
      const err = new Error('Expert already exists for this user');
      err.status = 409;
      throw err;
    }

    const expertId = await adminModel.createExpertProfileTx(conn, {
      user_id: userId,
      specialization: input.specialization,
    });

    await conn.commit();

    return {
      user_id: userId,
      expert_id: expertId,
      temporary_password: temporaryPassword,
    };
  } catch (err) {
    await conn.rollback();

    if (err && err.code === 'ER_DUP_ENTRY') {
      const dupErr = new Error('Duplicate data detected while creating expert');
      dupErr.status = 409;
      throw dupErr;
    }

    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  createExpert,
  runExpertConsistencyCheck,
};
