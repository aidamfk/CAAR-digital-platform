'use strict';

const pool = require('../db');
const { generateInsuranceNumber } = require('../utils/subscriptionHelpers');

async function findByEmail(email) {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT id, first_name, last_name, email, phone, role, created_at
     FROM users
     WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function createUser({ first_name, last_name, email, password_hash, phone, role }) {
  const [result] = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, phone, role)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [first_name, last_name, email, password_hash, phone || null, role || 'client']
  );
  return result.insertId;
}

async function createClient(userId) {
  const [result] = await pool.query(
    'INSERT INTO clients (user_id, insurance_number) VALUES (?, ?)',
    [userId, generateInsuranceNumber()]
  );
  return result.insertId;
}

async function updateProfile(userId, { first_name, last_name, email, phone }) {
  await pool.query(
    `UPDATE users
     SET first_name = ?, last_name = ?, email = ?, phone = ?
     WHERE id = ?`,
    [first_name, last_name, email, phone || null, userId]
  );
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  createClient,
  updateProfile,
};
