const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const assuranceController = require('../controllers/assuranceController');

router.get('/', assuranceController.list);
router.get('/:id', assuranceController.getOne);
router.post('/', authMiddleware, roleMiddleware('admin'), assuranceController.create);
router.put('/:id', authMiddleware, roleMiddleware('admin'), assuranceController.update);
router.delete('/:id', authMiddleware, roleMiddleware('admin'), assuranceController.remove);

module.exports = router;
