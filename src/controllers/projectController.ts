import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Get active projects (for work log dropdown)
export const getActiveProjects = async (req: Request, res: Response): Promise<void> => {
    try {
        const projects = await prisma.project.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
            select: { id: true, name: true }
        });

        res.json({ success: true, data: { projects } });
    } catch (error) {
        logger.error('Error fetching active projects', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to fetch projects' });
    }
};

// Get all projects (admin)
export const getAllProjects = async (req: Request, res: Response): Promise<void> => {
    try {
        const projects = await prisma.project.findMany({
            orderBy: { created_at: 'desc' }
        });

        res.json({ success: true, data: { projects } });
    } catch (error) {
        logger.error('Error fetching all projects', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to fetch projects' });
    }
};

// Create a new project
export const createProject = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            res.status(400).json({ success: false, error: 'Project name is required' });
            return;
        }

        const existing = await prisma.project.findUnique({ where: { name: name.trim() } });
        if (existing) {
            res.status(409).json({ success: false, error: 'A project with this name already exists' });
            return;
        }

        const project = await prisma.project.create({
            data: { name: name.trim(), is_active: true }
        });

        logger.info('Project created', { projectId: project.id, name: project.name });
        res.status(201).json({ success: true, data: { project } });
    } catch (error) {
        logger.error('Error creating project', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to create project' });
    }
};

// Update project name
export const updateProject = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name || !name.trim()) {
            res.status(400).json({ success: false, error: 'Project name is required' });
            return;
        }

        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }

        // Check for duplicate name (excluding current project)
        const duplicate = await prisma.project.findFirst({
            where: { name: name.trim(), id: { not: id } }
        });
        if (duplicate) {
            res.status(409).json({ success: false, error: 'A project with this name already exists' });
            return;
        }

        const project = await prisma.project.update({
            where: { id },
            data: { name: name.trim() }
        });

        logger.info('Project updated', { projectId: id, newName: name });
        res.json({ success: true, data: { project } });
    } catch (error) {
        logger.error('Error updating project', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to update project' });
    }
};

// Toggle project active status
export const toggleProjectStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            res.status(400).json({ success: false, error: 'isActive must be a boolean' });
            return;
        }

        const project = await prisma.project.update({
            where: { id },
            data: { is_active: isActive }
        });

        logger.info('Project status toggled', { projectId: id, isActive });
        res.json({ success: true, data: { project } });
    } catch (error) {
        logger.error('Error toggling project status', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to update project status' });
    }
};

// Delete a project
export const deleteProject = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }

        await prisma.project.delete({ where: { id } });

        logger.info('Project deleted', { projectId: id });
        res.json({ success: true, message: 'Project deleted successfully' });
    } catch (error) {
        logger.error('Error deleting project', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to delete project' });
    }
};
