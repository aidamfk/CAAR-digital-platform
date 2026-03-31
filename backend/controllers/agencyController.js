const agencyModel = require('../models/agencyModel');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agencies  — public
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all agencies with coordinates.
 * latitude and longitude are cast to DOUBLE in the model, so they arrive
 * here already as numbers — no extra conversion needed.
 */
async function list(req, res) {
  try {
    const agencies = await agencyModel.getAllAgencies();
    return res.status(200).json(agencies);
  } catch (err) {
    console.error('[Agencies] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { list };