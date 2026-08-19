export type VehicleHealthState="UNKNOWN"|"HEALTHY"|"ATTENTION"|"CRITICAL";
export type HealthInspectionResult={result:"PASS"|"ATTENTION_REQUIRED"|"FAIL"|"NOT_APPLICABLE";isCritical:boolean;labelSnapshot?:string};

export function classifyVehicleHealth(input:{results:HealthInspectionResult[];driverCanContinue:boolean;loadState?:string|null|undefined;repairRequest?:string|null|undefined}):VehicleHealthState{
  if(!input.results.length)return "UNKNOWN";
  const criticalFailure=input.results.some(item=>item.result==="FAIL"&&item.isCritical);
  if(criticalFailure||!input.driverCanContinue||input.loadState==="OVERLOAD_SUSPECTED")return "CRITICAL";
  const defect=input.results.some(item=>item.result==="FAIL"||item.result==="ATTENTION_REQUIRED");
  if(defect||Boolean(input.repairRequest?.trim()))return "ATTENTION";
  return "HEALTHY";
}

export function shouldGroundFromHealth(input:{results:HealthInspectionResult[];driverCanContinue:boolean;loadState?:string|null|undefined}):boolean{
  return !input.driverCanContinue||input.loadState==="OVERLOAD_SUSPECTED"||input.results.some(item=>item.result==="FAIL"&&item.isCritical);
}

export function defectSummary(results:HealthInspectionResult[],limit=4):string[]{
  return results.filter(item=>item.result==="FAIL"||item.result==="ATTENTION_REQUIRED").slice(0,limit).map(item=>`${item.labelSnapshot??"Inspection item"}: ${item.result==="FAIL"?"fault":"attention"}`);
}
