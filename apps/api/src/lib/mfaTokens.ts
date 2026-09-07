import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

type Claims = { sub:string; organizationId:string; purpose:"mfa_challenge" };

export function signMfaChallengeToken(userId:string,organizationId:string):string {
  return jwt.sign({sub:userId,organizationId,purpose:"mfa_challenge"},env.JWT_ACCESS_SECRET,{expiresIn:"10m",issuer:"acriland-fleet",audience:"acriland-mfa"});
}

export function verifyMfaChallengeToken(token:string):Claims {
  const claims=jwt.verify(token,env.JWT_ACCESS_SECRET,{issuer:"acriland-fleet",audience:"acriland-mfa"}) as Claims;
  if(claims.purpose!=="mfa_challenge"||!claims.sub||!claims.organizationId) throw new Error("Invalid MFA challenge.");
  return claims;
}
