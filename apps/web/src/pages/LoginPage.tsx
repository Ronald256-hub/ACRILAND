import { useState,type FormEvent } from "react";
import { Link,Navigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type Step="login"|"setup"|"verify"|"recovery";
type Setup={secret:string;otpauthUri:string};

export function LoginPage(){
  const{me,login,reload}=useAuth();
  const[org,setOrg]=useState("acriland"),[email,setEmail]=useState(""),[password,setPassword]=useState("");
  const[step,setStep]=useState<Step>("login");const[setup,setSetup]=useState<Setup|null>(null);const[recovery,setRecovery]=useState<string[]>([]);
  const[code,setCode]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  if(me)return <Navigate to="/" replace/>;

  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");try{const result=await login(org,email,password);if(result.mfaRequired)setStep(result.mfaEnabled?"verify":"setup");}catch(err){setError(err instanceof Error?err.message:"Sign in failed.");}finally{setBusy(false);}};

  const beginSetup=async()=>{setBusy(true);setError("");try{const result=await api<Setup>("/auth/mfa/setup",{method:"POST",body:JSON.stringify({currentPassword:password})});setSetup(result);}catch(err){setError(err instanceof Error?err.message:"MFA setup failed.");}finally{setBusy(false);}};
  const confirmSetup=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");try{const result=await api<{recoveryCodes:string[]}>("/auth/mfa/confirm",{method:"POST",body:JSON.stringify({code})});setRecovery(result.recoveryCodes);setStep("recovery");setCode("");}catch(err){setError(err instanceof Error?err.message:"MFA confirmation failed.");}finally{setBusy(false);}};
  const verify=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");try{await api("/auth/mfa/verify",{method:"POST",body:JSON.stringify({code})});setCode("");await reload();}catch(err){setError(err instanceof Error?err.message:"MFA verification failed.");}finally{setBusy(false);}};

  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);}catch{setError("Copy failed. Select and copy the value manually.");}};
  const title=step==="login"?"Sign in securely":step==="setup"?"Protect your administrator account":step==="verify"?"MFA verification":"Save your recovery codes";

  return <div className="login-wrap">
    <section className="login-copy"><span className="eyebrow">ACRILAND LTD</span><h1>Every truck.<br/>Every trip.<br/>Accountable.</h1><p>Enterprise command, control, maintenance and compliance for the ACRILAND fleet.</p><div className="control-list"><span>✓ Privileged accounts require MFA</span><span>✓ Action-level permissions</span><span>✓ Permanent audit trail</span></div></section>
    <form className="login-card" onSubmit={step==="login"?submit:step==="verify"?verify:confirmSetup}>
      <div className="brand login-brand"><div className="brand-mark">A</div><div><b>Fleet Command</b><span>Authorized personnel only</span></div></div>
      {step==="login"&&<><label>Organization<input value={org} onChange={e=>setOrg(e.target.value)} autoComplete="organization"/></label><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label><button className="primary" disabled={busy}>{busy?"Signing in…":"Sign in securely"}</button><Link to="/forgot-password">Forgot password?</Link><small>Accounts are issued by authorized ACRILAND management. There is no self-registration.</small></>}
      {step==="setup"&&<><h2>{title}</h2><p className="muted">Your account has elevated privileges. Set up a TOTP authenticator before access is granted.</p>{!setup?<><p>Use Google Authenticator, Microsoft Authenticator, Authy, 1Password or another standard TOTP app.</p><button type="button" className="primary" onClick={beginSetup} disabled={busy}>{busy?"Preparing…":"Generate authenticator secret"}</button></>:<><label>Secret key<input value={setup.secret} readOnly onFocus={e=>e.currentTarget.select()}/></label><button type="button" className="secondary" onClick={()=>copy(setup.secret)}>Copy secret</button><label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} required/></label><button className="primary" disabled={busy||code.length!==6}>{busy?"Confirming…":"Enable MFA"}</button><details><summary>Advanced setup</summary><p className="small">If your authenticator supports manual setup, use this URI:</p><textarea readOnly value={setup.otpauthUri} onFocus={e=>e.currentTarget.select()}/><button type="button" className="secondary" onClick={()=>copy(setup.otpauthUri)}>Copy URI</button></details></>}</>}
      {step==="verify"&&<><h2>{title}</h2><p className="muted">Enter the 6-digit code from your authenticator. You may also enter one unused recovery code.</p><label>Authentication code<input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={20} value={code} onChange={e=>setCode(e.target.value)} required/></label><button className="primary" disabled={busy}>{busy?"Verifying…":"Verify and continue"}</button><small>Recovery codes are single-use. Keep them offline and never share them.</small></>}
      {step==="recovery"&&<><h2>{title}</h2><p className="muted">These codes are shown once. Store them somewhere secure before continuing.</p><div className="recovery-grid">{recovery.map(item=><code key={item}>{item}</code>)}</div><button type="button" className="secondary" onClick={()=>copy(recovery.join("\n"))}>Copy recovery codes</button><button type="button" className="primary" onClick={async()=>{setRecovery([]);await reload();}}>Continue to Fleet Command</button></>}
      {error&&<div className="error-box">{error}</div>}
    </form>
  </div>;
}
