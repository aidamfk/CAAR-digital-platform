/**
 * routes/messageRoutes.js
 *
 * POST /api/messages          — public  (submit a contact message)
 *                               optionally authenticated — attaches sender identity
 * GET  /api/messages/my       — authenticated client/user (own messages)
 * GET  /api/messages          — admin   (list all messages)
 * GET  /api/messages/:id      — admin   (get one message)
 * PATCH /api/messages/:id/status — admin (update status)
 */

const express        = require('express');
const router         = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const requireRole    = require('../middleware/roleMiddleware');
const ctrl           = require('../controllers/messageController');

// ── Optional-auth helper ──────────────────────────────────────────────────────
// Tries to verify the JWT; if it's missing or invalid, silently continues.
// This lets POST /api/messages work for both guests and logged-in users.
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  const jwt       = require('jsonwebtoken');
  const SECRET    = process.env.JWT_SECRET;
  if (!SECRET) return next(); // misconfigured — treat as guest

  try {
    req.user = jwt.verify(authHeader.split(' ')[1], SECRET);
  } catch (_) {
    // expired / invalid — treat as guest
  }
  next();
}

// ── Public (with optional identity capture) ───────────────────────────────────
// POST /api/messages
// Body: { name, email, subject, message }
router.post('/', optionalAuth, ctrl.submit);

// ── Authenticated — any logged-in user ───────────────────────────────────────
// GET /api/messages/my
// Returns only messages submitted by the current user
router.get('/my', authMiddleware, ctrl.listMy);

// ── Admin only ────────────────────────────────────────────────────────────────
// GET /api/messages
router.get('/', authMiddleware, requireRole('admin'), ctrl.list);

// GET /api/messages/:id
router.get('/:id', authMiddleware, requireRole('admin'), ctrl.getOne);

// PATCH /api/messages/:id/status
// Body: { status }
router.patch('/:id/status', authMiddleware, requireRole('admin'), ctrl.updateStatus);

module.exports = router;