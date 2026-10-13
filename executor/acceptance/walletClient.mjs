import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {assertMcpPaymentTool} from '../../scripts/mcp_payment_guard.mjs';

// Ordinary test wallets use the installed MCP wallet. Owner/session credentials
// stay in memory and are never part of the execution service configuration.
export async function walletClient(rpcConfig){
 const config=await readFile('/Users/geir/.codex/config.toml','utf8');
 const section=config.match(/\[mcp_servers\.psy\.env\]([\s\S]*?)(?=\n\[|$)/)?.[1]??'';
 const env={...process.env,PSY_CONFIG:rpcConfig};
 for(const key of ['PSY_MCP_KEYSTORE_DIR','PSY_MCP_OWNER_TOKEN']){
  const match=section.match(new RegExp(`^${key}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*$`,'m'));
  if(match)env[key]=JSON.parse(match[1]);
 }
 if(!env.PSY_MCP_OWNER_TOKEN)throw Error('installed wallet owner credential unavailable');
 const child=spawn('/Users/geir/.psy/bin/psy-mcp-server',['--config',rpcConfig],{env,stdio:['pipe','pipe','pipe']});
 const pending=new Map(),sessions=new Map();let serial=0,selected,blocked;
 // Discard private stderr. Public errors below are redacted before propagation.
 child.stderr.on('data',()=>{});
 const redact=value=>{let text=String(value);for(const secret of [env.PSY_MCP_OWNER_TOKEN,...sessions.values()])if(secret)text=text.split(secret).join('[REDACTED]');return text;};
 createInterface({input:child.stdout}).on('line',line=>{
  let reply;try{reply=JSON.parse(line);}catch{return;}
  const request=pending.get(reply.id);if(!request)return;pending.delete(reply.id);clearTimeout(request.timer);
  if(reply.error)request.reject(Error(redact(JSON.stringify(reply.error))));else request.resolve(reply.result);
 });
 child.once('exit',code=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('installed wallet exited '+code));}pending.clear();});
 const rpc=(method,params,timeout=900000)=>new Promise((resolve,reject)=>{
  const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('wallet RPC timed out; do not retry a mutation'));},timeout);
  pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 });
 await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'psy-executor-acceptance',version:'1'}},180000);
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const tools=(await rpc('tools/list',{})).tools;
 const names=new Set(tools.map(x=>x.name));
 const raw=async(name,args)=>{
  const response=await rpc('tools/call',{name,arguments:args});
  const data=JSON.parse(response.content?.find(x=>x.type==='text')?.text??'{}');
  if(response.isError)throw Error(redact(data.error??JSON.stringify(data)));
  return data;
 };
 return {
  tools:tools.filter(x=>['get_balance','get_status','get_policy','issue_session','claim_batch','call_contract','prepare_call_contract','execute_call_contract'].includes(x.name)),
  call:async(user,policy,tool,input)=>{
   assertMcpPaymentTool(tool,input);
   const mutation=['call_contract','claim_batch','transfer','claim_all'].includes(tool);
   if(blocked&&mutation)throw Error('previous wallet broadcast needs reconciliation: '+blocked);
   if(selected!==user){await raw('select_wallet',{user:String(user),owner_token:env.PSY_MCP_OWNER_TOKEN});selected=user;}
   const args={...input};
   if(mutation){
    const key=user+':'+policy;
    if(!sessions.has(key)){
     const session=await raw('issue_session',{policy_id:policy,ttl_minutes:60,maxSessionTotal:20000000000,owner_token:env.PSY_MCP_OWNER_TOKEN});
     if(!session.token)throw Error('wallet spending session missing');sessions.set(key,session.token);
    }
    args.session=sessions.get(key);
   }
   // If this installed wallet requires confirmation, consume its exact prepared
   // ticket under the user's explicit test authorization; never fall back raw.
   let data;
   try{
    if(mutation&&names.has('prepare_'+tool)&&names.has('execute_'+tool)){
     const prepared=await raw('prepare_'+tool,args);
     const ticket=prepared.confirmation_token??prepared.confirmationToken;
     if(!ticket)throw Error('wallet confirmation ticket unavailable');
     data=await raw('execute_'+tool,{confirmation_token:ticket,owner_token:env.PSY_MCP_OWNER_TOKEN});
    }else data=await raw(tool,args);
   }catch(error){if(mutation)blocked=tool;throw error;}
   const safe=JSON.parse(redact(JSON.stringify(data)));
   if(mutation)blocked=safe.endUserLeafHash??tool;
   return safe;
  },
  confirmed:()=>{blocked=undefined;},
  close:async()=>{child.stdin.end();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});}
 };
}
