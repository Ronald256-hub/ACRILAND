import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const reportsRouter=Router();

async function buildOverview(organizationId:string,days:number){
  const now=new Date();const since=new Date(now.getTime()-days*86400000);const next30=new Date(now.getTime()+30*86400000);
  const [organization,vehicles,trips,fuel,maintenance,documents,drivers,activeTrips]=await Promise.all([
    prisma.organization.findUniqueOrThrow({where:{id:organizationId},select:{name:true,currency:true}}),
    prisma.vehicle.findMany({where:{organizationId,archivedAt:null},select:{id:true,registrationNumber:true,fleetNumber:true,make:true,model:true,status:true,currentOdometerKm:true}}),
    prisma.trip.findMany({where:{organizationId,actualReturn:{gte:since},distanceKm:{not:null}},select:{vehicleId:true,distanceKm:true,status:true}}),
    prisma.fuelTransaction.findMany({where:{organizationId,status:"ISSUED",issuedAt:{gte:since}},select:{vehicleId:true,issuedLitres:true,totalCost:true}}),
    prisma.maintenanceWorkOrder.findMany({where:{organizationId,status:"CLOSED",releasedAt:{gte:since}},select:{vehicleId:true,totalCost:true,downtimeStart:true,downtimeEnd:true}}),
    prisma.complianceDocument.count({where:{organizationId,expiryDate:{lte:next30}}}),
    prisma.driver.count({where:{organizationId,archivedAt:null,licenceExpiry:{lte:next30}}}),
    prisma.trip.count({where:{organizationId,status:"ACTIVE"}})
  ]);
  const byVehicle=new Map(vehicles.map(v=>[v.id,{vehicle:v,distanceKm:0,fuelLitres:0,fuelCost:0,maintenanceCost:0,downtimeHours:0}]));
  for(const trip of trips){if(trip.vehicleId){const row=byVehicle.get(trip.vehicleId);if(row)row.distanceKm+=trip.distanceKm??0;}}
  for(const item of fuel){const row=byVehicle.get(item.vehicleId);if(row){row.fuelLitres+=Number(item.issuedLitres??0);row.fuelCost+=Number(item.totalCost??0);}}
  for(const item of maintenance){const row=byVehicle.get(item.vehicleId);if(row){row.maintenanceCost+=Number(item.totalCost??0);if(item.downtimeStart&&item.downtimeEnd)row.downtimeHours+=(item.downtimeEnd.getTime()-item.downtimeStart.getTime())/3600000;}}
  const vehicleEconomics=[...byVehicle.values()].map(row=>{const operatingCost=row.fuelCost+row.maintenanceCost;return{vehicleId:row.vehicle.id,registrationNumber:row.vehicle.registrationNumber,fleetNumber:row.vehicle.fleetNumber,make:row.vehicle.make,model:row.vehicle.model,status:row.vehicle.status,distanceKm:row.distanceKm,fuelLitres:Number(row.fuelLitres.toFixed(2)),fuelCost:Number(row.fuelCost.toFixed(2)),maintenanceCost:Number(row.maintenanceCost.toFixed(2)),operatingCost:Number(operatingCost.toFixed(2)),costPerKm:row.distanceKm?Number((operatingCost/row.distanceKm).toFixed(2)):null,litresPer100Km:row.distanceKm?Number((row.fuelLitres/row.distanceKm*100).toFixed(2)):null,downtimeHours:Number(row.downtimeHours.toFixed(1))};}).sort((a,b)=>b.operatingCost-a.operatingCost);
  const totalDistance=vehicleEconomics.reduce((s,v)=>s+v.distanceKm,0);const fuelLitres=vehicleEconomics.reduce((s,v)=>s+v.fuelLitres,0);const fuelSpend=vehicleEconomics.reduce((s,v)=>s+v.fuelCost,0);const maintenanceSpend=vehicleEconomics.reduce((s,v)=>s+v.maintenanceCost,0);const downtimeHours=vehicleEconomics.reduce((s,v)=>s+v.downtimeHours,0);
  const available=vehicles.filter(v=>["AVAILABLE","PARKED","ASSIGNED","SERVICE_DUE"].includes(v.status)).length;const workshop=vehicles.filter(v=>["UNDER_MAINTENANCE","BREAKDOWN","SERVICE_OVERDUE"].includes(v.status)).length;const grounded=vehicles.filter(v=>["GROUNDED","OUT_OF_SERVICE","ACCIDENT"].includes(v.status)).length;
  return{organization,period:{days,since:since.toISOString(),until:now.toISOString()},kpis:{fleetTotal:vehicles.length,available,activeTrips,workshop,grounded,totalDistance,fuelLitres:Number(fuelLitres.toFixed(2)),fuelSpend:Number(fuelSpend.toFixed(2)),maintenanceSpend:Number(maintenanceSpend.toFixed(2)),operatingSpend:Number((fuelSpend+maintenanceSpend).toFixed(2)),downtimeHours:Number(downtimeHours.toFixed(1)),complianceDue30:documents,driverLicencesDue30:drivers,costPerKm:totalDistance?Number(((fuelSpend+maintenanceSpend)/totalDistance).toFixed(2)):null},vehicleEconomics};
}

reportsRouter.get("/overview",requirePermission(PERMISSIONS.REPORT_VIEW),async(req,res)=>{const days=z.coerce.number().int().min(7).max(730).default(90).parse(req.query.days??90);return res.json(await buildOverview(req.auth!.organizationId,days));});

reportsRouter.get("/export.csv",requirePermission(PERMISSIONS.REPORT_EXPORT),async(req,res)=>{
  const days=z.coerce.number().int().min(7).max(730).default(90).parse(req.query.days??90);const report=await buildOverview(req.auth!.organizationId,days);
  const header=["Registration","Fleet number","Vehicle","Status","Distance km","Fuel litres","Fuel cost","Maintenance cost","Operating cost","Cost per km","L/100km","Downtime hours"];
  const escape=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
  const rows=report.vehicleEconomics.map(v=>[v.registrationNumber,v.fleetNumber??"",`${v.make} ${v.model}`,v.status,v.distanceKm,v.fuelLitres,v.fuelCost,v.maintenanceCost,v.operatingCost,v.costPerKm??"",v.litresPer100Km??"",v.downtimeHours].map(escape).join(","));
  const csv=[header.map(escape).join(","),...rows].join("\n");res.setHeader("Content-Disposition",`attachment; filename="acriland-fleet-report-${days}d.csv"`);return res.type("text/csv").send(csv);
});
