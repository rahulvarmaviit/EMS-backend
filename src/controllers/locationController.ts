// Location Controller
// Purpose: Office location management (Admin only) using Prisma

import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { validateCoordinates } from '../services/geoService';
import { logger } from '../utils/logger';

/**
 * GET /api/locations
 * List all office locations
 */
export async function listLocations(req: Request, res: Response): Promise<void> {
  try {
    const locations = await prisma.location.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: {
        locations: locations.map(loc => ({
          id: loc.id,
          name: loc.name,
          latitude: Number(loc.latitude),
          longitude: Number(loc.longitude),
          radius_meters: loc.radius_meters,
          is_active: loc.is_active,
          created_at: loc.created_at,
        })),
      },
    });
  } catch (error) {
    logger.error('List locations error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch locations',
    });
  }
}

/**
 * POST /api/locations
 * Create a new office location (Admin only)
 */
export async function createLocation(req: Request, res: Response): Promise<void> {
  try {
    const { name, latitude, longitude, radius_meters = 50 } = req.body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Location name is required',
      });
      return;
    }

    // Validate coordinates
    if (!validateCoordinates(latitude, longitude)) {
      res.status(400).json({
        success: false,
        error: 'Invalid GPS coordinates. Latitude must be -90 to 90, Longitude must be -180 to 180.',
      });
      return;
    }

    // Validate radius
    if (radius_meters < 1 || radius_meters > 1000) {
      res.status(400).json({
        success: false,
        error: 'Radius must be between 1 and 1000 meters',
      });
      return;
    }

    // Create location
    const newLocation = await prisma.location.create({
      data: {
        name: name.trim(),
        latitude,
        longitude,
        radius_meters,
      },
    });

    logger.info('Location created', {
      locationId: newLocation.id,
      name: name.trim(),
      createdBy: req.user?.userId,
    });

    res.status(201).json({
      success: true,
      message: 'Location created successfully',
      data: {
        location: {
          id: newLocation.id,
          name: newLocation.name,
          latitude: Number(newLocation.latitude),
          longitude: Number(newLocation.longitude),
          radius_meters: newLocation.radius_meters,
          created_at: newLocation.created_at,
        },
      },
    });
  } catch (error) {
    logger.error('Create location error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to create location',
    });
  }
}

/**
 * PATCH /api/locations/:id
 * Update office location (Admin only)
 */
export async function updateLocation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, radius_meters } = req.body;

    // Verify location exists
    const existingLocation = await prisma.location.findUnique({
      where: { id },
    });

    if (!existingLocation) {
      res.status(404).json({
        success: false,
        error: 'Location not found',
      });
      return;
    }

    // Build update data
    const updateData: any = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    }

    if (latitude !== undefined || longitude !== undefined) {
      // If updating coordinates, need both
      if ((latitude !== undefined) !== (longitude !== undefined)) {
        res.status(400).json({
          success: false,
          error: 'Both latitude and longitude must be provided together',
        });
        return;
      }

      if (!validateCoordinates(latitude, longitude)) {
        res.status(400).json({
          success: false,
          error: 'Invalid GPS coordinates',
        });
        return;
      }

      updateData.latitude = latitude;
      updateData.longitude = longitude;
    }

    if (radius_meters !== undefined) {
      if (radius_meters < 1 || radius_meters > 1000) {
        res.status(400).json({
          success: false,
          error: 'Radius must be between 1 and 1000 meters',
        });
        return;
      }

      updateData.radius_meters = radius_meters;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        success: false,
        error: 'No fields to update',
      });
      return;
    }

    const updatedLocation = await prisma.location.update({
      where: { id },
      data: updateData,
    });

    logger.info('Location updated', {
      locationId: id,
      updatedBy: req.user?.userId,
    });

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        location: {
          id: updatedLocation.id,
          name: updatedLocation.name,
          latitude: Number(updatedLocation.latitude),
          longitude: Number(updatedLocation.longitude),
          radius_meters: updatedLocation.radius_meters,
          is_active: updatedLocation.is_active,
        },
      },
    });
  } catch (error) {
    logger.error('Update location error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to update location',
    });
  }
}

/**
 * DELETE /api/locations/:id
 * Soft delete a location (Admin only)
 */
export async function deleteLocation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    try {
      await prisma.location.update({
        where: { id },
        data: { is_active: false },
      });
    } catch (e) {
      res.status(404).json({
        success: false,
        error: 'Location not found',
      });
      return;
    }

    logger.info('Location deleted', {
      locationId: id,
      deletedBy: req.user?.userId,
    });

    res.json({
      success: true,
      message: 'Location deleted successfully',
    });
  } catch (error) {
    logger.error('Delete location error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete location',
    });
  }
}

export default { listLocations, createLocation, updateLocation, deleteLocation };
