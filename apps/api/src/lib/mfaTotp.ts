import { totpAt } from "./mfaCrypto.ts";

const PERIOD_SECONDS=30;

export function matchingTotpStep(secret:string,code:string,now=Date.now()):number|null {
  if(!/^\d{6}$/.test(code)) return null;
  const current=Math.floor(now/1000/PERIOD_SECONDS);
  for(const offset of [-1,0,1]) if(totpAt(secret,now+offset*PERIOD_SECONDS*1000)===code) return current+offset;
  return null;
}
