'use strict';

const contractsModel = require('../models/contractsModel');

async function listMyContracts(userId) {
  return contractsModel.getContractsByUserId(userId);
}

module.exports = { listMyContracts };
