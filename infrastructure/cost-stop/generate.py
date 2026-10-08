"""Build a private, fixed-scope Workflows definition. No user URLs or resource IDs."""
import json
from pathlib import Path
E=lambda s:'${'+s+'}'
def step(name,**kw):return {name.replace('-', '_'):kw}
def http(name,method,url,body=None,result=None):
 args={'url':url,'auth':{'type':'OAuth2'},'timeout':20}
 if body is not None:args['body']=body
 call={'call':'http.'+method.lower(),'args':args}
 if result:call['result']=result
 policy='http.default_retry' if method in ('GET','PATCH') else 'http.default_retry_non_idempotent'
 return step(name,**{'try':call,'retry':E(policy)})
PROJECT='cc-dev-ps7'
DB='https://firestore.googleapis.com/v1/projects/cc-dev-ps7/databases/(default)/documents/'
BUDGET='5629c6af-5042-4d68-926e-e76a5b0b4a26'
SITES=['cc-dev-ps7','lobby-personal','ps7-corporate','yt-log-ps7']
RUN=['hondokondl','hondokocover','hondokoamazon','hondokoanalyze','minimegenerate','assetserve','interpretercall','anthropicproxy','realtimetoken']

def build(deny):
 checks=[
  'event.type == "google.cloud.pubsub.topic.v1.messagePublished"',
  'event.source == "//pubsub.googleapis.com/projects/cc-dev-ps7/topics/cc-dev-budget-alerts"',
  'attrs.billingAccountId == "018CD7-29C438-31FEC4"',f'attrs.budgetId == "{BUDGET}"', 'attrs.schemaVersion == "1.0"',
  'payload.currencyCode == "JPY"','payload.budgetAmount == 1000','payload.budgetAmountType == "SPECIFIED_AMOUNT"',
  'get_type(payload.costAmount) in ["integer", "double"]','payload.costAmount >= 800',
  'time.parse(event.data.message.publishTime) <= sys.now() + 300','time.parse(event.data.message.publishTime) >= sys.now() - 86400',
  'text.substring(time.format(time.parse(payload.costIntervalStart), "America/Los_Angeles"), 0, 10) == text.substring(time.format(sys.now(), "America/Los_Angeles"), 0, 7) + "-01"'
 ]
 validate=[step('decode',assign=[{'payload':E('json.decode(base64.decode(event.data.message.data))')},{'attrs':E('event.data.message.attributes')}])]
 validate += [step('check_'+str(i),switch=[{'condition':E('not ('+condition+')'),'next':'ignore'}]) for i,condition in enumerate(checks)]
 validate += [{'valid':{'return':True}},{'ignore':{'return':False}}]
 main=[step('validate',call='validate_event',args={'event':E('event')},result='valid'),step('reject',switch=[{'condition':E('valid != true'),'next':'ignored'}]),step('dry_run',switch=[{'condition':E('map.get(event, "dryRun") == true'),'next':'dry_run_result'}]),step('init',assign=[{'failures':[]},{'month':E('text.substring(time.format(sys.now(), "America/Los_Angeles"), 0, 7)')}])]
 # All independent resource stops are attempted even when one API fails.
 def attempt(name,steps):
  main.append(step(name,try_={'steps':steps},except_={'as':'e','steps':[step('record_'+name,assign=[{'failures':E('list.concat(failures, "'+name+'")')}])]}))
  v=main[-1][name];v['try']=v.pop('try_');v['except']=v.pop('except_')
 attempt('latch',[http('pause','patch',DB+'costControls/global?updateMask.fieldPaths=enabled&updateMask.fieldPaths=reason',{'fields':{'enabled':{'booleanValue':False},'reason':{'stringValue':'budget-800JPY'}}})])
 for site in SITES:
  base='https://firebasehosting.googleapis.com/v1beta1/sites/'+site+'/releases'
  attempt('site_'+site.replace('-','_'),[http('read_'+site,'get',base+'?pageSize=1',result='snapshot'),step('save_'+site,call='backup',args={'id':E('"hosting_'+site+'_" + month'),'value':E('snapshot.body')}),http('stop_'+site,'post',base,{'type':'SITE_DISABLE','message':'CC-DEV 800 JPY budget stop; manual restart only'})])
 for service in RUN:
  base='https://run.googleapis.com/v2/projects/cc-dev-ps7/locations/asia-northeast1/services/'+service
  steps=[http('read_'+service,'get',base+':getIamPolicy?options.requestedPolicyVersion=3',result='policy'),step('save_'+service,call='backup',args={'id':E('"run_'+service+'_" + month'),'value':E('policy.body')}),step('filter_'+service,call='private_policy',args={'policy':E('policy.body')},result='privatePolicy'),http('stop_'+service,'post',base+':setIamPolicy',{'policy':E('privatePolicy')})]
  attempt('run_'+service,steps)
 for name,release in [('firestore','cloud.firestore'),('storage','firebase.storage/cc-dev-ps7.firebasestorage.app')]:
  full='projects/cc-dev-ps7/releases/'+release;base='https://firebaserules.googleapis.com/v1/'+full
  attempt(name,[http('read_'+name,'get',base,result='snapshot'),step('save_'+name,call='backup',args={'id':E('"rules_'+name+'_" + month'),'value':E('snapshot.body')}),http('stop_'+name,'patch',base,{'release':{'name':full,'rulesetName':deny[name]},'updateMask':'rulesetName'})])
 main += [
  step('failed',switch=[{'condition':E('len(failures) > 0'),'next':'failure'}]),
  {'done':{'return':{'status':'stopped','manualRestartRequired':True}}},
  {'failure':{'raise':{'message':'Cost stop partially failed','resources':E('failures')}}},
  {'ignored':{'return':'ignored'}},
  {'dry_run_result':{'return':{'status':'would_stop','sites':SITES,'services':RUN,'thresholdJPY':800}}},
 ]
 backup=[step('create',try_={'steps':[http('write','post',E('"'+DB+'costStopBackups?documentId=" + id'),{'fields':{'snapshot':{'stringValue':E('json.encode_to_string(value)')},'createdAt':{'timestampValue':E('time.format(sys.now())')}}})]},except_={'as':'e','steps':[
   step('only_duplicate',switch=[{'condition':E('map.get(e, "code") == 409'),'next':'already'}]),
   {'rethrow':{'raise':E('e')}},
   {'already':{'return':True}},
  ]}),{'done':{'return':True}}]
 b=backup[0]['create'];b['try']=b.pop('try_');b['except']=b.pop('except_')
 filtering=[step('init',assign=[{'bindings':[]}]),step('each',for_={'value':'binding','in':E('default(map.get(policy, "bindings"), [])'),'steps':[step('members',assign=[{'members':[]}]),step('filter',for_={'value':'member','in':E('binding.members'),'steps':[step('keep',switch=[{'condition':E('member != "allUsers" and member != "allAuthenticatedUsers"'),'steps':[step('append',assign=[{'members':E('list.concat(members, member)')}])]}])]}),step('nonempty',switch=[{'condition':E('len(members)>0'),'steps':[step('replace',assign=[{'binding.members':E('members')},{'bindings':E('list.concat(bindings, binding)')}])]}])]}),step('replace_policy',assign=[{'policy.bindings':E('bindings')}]),{'done':{'return':E('policy')}}]
 def normalize(o):
  if isinstance(o,dict):return {('for' if k=='for_' else k):normalize(v) for k,v in o.items()}
  if isinstance(o,list):return [normalize(x) for x in o]
  return o
 return normalize({'main':{'params':['event'],'steps':main},'validate_event':{'params':['event'],'steps':[{'parse':{'try':{'steps':validate},'except':{'as':'e','steps':[{'malformed':{'return':'ignored'}}]}}}]},'backup':{'params':['id','value'],'steps':backup},'private_policy':{'params':['policy'],'steps':filtering}})
if __name__=='__main__':
 import sys
 deny=json.loads(Path(sys.argv[1]).read_text())
 print(json.dumps(build(deny),ensure_ascii=False,indent=2))
