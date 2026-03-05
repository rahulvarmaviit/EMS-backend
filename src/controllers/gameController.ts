
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
        });

        // Group by user and keep best score
        const bestScoresMap = new Map();

        scoresToday.forEach((entry: any) => {
            if (!bestScoresMap.has(entry.user_id)) {
                bestScoresMap.set(entry.user_id, entry);
            } else {
                const existing = bestScoresMap.get(entry.user_id);
                // For Memory Match, lower moves is better. For standard, higher score is better.
                // Assuming sorting by highest score generally, and then lowest moves/time
                if (entry.score > existing.score) {
                    bestScoresMap.set(entry.user_id, entry);
                } else if (entry.score === existing.score) {
                    if (entry.moves !== null && existing.moves !== null && entry.moves < existing.moves) {
                        bestScoresMap.set(entry.user_id, entry);
                    } else if (entry.time_taken !== null && existing.time_taken !== null && entry.time_taken < existing.time_taken) {
                        bestScoresMap.set(entry.user_id, entry);
                    }
                }
            }
        });

        const leaderboard = Array.from(bestScoresMap.values()).sort((a: any, b: any) => {
            if (b.score !== a.score) {
                return b.score - a.score; // Highest score first
            }
            if (a.moves !== null && b.moves !== null && a.moves !== b.moves) {
                return a.moves - b.moves; // Lowest moves first
            }
            if (a.time_taken !== null && b.time_taken !== null && a.time_taken !== b.time_taken) {
                return a.time_taken - b.time_taken; // Lowest time first
            }
            return 0;
        });

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
