import { useParams } from "react-router-dom";
import { ContextDocumentUpload } from "../components/ContextDocumentUpload";
import { Vehicle360IntegratedPage } from "./Vehicle360IntegratedPage";
export function Vehicle360ContextPage(){const{id}=useParams();return <><Vehicle360IntegratedPage/>{id&&<ContextDocumentUpload entityType="VEHICLE" entityId={id} label="Add document to this vehicle"/>}</>}
