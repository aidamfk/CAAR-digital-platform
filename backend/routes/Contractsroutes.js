const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const contractsController = require('../controllers/contractsController');

router.get('/my', authMiddleware, requireRole('client'), contractsController.listMy);

module.exports = router;
