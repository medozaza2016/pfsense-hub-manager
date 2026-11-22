export type ErrorClass="timeout"|"tls"|"authentication"|"authorization"|"unsupported"|"rate_limit"|"remote_server"|"invalid_response"|"unknown";
export class PfSenseApiError extends Error{
 constructor(message:string,readonly errorClass:ErrorClass,readonly statusCode?:number,readonly diagnosticCode?:string){super(message);this.name="PfSenseApiError";}
}

export function findUpstreamErrorCode(error:unknown):string|undefined{
 let current:unknown=error;
 for(let depth=0;depth<5&&current instanceof Error;depth++){
  const code=(current as Error&{code?:unknown}).code;
  if(typeof code==="string"&&/^[A-Z0-9_]{2,80}$/.test(code))return code;
  current=(current as Error&{cause?:unknown}).cause;
 }
 return undefined;
}

export function hasTlsFailure(error:unknown):boolean{
 let current:unknown=error;
 for(let depth=0;depth<5&&current instanceof Error;depth++){
  const code=(current as Error&{code?:unknown}).code;
  if(typeof code==="string"&&/^(ERR_TLS_|CERT_|SELF_SIGNED_|UNABLE_TO_VERIFY_)/.test(code))return true;
  if(/certificate|tls|ssl/i.test(current.message))return true;
  current=(current as Error&{cause?:unknown}).cause;
 }
 return false;
}
export function classifyError(error:unknown):ErrorClass{
 if(error instanceof PfSenseApiError)return error.errorClass;
 if(error instanceof Error && (error.name==="AbortError"||error.name==="TimeoutError"))return "timeout";
 if(error instanceof Error && /certificate|tls|ssl/i.test(error.message))return "tls";
 return "unknown";
}
