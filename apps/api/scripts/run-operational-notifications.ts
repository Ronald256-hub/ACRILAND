import { prisma } from "../src/lib/prisma.js";
import { runAllOperationalNotifications } from "../src/lib/notificationDelivery.js";

try{const result=await runAllOperationalNotifications();console.info(`Operational notifications: queued=${result.queued} sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`);if(result.failed>0)process.exitCode=1;}finally{await prisma.$disconnect();}
