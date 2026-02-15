// Geo-calculation Service
// Purpose: Calculate distances and validate geofences using Haversine formula

import { logger } from '../utils/logger';

// Earth's radius in meters
const EARTH_RADIUS_METERS = 6371000;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * This is the standard formula for calculating great-circle distance on a sphere
 * 
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  // Convert to radians
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);

  // Haversine formula
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Distance in meters
  const distance = EARTH_RADIUS_METERS * c;
  
  return Math.round(distance); // Round to nearest meter
}

/**
 * Location object with coordinates and radius
 */
export interface GeoLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

/**
 * Check if a point is within any of the allowed geofences
 * Returns the matching location if found, null otherwise
 * 
 * @param userLat - User's current latitude
 * @param userLon - User's current longitude
 * @param locations - Array of allowed office locations
 * @returns Matching location or null
 */
export function isWithinGeofence(
  userLat: number,
  userLon: number,
  locations: GeoLocation[]
): GeoLocation | null {
  for (const location of locations) {
    const distance = calculateDistance(
      userLat,
      userLon,
      location.latitude,
      location.longitude
    );
    
    logger.debug('Geofence check', {
      location: location.name,
      distance,
      radius: location.radius_meters,
      withinRange: distance <= location.radius_meters,
    });
    
    if (distance <= location.radius_meters) {
      return location;
    }
  }
  
  return null;
}

/**
 * Validate GPS coordinates are within valid ranges
 * Latitude: -90 to 90
 * Longitude: -180 to 180
 */
export function validateCoordinates(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
}

export default { calculateDistance, isWithinGeofence, validateCoordinates };
