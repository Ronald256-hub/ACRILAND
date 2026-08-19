import { prisma } from "../lib/prisma.js";
import { PERMISSION_CATALOG, ROLE_TEMPLATES } from "../domain/permissions.js";

const defaultInspectionTemplates = [
  {
    name: "Driver Daily Vehicle Health Check",
    type: "DAILY" as const,
    description: "Driver condition report covering vehicle behaviour, safety, load security and repair needs before or during daily operation.",
    items: [
      ["ENGINE_BEHAVIOUR", "Engine start, idle, power and unusual smoke/noise", false],
      ["DASH_WARNINGS", "Dashboard warning lights and gauges", false],
      ["SERVICE_BRAKES", "Service brake response and stopping performance", true],
      ["PARKING_BRAKE", "Parking brake holding performance", true],
      ["STEERING", "Steering response, free play and unusual vibration", true],
      ["TRANSMISSION", "Clutch / gearbox / transmission behaviour", false],
      ["SUSPENSION", "Suspension, ride behaviour and unusual knocks", false],
      ["TYRES_WHEELS", "Tyres, wheels, wheel nuts and visible damage", true],
      ["LIGHTS_ELECTRICAL", "Headlights, indicators, brake lights, horn and electricals", false],
      ["FLUIDS_LEAKS", "Fuel, oil, coolant, brake-fluid or air leaks", true],
      ["GLASS_MIRRORS_BODY", "Windscreen, mirrors, doors, body and visible damage", false],
      ["COUPLING_TRAILER", "Fifth wheel / coupling / trailer connections", true],
      ["LOAD_SECURITY", "Cargo restraint, load distribution and load security", true],
      ["SAFETY_EQUIPMENT", "Fire extinguisher, warning triangles and first-aid equipment", false]
    ] as const
  },
  {
    name: "Standard Pre-Trip Inspection",
    type: "PRE_TRIP" as const,
    description: "Mandatory safety and roadworthiness inspection before an authorized trip.",
    items: [
      ["ENGINE_OIL", "Engine oil level", false],
      ["COOLANT", "Coolant level", false],
      ["BRAKE_FLUID", "Brake fluid", true],
      ["TYRES", "Tyres and visible condition", true],
      ["WHEEL_NUTS", "Wheel nuts", true],
      ["HEADLIGHTS", "Headlights", false],
      ["INDICATORS", "Indicators / hazard lights", false],
      ["BRAKE_LIGHTS", "Brake lights", true],
      ["HORN", "Horn", false],
      ["MIRRORS", "Mirrors", false],
      ["WINDSCREEN", "Windscreen and wipers", false],
      ["SEAT_BELTS", "Seat belts", true],
      ["SERVICE_BRAKES", "Service brakes", true],
      ["PARKING_BRAKE", "Parking brake", true],
      ["FIRE_EXTINGUISHER", "Fire extinguisher", true],
      ["WARNING_TRIANGLE", "Warning triangle", false],
      ["FIRST_AID", "First-aid kit", false],
      ["LEAKS", "Oil / coolant / fuel leaks", true],
      ["VISIBLE_DAMAGE", "Visible vehicle or body damage", false]
    ] as const
  },
  {
    name: "Standard Post-Trip Inspection",
    type: "POST_TRIP" as const,
    description: "Return inspection to capture new damage, leaks, safety defects and required follow-up.",
    items: [
      ["TYRES", "Tyres and visible condition", true],
      ["LIGHTS", "Exterior lights", false],
      ["BRAKES", "Brake performance / concerns", true],
      ["LEAKS", "Oil / coolant / fuel leaks", true],
      ["VISIBLE_DAMAGE", "New visible damage", false],
      ["TOOLS", "Vehicle tools and safety equipment", false],
      ["CAB", "Cab condition", false]
    ] as const
  }
] as const;

export async function syncPlatformDefaults(organizationId: string): Promise<void> {
  for (const permission of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission
    });
  }

  for (const [name, keys] of Object.entries(ROLE_TEMPLATES)) {
    const role = await prisma.role.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: { isSystem: true },
      create: { organizationId, name, isSystem: true, description: `Default ${name.replaceAll("_", " ").toLowerCase()} role` }
    });
    const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
    }
  }

  for (const definition of defaultInspectionTemplates) {
    const template = await prisma.inspectionTemplate.upsert({
      where: { organizationId_name_type: { organizationId, name: definition.name, type: definition.type } },
      update: { description: definition.description, isActive: true },
      create: { organizationId, name: definition.name, type: definition.type, description: definition.description, isActive: true }
    });
    for (const [code, label, isCritical] of definition.items) {
      await prisma.inspectionTemplateItem.upsert({
        where: { templateId_code: { templateId: template.id, code } },
        update: { label, isCritical, sortOrder: definition.items.findIndex((item) => item[0] === code) },
        create: { templateId: template.id, code, label, isCritical, sortOrder: definition.items.findIndex((item) => item[0] === code) }
      });
    }
  }
}
