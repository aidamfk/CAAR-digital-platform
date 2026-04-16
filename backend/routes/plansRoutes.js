'use strict';

const express = require('express');
const router = express.Router();
const plansController = require('../controllers/plansController');

router.get('/', plansController.list);

module.exports = router;
