/**
 * controllers/contractsController.js
 *
 * GET /api/contracts/my  — client only
 * Returns contracts that belong to the authenticated user.
 * user_id is sourced from the verified JWT — never from the request body.
 */

const contractsModel = require('../models/Contractsmodel');

async function listMy(req, res) {
  try {
    const contracts = await contractsModel.getContractsByUserId(req.user.id);
    return res.status(200).json({ count: contracts.length, contracts });
  } catch (err) {
    console.error('[Contracts] listMy error:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { listMy };