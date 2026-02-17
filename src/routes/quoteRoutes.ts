
import { Router } from 'express';
import { getActiveQuotes, getAllQuotes, createQuote, toggleQuoteStatus, toggleSystemQuotes, deleteQuote } from '../controllers/quoteController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Public/App route - get active quotes
router.get('/', authenticate, getActiveQuotes);

// Admin routes
router.get('/all', authenticate, authorize('ADMIN', 'POSTGRES_SQL'), getAllQuotes);
router.post('/', authenticate, authorize('ADMIN', 'POSTGRES_SQL'), createQuote);
router.patch('/system/toggle', authenticate, authorize('ADMIN', 'POSTGRES_SQL'), toggleSystemQuotes);
router.patch('/:id/status', authenticate, authorize('ADMIN', 'POSTGRES_SQL'), toggleQuoteStatus);
router.delete('/:id', authenticate, authorize('ADMIN', 'POSTGRES_SQL'), deleteQuote);

export default router;
