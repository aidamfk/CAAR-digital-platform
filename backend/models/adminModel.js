'use strict';

const pool = require('../db');

async function listExpertsForAssignment() {
  const [rows] = await pool.execute(
    `SELECT ex.id AS expert_id,
            ex.is_available,
            ex.specialization,
            ex.agency_id,
            ex.wilaya_id,
            u.id AS user_id,
            u.first_name,
            u.last_name,
            CONCAT(u.first_name, ' ', u.last_name) AS full_name,
            u.email,
            u.phone,
            u.is_active
     FROM experts ex
     JOIN users u ON u.id = ex.user_id
     WHERE u.role = 'expert'
     ORDER BY u.first_name, u.last_name`
  );

  return rows;
}

async function findUserByEmailTx(conn, email) {
  const [rows] = await conn.execute(
    'SELECT id FROM users WHERE email = ? FOR UPDATE',
    [email]
  );
  return rows[0] || null;
}

async function createExpertUserTx(conn, { first_name, last_name, email, password_hash }) {
  const [result] = await conn.execute(
    `INSERT INTO users
      (first_name, last_name, email, password_hash, role, is_active, must_change_password)
     VALUES (?, ?, ?, ?, 'expert', 1, 1)`,
    [first_name, last_name, email, password_hash]
  );
  return result.insertId;
}

async function findExpertByUserIdTx(conn, userId) {
  const [rows] = await conn.execute(
    'SELECT id FROM experts WHERE user_id = ? FOR UPDATE',
    [userId]
  );
  return rows[0] || null;
}

async function createExpertProfileTx(conn, { user_id, specialization }) {
  const [result] = await conn.execute(
    `INSERT INTO experts (user_id, specialization, is_available)
     VALUES (?, ?, 1)`,
    [user_id, specialization || null]
  );
  return result.insertId;
}

async function getExpertConsistencySnapshotTx(conn) {
  const [[orphans]] = await conn.execute(
    `SELECT COUNT(*) AS count
     FROM experts ex
     LEFT JOIN users u ON u.id = ex.user_id
     WHERE u.id IS NULL`
  );

  const [[duplicates]] = await conn.execute(
    `SELECT COUNT(*) AS count
     FROM (
       SELECT user_id
       FROM experts
       GROUP BY user_id
       HAVING COUNT(*) > 1
     ) dup`
  );

  const [[invalidRole]] = await conn.execute(
    `SELECT COUNT(*) AS count
     FROM experts ex
     JOIN users u ON u.id = ex.user_id
     WHERE u.role <> 'expert'`
  );

  return {
    orphan_experts: Number(orphans.count || 0),
    duplicate_expert_users: Number(duplicates.count || 0),
    experts_with_invalid_role: Number(invalidRole.count || 0),
  };
}

async function repairExpertConsistencyTx(conn) {
  const [orphanDelete] = await conn.execute(
    `DELETE ex
     FROM experts ex
     LEFT JOIN users u ON u.id = ex.user_id
     WHERE u.id IS NULL`
  );

  const [duplicateDelete] = await conn.execute(
    `DELETE ex
     FROM experts ex
     JOIN (
       SELECT user_id, MIN(id) AS keep_id
       FROM experts
       GROUP BY user_id
       HAVING COUNT(*) > 1
     ) d ON d.user_id = ex.user_id
        AND ex.id <> d.keep_id`
  );

  const [roleRepair] = await conn.execute(
    `UPDATE users u
     JOIN experts ex ON ex.user_id = u.id
     SET u.role = 'expert'
     WHERE u.role <> 'expert'`
  );

  return {
    removed_orphan_experts: Number(orphanDelete.affectedRows || 0),
    removed_duplicate_experts: Number(duplicateDelete.affectedRows || 0),
    repaired_user_roles: Number(roleRepair.affectedRows || 0),
  };
}

module.exports = {
  listExpertsForAssignment,
  findUserByEmailTx,
  createExpertUserTx,
  findExpertByUserIdTx,
  createExpertProfileTx,
  getExpertConsistencySnapshotTx,
  repairExpertConsistencyTx,
};
