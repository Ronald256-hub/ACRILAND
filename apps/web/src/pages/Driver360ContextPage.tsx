import { useParams } from "react-router-dom";
import { ContextDocumentUpload } from "../components/ContextDocumentUpload";
import { Driver360IntegratedPage } from "./Driver360IntegratedPage";
export function Driver360ContextPage(){const{id}=useParams();return <><Driver360IntegratedPage/>{id&&<ContextDocumentUpload entityType="DRIVER" entityId={id} label="Add document to this driver"/>}</>}
