export class ApiError extends Error { constructor(status,code){super(code);this.status=status;this.code=code;} }
export async function stripe(env,path,{method='GET',body,idempotencyKey}={}) {
 if(!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY||''))throw new ApiError(503,'test_stripe_not_configured');
 const headers={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Stripe-Version':'2026-10-28.endive'};
 if(body)headers['Content-Type']='application/x-www-form-urlencoded';if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
 const response=await fetch(`https://api.stripe.com/v1/${path}`,{method,headers,body:body?new URLSearchParams(body):undefined});
 if(!response.ok)throw new ApiError(502,'stripe_unavailable');
 const result=await response.json();if(result.livemode===true)throw new ApiError(502,'live_mode_rejected');return result;
}
