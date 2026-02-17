
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Get active quotes (public/app usage)
export const getActiveQuotes = async (req: Request, res: Response): Promise<void> => {
    try {
        const quotes = await prisma.quote.findMany({
            where: { is_active: true },
            orderBy: { created_at: 'desc' },
            select: { id: true, text: true, author: true }
        });

        res.json({ success: true, data: { quotes } });
    } catch (error) {
        logger.error('Error fetching active quotes', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to fetch quotes' });
    }
};

// Get all quotes (admin usage)
export const getAllQuotes = async (req: Request, res: Response): Promise<void> => {
    try {
        const quotes = await prisma.quote.findMany({
            orderBy: { created_at: 'desc' }
        });

        res.json({ success: true, data: { quotes } });
    } catch (error) {
        logger.error('Error fetching all quotes', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to fetch quotes' });
    }
};

// Create a new quote
export const createQuote = async (req: Request, res: Response): Promise<void> => {
    try {
        const { text, author } = req.body;

        if (!text) {
            res.status(400).json({ success: false, error: 'Quote text is required' });
            return;
        }

        const quote = await prisma.quote.create({
            data: {
                text,
                author,
                is_active: true,
                is_system: false
            }
        });

        logger.info('Quote created', { quoteId: quote.id });
        res.status(201).json({ success: true, data: { quote } });
    } catch (error) {
        logger.error('Error creating quote', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to create quote' });
    }
};

// Toggle quote active status
export const toggleQuoteStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            res.status(400).json({ success: false, error: 'isActive must be a boolean' });
            return;
        }

        const quote = await prisma.quote.update({
            where: { id },
            data: { is_active: isActive }
        });

        logger.info('Quote status updated', { quoteId: id, isActive });
        res.json({ success: true, data: { quote } });
    } catch (error) {
        logger.error('Error updating quote status', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to update quote status' });
    }
};

// Toggle all system quotes
export const toggleSystemQuotes = async (req: Request, res: Response): Promise<void> => {
    try {
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            res.status(400).json({ success: false, error: 'isActive must be a boolean' });
            return;
        }

        await prisma.quote.updateMany({
            where: { is_system: true },
            data: { is_active: isActive }
        });

        logger.info('System quotes toggled', { isActive });
        res.json({ success: true, message: `All system quotes set to ${isActive}` });
    } catch (error) {
        logger.error('Error toggling system quotes', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to update system quotes' });
    }
};

// Delete a quote
export const deleteQuote = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Check if it's a system quote (optional: prevent deletion of system quotes if desired)
        // For now, allow deletion but maybe warn? User requirement didn't specify.
        // Let's protect system quotes from deletion if is_system is true, just in case.

        const existingQuote = await prisma.quote.findUnique({ where: { id } });
        if (!existingQuote) {
            res.status(404).json({ success: false, error: 'Quote not found' });
            return;
        }

        if (existingQuote.is_system) {
            // Allow soft-delete or just toggle off? 
            // Requirement: "can on/off the present quotes also". So admin should just toggle system quotes, not delete them? 
            // I'll allow delete for custom quotes, but restrict system quotes to toggle only.
            res.status(403).json({ success: false, error: 'System quotes cannot be deleted, only toggled off.' });
            return;
        }

        await prisma.quote.delete({ where: { id } });

        logger.info('Quote deleted', { quoteId: id });
        res.json({ success: true, message: 'Quote deleted successfully' });
    } catch (error) {
        logger.error('Error deleting quote', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to delete quote' });
    }
};
