export type HandoverParty = { fromDriverId: string | null; toDriverId: string | null; fromUserId: string | null; toUserId: string | null; status: string };

export function canAcceptHandover(row:HandoverParty,userId:string,canManage:boolean):boolean{
  if(row.status!=="PENDING")return false;
  if(row.toUserId)return row.toUserId===userId;
  return canManage;
}
export function canRejectHandover(row:HandoverParty,userId:string,canManage:boolean):boolean{
  return row.status==="PENDING"&&(canManage||row.toUserId===userId);
}
export function canAddHandoverEvidence(row:HandoverParty,userId:string,canManage:boolean):boolean{
  return row.status!=="CLOSED"&&(canManage||row.fromUserId===userId||row.toUserId===userId);
}
