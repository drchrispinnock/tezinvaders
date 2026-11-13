import json, os, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV = dict(os.environ, SSL_CERT_FILE='/etc/ssl/cert.pem')
BASE = ROOT / 'contract/.mockup'
SK = 'edsk3QoqBuvdamxouPhin7swCvkQNgq4jP5KZPbwWNnwdZpSpJiEbq'  # public test fixture only

def run(args):
    out = subprocess.run(args, cwd=ROOT, env=ENV, capture_output=True, text=True)
    if out.returncode:
        raise RuntimeError(out.stderr + out.stdout)
    return out.stdout

def tc(*args):
    return run(['octez-client', '--mode', 'mockup', '--base-dir', str(BASE), *args])

def call(alias, ep, arg=None, amount='0'):
    args = ['transfer', amount, 'from', alias, 'to', 'tezinvaders', '--entrypoint', ep, '--burn-cap', '5']
    if arg is not None: args += ['--arg', arg]
    out = tc(*args)
    if 'successfully' not in out: raise RuntimeError(out)

def addr(alias):
    return re.search(r'Hash: (\w+)',tc('show','address',alias)).group(1)

def balance(owner, token):
    storage = tc('get','contract','storage','for','tezinvaders')
    ledger_id = storage.split()[-4]
    h = re.search(r'Script-expression-ID-Hash: (\w+)', tc('hash','data',f'Pair "{owner}" {token}','of','type','pair address nat')).group(1)
    return int(tc('get','element',h,'of','big','map',ledger_id).strip())

kt = tc('show','known','contract','tezinvaders').strip()
chain = json.loads(tc('rpc','get','/chains/main/chain_id'))
player, recipient = addr('bootstrap2'), addr('bootstrap4')
pk = run(['node','--input-type=module','-e',"import {verifierPublicKey} from './verifier/attest.ts'; console.log(await verifierPublicKey(process.argv[1]));",SK]).strip()
call('bootstrap1','set_verifier',f'"{pk}"')
call('bootstrap1','set_advent','Pair 0 100')
call('bootstrap2','play',amount='0.25')
seed = run(['node','contract/scripts/seed.ts','--contract',kt,'--player',player,'--value','0','--tag','1']).strip()
round_ = tc('get','contract','storage','for','tezinvaders').split()[3]
proof = run(['node','verifier/sign.ts','--key',SK,'--chain',chain,'--contract',kt,'--player',player,'--score','600','--expires','901','--round',round_,'--seed',seed]).strip()
claim = f'Pair (Pair 600 901) (Pair {seed} "{proof}")'
before = balance(recipient,100)
for i in range(2):
    call('bootstrap2','claim_advent',claim)
    call('bootstrap2','transfer',f'{{ Pair "{player}" {{ Pair "{recipient}" (Pair 100 1) }} }}')
after = balance(recipient,100)
assert after == before + 2
print(json.dumps({'test':'same proof mints twice after transfer', 'recipientBefore':before, 'recipientAfter':after, 'claimantAfter':balance(player,100)}),flush=True)

call('bootstrap1','end_round')
call('bootstrap3','update_operators','{}',amount='1')
storage = tc('get','contract','storage','for','tezinvaders')
print(json.dumps({'test':'tez accepted outside play is not accounted for', 'poolMutez':storage.split()[4], 'actualBalance':tc('get','balance','for','tezinvaders').strip()}),flush=True)

# One normally recorded Advent game can be re-attested for two different rounds.
js = """
import {Sim,encodeLog} from './src/game/sim.ts';
import {seedFor} from './src/chain/seed.ts';
const [contract,player,chainId]=process.argv.slice(1);
const seed=seedFor(contract,player,0,1); const sim=new Sim(); sim.startGame(seed);
for(let t=0;t<60000 && sim.phase!=='gameover';t++) {
 const phase=Math.floor(t/90)%4;
 sim.step({left:phase===1,right:phase===3,fire:t%7===0,start:false});
}
console.log(JSON.stringify({contract,player,chainId,seed,score:sim.score,log:encodeLog(sim.log)}));
"""
game=json.loads(run(['node','--input-type=module','-e',js,kt,player,chain]))
rounds=[]
for i in range(2):
    call('bootstrap2','play',amount='0.25')
    round_=int(tc('get','contract','storage','for','tezinvaders').split()[3])
    req=dict(game,round=round_)
    signjs="import {attest} from './verifier/attest.ts'; console.log(JSON.stringify(await attest(process.argv[1],JSON.parse(process.argv[2]),1000)));"
    att=json.loads(run(['node','--input-type=module','-e',signjs,SK,json.dumps(req)]))
    call('bootstrap2','submit_score',f'Pair (Pair {att["score"]} {att["expires"]}) (Pair {game["seed"]} "{att["proof"]}")')
    rounds.append(round_)
    if i==0: call('bootstrap1','end_round')
print(json.dumps({'test':'one Advent recording accepted in two rounds', 'rounds':rounds,'seed':game['seed'],'score':game['score']}),flush=True)
