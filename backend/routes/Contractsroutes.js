/**
 * routes/contractsRoutes.js
 *
 * GET /api/contracts/my  — client only (JWT required)
 *
 * This endpoint is intentionally minimal — the client dashboard
 * only needs to list the user's own contracts so it can pick a
 * valid contract_id before creating a claim.
 */

const express        = require('express');
const router         = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const requireRole    = require('../middleware/roleMiddleware');
const ctrl           = require('../controllers/Contractscontroller');

// GET /api/contracts/my
router.get('/my', authMiddleware, requireRole('client'), ctrl.listMy);

module.exports = router;