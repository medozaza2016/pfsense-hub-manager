export type ErrorClass="timeout"|"tls"|"authentication"|"authorization"|"unsupported"|"rate_limit"|"remote_server"|"invalid_response"|"unknown";
export class PfSenseApiError extends Error{
 constructor(message:string,readonly errorClass:ErrorClass,readonly statusCode?:number){super(message);this.name="PfSenseApiError";}
}
export function classifyError(error:unknown):ErrorClass{
 if(error instanceof PfSenseApiError)return error.errorClass;
 if(error instanceof Error && (error.name==="AbortError"||error.name==="TimeoutError"))return "timeout";
 if(error instanceof Error && /certificate|tls|ssl/i.test(error.message))return "tls";
 return "unknown";
}
