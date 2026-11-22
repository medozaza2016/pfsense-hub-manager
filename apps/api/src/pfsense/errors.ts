export type ErrorClass="timeout"|"tls"|"authentication"|"authorization"|"unsupported"|"rate_limit"|"remote_server"|"invalid_response"|"unknown";
export class PfSenseApiError extends Error{
 constructor(message:string,readonly errorClass:ErrorClass,readonly statusCode?:number,readonly diagnosticCode?:string){super(message);this.name="PfSenseApiError";}
}

type ErrorDetails = { code?: unknown; message?: unknown; name?: unknown; cause?: unknown };

function errorDetails(value:unknown):ErrorDetails|undefined{
 if((typeof value!=="object"||value===null)&&typeof value!=="function")return undefined;
 return value as ErrorDetails;
}

function walkErrorChain(error:unknown,visit:(details:ErrorDetails)=>boolean):boolean{
 let current:unknown=error;
 const seen=new Set<unknown>();
 for(let depth=0;depth<8;depth++){
  const details=errorDetails(current);
  if(!details||seen.has(current))break;
  seen.add(current);
  if(visit(details))return true;
  current=details.cause;
 }
 return false;
}

export function findUpstreamErrorCode(error:unknown):string|undefined{
 let diagnosticCode:string|undefined;
 walkErrorChain(error,details=>{
  const code=details.code;
  if(typeof code==="string"&&/^[A-Z0-9_]{2,80}$/.test(code)){
   diagnosticCode=code;
   return true;
  }
  return false;
 });
 return diagnosticCode;
}

export function hasTlsFailure(error:unknown):boolean{
 return walkErrorChain(error,details=>{
  const code=typeof details.code==="string"?details.code:"";
  const message=typeof details.message==="string"?details.message:"";
  return /^(ERR_TLS_|CERT_|SELF_SIGNED_|UNABLE_TO_VERIFY_)/.test(code)||/certificate|tls|ssl/i.test(message);
 });
}
export function classifyError(error:unknown):ErrorClass{
 if(error instanceof PfSenseApiError)return error.errorClass;
 if(error instanceof Error && (error.name==="AbortError"||error.name==="TimeoutError"))return "timeout";
 if(hasTlsFailure(error))return "tls";
 return "unknown";
}
