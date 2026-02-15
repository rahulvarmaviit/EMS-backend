
import { prisma } from '../src/config/database';

async function main() {
    try {
        const locations = await prisma.location.findMany();
        console.log('Locations found:', locations.length);
        if (locations.length > 0) {
            console.log(JSON.stringify(locations, null, 2));
        } else {
            console.log('No locations found!');
        }
    } catch (error) {
        console.error('Error querying database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
