import { createContext,useContext,useEffect,useMemo,useState,type ReactNode } from "react";
import { api,setAccessToken } from "../api/client";
import type { Me } from "../types";

type LoginResult={mfaRequired:boolean;mfaEnabled:boolean;mfaRequiredForRole:boolean};
type Auth={me:Me|null;loading:boolean;login:(o:string,e:string,p:string)=>Promise<LoginResult>;logout:()=>Promise<void>;reload:()=>Promise<void>};
const C=createContext<Auth|null>(null);
export function AuthProvider({children}:{children:ReactNode}){
  const[me,setMe]=useState<Me|null>(null);const[loading,setLoading]=useState(true);
  const reload=async()=>{const next=await api<Me>("/users/me");setMe(next);};
  useEffect(()=>{(async()=>{try{const r=await api<{accessToken:string}>("/auth/refresh",{method:"POST"});setAccessToken(r.accessToken);await reload();}catch{setAccessToken(null);setMe(null);}finally{setLoading(false);}})();},[]);
  const login=async(organizationSlug:string,email:string,password:string):Promise<LoginResult>=>{
    const r=await api<{accessToken:string}>("/auth/login",{method:"POST",body:JSON.stringify({organizationSlug,email,password})});
    setAccessToken(r.accessToken);
    try{await reload();return {mfaRequired:false,mfaEnabled:false,mfaRequiredForRole:false};}
    catch(err){
      if(err instanceof Error&&err.message==="MFA verification required."){
        const status=await api<{enabled:boolean;required:boolean}>("/auth/mfa/status",{method:"POST"});
        return {mfaRequired:true,mfaEnabled:status.enabled,mfaRequiredForRole:status.required};
      }
      setAccessToken(null);throw err;
    }
  };
  const logout=async()=>{try{await api("/auth/logout",{method:"POST"});}finally{setAccessToken(null);setMe(null);}};
  const value=useMemo(()=>({me,loading,login,logout,reload}),[me,loading]);return <C.Provider value={value}>{children}</C.Provider>;
}
export const useAuth=()=>{const v=useContext(C);if(!v)throw new Error("AuthProvider missing");return v;};
