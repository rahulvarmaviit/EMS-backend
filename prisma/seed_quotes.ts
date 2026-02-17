import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const initialQuotes = [
    "Work is worship.",
    "Your limitation—it's only your imagination.",
    "Quality is not an act, it is a habit.",
    "Talent wins games, but teamwork and intelligence wins championships",
    "Think out of the box",
    "Great things never come from comfort zones.",
    "The only way to do great work is to love what you do.",
    "If you want to walk fast, walk alone. If you want to walk far, walk together",
    "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    "It is not the strongest of the species that survive, nor the most intelligent, but the one most responsive to change.",
    "Hard work beats talent when talent doesn't work hard.",
    "Believe you can and you're halfway there.",
    "Don't watch the clock; do what it does. Keep going.",
    "Opportunities don't happen, you create them."
];

export async function seedQuotes(prismaClient?: PrismaClient) {
    const p = prismaClient || prisma;
    console.log('Seeding quotes...');

    for (const text of initialQuotes) {
        // Check if exists
        const existing = await p.quote.findFirst({
            where: { text }
        });

        if (!existing) {
            await p.quote.create({
                data: {
                    text,
                    is_active: true,
                    is_system: true
                }
            });
            console.log(`Created system quote: ${text}`);
        }
    }
}
