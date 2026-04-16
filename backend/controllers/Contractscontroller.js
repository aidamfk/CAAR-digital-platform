'use strict';

const contractsService = require('../services/contractsService');

async function listMy(req, res) {
  try {
    const contracts = await contractsService.listMyContracts(req.user.id);
    return res.status(200).json({ count: contracts.length, contracts });
  } catch (err) {
    console.error('[Contracts] listMy error:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { listMy };
