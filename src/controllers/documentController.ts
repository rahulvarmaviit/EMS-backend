import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const uploadDocument = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { title } = req.body;
        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const existingDoc = await prisma.document.findFirst({
            where: {
                user_id: userId,
                title: title
            }
        });

        if (existingDoc) {
            // Update existing document
            const document = await prisma.document.update({
                where: { id: existingDoc.id },
                data: {
                    file_path: req.file.path,
                    uploaded_at: new Date()
                }
            });
            return res.status(200).json({ message: 'Document updated successfully', document });
        } else {
            // Create new
            const document = await prisma.document.create({
                data: {
                    title,
                    file_path: req.file.path,
                    user_id: userId,
                },
            });
            return res.status(201).json({ message: 'Document uploaded successfully', document });
        }

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
};

export const getDocuments = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const documents = await prisma.document.findMany({
            where: {
                user_id: userId,
            },
            orderBy: {
                uploaded_at: 'desc',
            },
        });

        res.json(documents);
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
};
// Get user documents (Admin/Lead access)
export const getUserDocuments = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const requesterRole = req.user?.role;
        const requesterId = req.user?.userId;

        // Verify permissions
        if (requesterRole !== 'POSTGRES_SQL' && requesterRole !== 'ADMIN' && requesterRole !== 'LEAD') {
            return res.status(403).json({ error: 'Unauthorized access' });
        }

        // If Lead, verify team membership (optional strict check, skipping for now to match other endpoints pattern or check team logic if needed)
        // For simplicity, allowing Admin/Lead to fetch usage logic similar to attendance

        const documents = await prisma.document.findMany({
            where: {
                user_id: userId,
            },
            orderBy: {
                uploaded_at: 'desc',
            },
        });

        res.json({
            success: true,
            data: {
                documents
            }
        });
    } catch (error) {
        console.error('Get user documents error:', error);
        res.status(500).json({ error: 'Failed to fetch user documents' });
    }
};

// Download document
import fs from 'fs';
import path from 'path';

export const downloadDocument = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        const userRole = req.user?.role;

        const document = await prisma.document.findUnique({
            where: { id },
        });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Verify access: Owner OR Admin OR Lead
        if (document.user_id !== userId && userRole !== 'POSTGRES_SQL' && userRole !== 'ADMIN' && userRole !== 'LEAD') {
            return res.status(403).json({ error: 'Unauthorized access' });
        }

        const filePath = path.resolve(document.file_path);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        res.download(filePath, document.title + path.extname(document.file_path));
    } catch (error) {
        console.error('Download document error:', error);
        res.status(500).json({ error: 'Failed to download document' });
    }
};
