
import { Request, Response } from 'express';
import { prisma } from '../config/database';

export const submitScore = async (req: Request, res: Response) => {
    try {
        const { game_name, score, moves, time_taken, user_id } = req.body;

        if (!game_name || score === undefined || !user_id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const newScore = await prisma.gameScore.create({
            data: {
                game_name,
                score,
                moves,
                time_taken,
                user_id,
            },
        });

        res.status(201).json({
            success: true,
            data: newScore
        });
    } catch (error) {
        console.error('Error submitting score:', error);
        res.status(500).json({ error: 'Failed to submit score' });
    }
};

export const getLeaderboard = async (req: Request, res: Response) => {
    try {
        const { gameName } = req.params;

        if (!gameName) {
            return res.status(400).json({ error: 'Game name is required' });
        }

        // Get start of today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Fetch all scores for today
        const scoresToday = await prisma.gameScore.findMany({
            where: {
                game_name: gameName,
                played_at: {
                    gte: startOfDay,
                },
            },
            include: {
                user: {
                    select: {
                        full_name: true,
                    },
                },
            },
            orderBy: [
                { score: 'desc' },
                { time_taken: 'asc' },
            ],
        });

        // Group by user and keep best score
        const bestScoresMap = new Map();

        scoresToday.forEach((entry: any) => {
            if (!bestScoresMap.has(entry.user_id)) {
                bestScoresMap.set(entry.user_id, entry);
            }
            // Since we sorted by score desc, the first one encountered is the best.
            // If we wanted to be super safe we could compare, but orderBy handles it.
        });

        const leaderboard = Array.from(bestScoresMap.values());

        // Format the response
        const formattedLeaderboard = leaderboard.map((entry: any, index: number) => ({
            rank: index + 1,
            id: entry.id,
            name: entry.user.full_name,
            score: entry.score,
            moves: entry.moves,
            time: entry.time_taken,
            date: entry.played_at,
        }));

        res.json({
            success: true,
            data: formattedLeaderboard
        });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
};
