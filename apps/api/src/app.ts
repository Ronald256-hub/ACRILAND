import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
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
app.use((_req,res)=>res.status(404).json({error:"Route not found."}));
app.use(errorHandler);
