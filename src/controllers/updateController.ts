
import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import semver from 'semver';
import { logger } from '../utils/logger';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const APK_FILENAME = 'ems-app.apk';

/**
 * Check for updates
 * Expects 'currentVersion' in query query params
 */
export const checkUpdate = async (req: Request, res: Response) => {
    try {
        const currentVersion = req.query.currentVersion as string;

        // In a real scenario, you might store the latest version in DB or a config file.
        // For simplicity, we'll read a version file or metadata side-by-side with the APK.
        // Here, we assume a 'version.txt' file exists in uploads.
        const versionFilePath = path.join(UPLOADS_DIR, 'version.txt');

        if (!fs.existsSync(versionFilePath)) {
            return res.status(404).json({ updateAvailable: false, message: 'No update info found' });
        }

        const latestVersion = fs.readFileSync(versionFilePath, 'utf8').trim();

        if (!currentVersion || !semver.valid(currentVersion)) {
            return res.status(400).json({ error: 'Invalid currentVersion' });
        }

        if (semver.gt(latestVersion, currentVersion)) {
            res.json({
                updateAvailable: true,
                latestVersion,
                downloadUrl: `/api/update/download`,
                notes: 'New version available with performance improvements and bug fixes.'
            });
        } else {
            res.json({ updateAvailable: false });
        }

    } catch (error) {
        logger.error('Check update failed', { error });
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Download the APK
 */
export const downloadApp = async (req: Request, res: Response) => {
    const filePath = path.join(UPLOADS_DIR, APK_FILENAME);

    if (fs.existsSync(filePath)) {
        res.download(filePath, APK_FILENAME, (err) => {
            if (err) {
                logger.error('Download failed', { error: err });
            }
        });
    } else {
        res.status(404).json({ error: 'APK file not found' });
    }
};
