
import express from 'express';
import { submitScore, getLeaderboard } from '../controllers/gameController';

const router = express.Router();

router.post('/score', submitScore);
router.get('/leaderboard/:gameName', getLeaderboard);

export default router;
