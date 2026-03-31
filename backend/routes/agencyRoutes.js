
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/agencyController');

// IMPORTANT: No auth middleware here
router.get('/', ctrl.list);

module.exports = router;