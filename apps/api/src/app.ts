import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { apiRouter } from "./routes.js";
import { errorHandler } from "./middleware/error.js";

export const app=express();
app.set("trust proxy",1);
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({origin:env.CORS_ORIGIN,credentials:true,methods:["GET","POST","PATCH","PUT","DELETE"]}));
app.use(express.json({limit:"1mb"}));
app.use(cookieParser());
app.use("/api",apiRouter);

const webRoot=join(dirname(fileURLToPath(import.meta.url)),"../../../web/dist");
const webIndex=join(webRoot,"index.html");
if(existsSync(webIndex)){
  app.use(express.static(webRoot,{index:"index.html",maxAge:"1h"}));
  app.use((req,res,next)=>{
    if(req.method==="GET"&&!req.path.startsWith("/api")&&req.accepts("html")) return res.sendFile(webIndex);
    return next();
  });
}

app.use((_req,res)=>res.status(404).json({error:"Route not found."}));
app.use(errorHandler);
