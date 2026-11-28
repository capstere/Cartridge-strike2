#!/usr/bin/env python3
"""Exercise a staged operator on uniquely named disposable systemd units."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import select
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

OLD = '8307e91118dba4fdca964012d2b0c247a40221fd'
UNIT_DIR = Path('/run/systemd/system')
UID = GID = 65534


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def until(check, label, seconds=60):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = check()
        if value:
            return value
        time.sleep(.2)
    raise RuntimeError(label)


def command(*args, **options):
    return subprocess.run(args, check=True, capture_output=True, text=True, **options)


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def read_health(port):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=3) as response:
        return json.load(response)


def atomic_private(path, data):
    pending = path.with_suffix('.new')
    pending.write_text(data)
    pending.chmod(0o600)
    pending.replace(path)


def operator(root, action):
    # Run the installed manager itself. Remap installation locations and the
    # monitor port. All systemctl calls below operate on real disposable units.
    metadata = json.loads((root / 'fixture.json').read_text())
    owner = root.stat()
    require(root.parent == Path('/var/lib') and re.fullmatch(r'cs3-release-drill-[a-z0-9_]+', root.name)
            and owner.st_uid == 0 and not owner.st_mode & 0o022, 'Expected a private operator fixture')
    prefix = root / 'installation'
    entry = prefix / 'operations' / metadata['revision'] / 'deploy/online/manage.py'
    spec = importlib.util.spec_from_file_location('staged_manager', entry)
    manager = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(manager)
    manager.PREFIX, manager.CONFIG = prefix, root / 'config'
    manager.FAMILY, manager.BACKUPS = root / 'state', root / 'history/backups'
    manager.SERVICE, manager.TUNNEL = root.name + '-game', root.name + '-edge'
    manager.SYSTEMD = UNIT_DIR
    manager.LOCK, manager.FENCE = root / 'operation.lock', root / 'admission.token'
    manager.health = lambda: read_health(metadata['port'])
    def scoped(*args):
        if args[0] == 'systemd-run':
            # The actual guard must re-enter the same disposable installation.
            require(args[1:3] == ('--quiet','--collect') and args[-3] == 'guard-fence', 'Unexpected guard command')
            return command('systemd-run','--quiet','--collect','--unit='+root.name+'-guard-'+args[-1],
                           '/usr/bin/python3','-I',str(root/'fixture.py'),'operator',str(root),*args[-3:])
        require(args[0] == 'systemctl' and args[1] in ('show','start','stop','restart','freeze','thaw','is-active')
                and args[2] in (manager.SERVICE, manager.TUNNEL), 'Out-of-scope service manager command')
        result = command(*args)
        if args[1]=='show' and '--property=FreezerState' in args:
            with (root/'observed-freezer').open('a') as log: log.write(result.stdout.strip()+'\n')
        checkpoint = root/'coordinate-player'
        if args[1]=='thaw' and checkpoint.exists():
            # The test interleaves a normal joining player immediately after
            # thaw. The subsequent public probe, failed verification, drain,
            # process interruption and resume all use the manager's own code.
            checkpoint.rename(root/'admissions-open')
            until(lambda:(root/'holder-arrived').exists(),'Independent player did not join',35)
        return result
    manager.run = scoped
    sys.argv = [str(entry), *action]
    manager.main()


def stage(root, previous, candidate, checkout, sha):
    prefix = root/'installation'
    def blob(revision, name):
        return subprocess.run(['/usr/bin/git','-c','safe.directory='+str(checkout),'-C',str(checkout),
                               'cat-file','blob',revision+':'+name],check=True,capture_output=True).stdout
    for revision, source in [(OLD,previous),(sha,candidate)]:
        require((source/'build-info.json').read_bytes()==blob(revision,'build-info.json')
                and (source/'shared/multiplayer/build.mjs').read_bytes()==blob(revision,'shared/multiplayer/build.mjs'),
                'Export does not match the requested revision')
    for name, source in [(OLD,previous),(sha,candidate)]:
        target = prefix/'releases'/name
        shutil.copytree(source,target,symlinks=True)
        for directory, _, files in os.walk(target):
            Path(directory).chmod(0o755)
            for name in files:
                file=Path(directory)/name
                if not file.is_symlink():
                    file.chmod(0o755 if file.stat().st_mode & 0o111 else 0o644)
    (prefix/'current').symlink_to(prefix/'releases'/OLD)
    ops = prefix/'operations'/sha
    installed_ops=candidate.parent.parent/'operations'/sha
    require((installed_ops/'REVISION').read_text().strip()==sha and
            (installed_ops/'server/node_modules').resolve()==(candidate/'server/node_modules').resolve(),
            'Expected the matching staged operations bundle')
    for name in ('deploy/online/manage.py', 'deploy/online/prepare-rollback.mjs', 'tools/network-pilot-probe.mjs'):
        out=ops/name
        out.parent.mkdir(parents=True,exist_ok=True)
        staged=(installed_ops/name).read_bytes()
        require(staged==blob(sha,name),'Staged operations differ from the release revision')
        out.write_bytes(staged); out.chmod(0o644)
    (ops/'server').mkdir();(ops/'server/node_modules').symlink_to(prefix/'releases'/sha/'server/node_modules')
    (ops/'REVISION').write_text(sha+'\n')
    shutil.copyfile(__file__,root/'fixture.py')
    shutil.copyfile(Path(__file__).with_name('release-cutover-client.mjs'),root/'client.mjs')
    (root/'client.mjs').chmod(0o644)
    (root/'history/backups').mkdir(parents=True,mode=0o700)
    return prefix


def drill(previous, candidate, checkout, sha, receipt):
    require(os.geteuid()==0,'Disposable systemd units require sudo')
    # The service UID must traverse the immutable public release. Config,
    # state, captured edge output and backups explicitly have private modes.
    os.umask(0o022)
    require(re.fullmatch('[0-9a-f]{40}',sha) and sha!=OLD, 'Expected a fresh candidate revision')
    require(not receipt.exists(),'Choose a new receipt')
    require((previous/'server/node_modules').is_dir() and (candidate/'server/account-backup.mjs').is_file(),
            'Need isolated old and new release directories and installed dependencies')
    def production_identity():
        return ((Path('/opt/cartridge-strike2-pilot/current').resolve()).name,
                *(command('systemctl','show',name,'--property=MainPID','--value').stdout.strip()
                  for name in ('cartridge-strike2-pilot','cartridge-strike2-tunnel')))
    production=production_identity()
    root=Path(tempfile.mkdtemp(dir='/var/lib',prefix='cs3-release-drill-'))
    root.chmod(0o755)
    unit_names=[root.name+'-game',root.name+'-edge']
    procs=[]
    units=[]
    try:
        prefix=stage(root,previous,candidate,checkout,sha)
        config=root/'config';config.mkdir(mode=0o700)
        state=root/'state';state.mkdir(mode=0o700);os.chown(state,UID,GID)
        port=free_port()
        (root/'fixture.json').write_text(json.dumps({'revision':sha,'port':port}))
        game_invite=secrets.token_urlsafe(32)
        family=secrets.token_urlsafe(32)
        env_invite='CS2_PILOT_INVITE='+game_invite+'\n'
        atomic_private(config/'invite.env',env_invite)
        origin_file=root/'public-origin'
        (config/'public-origin').symlink_to(origin_file)
        atomic_private(config/'game.env',f'PORT={port}\nCS2_PUBLIC_ORIGIN_FILE={origin_file}\nCS2_FAMILY_ROOM_STATE={state}/settings.json\nCS2_FAMILY_ROOM_PASSWORD={family}\n'+env_invite)
        # Seed a family file with the old implementation's own validated defaults.
        command('/usr/bin/node','--input-type=module','-e',
                "import {openFamilyRoom} from './server/family-room.mjs'; void openFamilyRoom({familyPassword:process.env.DRILL_FAMILY,familyStateFile:process.env.DRILL_STATE}).settings;",
                cwd=prefix/'releases'/OLD,user=UID,group=GID,extra_groups=(),env={'DRILL_FAMILY':family,'DRILL_STATE':str(state/'settings.json')})
        def unit(name, body):
            dest=UNIT_DIR/(name+'.service')
            with dest.open('x') as out: out.write('[Unit]\nDescription=Disposable CS3 operator rehearsal\n[Service]\n'+body+
                f'\nUser={UID}\nGroup={GID}\nNoNewPrivileges=yes\nPrivateTmp=yes\nProtectSystem=strict\nProtectHome=yes\n')
            units.append(dest)
        unit(unit_names[0],f'WorkingDirectory={prefix}/current\nEnvironmentFile={config}/game.env\nExecStart=/usr/bin/node --import ./server/register-shared.mjs server/local-server.mjs\nReadWritePaths={state}\nStandardOutput=null\nStandardError=null')
        log=root/'connector.log';log.touch(mode=0o600)
        # Only this invite-gated port is exposed. Credentials and edge logs remain private.
        unit(unit_names[1],f'ExecStart=/opt/cartridge-strike2-pilot/bin/cloudflared tunnel --no-autoupdate --metrics 127.0.0.1:0 --grace-period 3s --protocol http2 --url http://127.0.0.1:{port}\nStandardOutput=append:{log}\nStandardError=inherit')
        command('systemctl','daemon-reload');command('systemctl','start',*unit_names)
        pattern=r'\|\s*(https://[A-Za-z0-9-]+\.trycloudflare\.com)\s*\|'
        origin=until(lambda:re.search(pattern,log.read_text()),'No temporary external HTTPS address',90).group(1)
        origin_file.write_text(origin);origin_file.chmod(0o644)
        def accessible():
            try:
                with urllib.request.urlopen(origin+'/room/JESPERS-ROOM',timeout=4) as res:
                    return res.status==200 and b'name="invite"' in res.read()
            except (OSError,urllib.error.URLError):return False
        until(accessible,'External invite gate was unreachable',180)
        def spawn_op(*args):
            p=subprocess.Popen(['/usr/bin/python3','-I',str(root/'fixture.py'),'operator',str(root),*args],
                               stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            procs.append(p);return p
        samples={}
        def observe_probe(p):
            # Only inspect command identity under this test manager. The probe's
            # environment contains its ephemeral invite and is never read.
            try: children=Path(f'/proc/{p.pid}/task/{p.pid}/children').read_text().split()
            except FileNotFoundError:return
            for child in children:
                proc=Path('/proc')/child
                try:
                    argv=(proc/'cmdline').read_bytes().split(b'\0')
                    if argv[:2] != [b'/usr/bin/node',b'tools/network-pilot-probe.mjs']:continue
                    status=(proc/'status').read_text()
                except (FileNotFoundError,ProcessLookupError):continue
                uid=re.search(r'^Uid:\s+(\d+)\s+(\d+)',status,re.M)
                gid=re.search(r'^Gid:\s+(\d+)\s+(\d+)',status,re.M)
                require(uid and gid,'No process identity for public verifier')
                actual=(int(uid[2]),int(gid[2]))
                require(actual==(UID,GID),'Public verification ran under another account')
                samples[child]=actual
        def collected(p, seconds=150):
            deadline=time.monotonic()+seconds
            while p.poll() is None:
                observe_probe(p)
                if time.monotonic()>=deadline:raise RuntimeError('Isolated manager timed out')
                time.sleep(.05)
            return p.communicate()
        def op(*args, expected_failure=None):
            p=spawn_op(*args);out,err=collected(p)
            if expected_failure:
                require(p.returncode and expected_failure in err,'Expected occupied-room refusal; got '+safe_failure(err))
            else:
                require(p.returncode==0,'Operator outcome for '+args[0]+': '+safe_failure(err))
            reports=[]
            for line in out.splitlines():
                try: result=json.loads(line)
                except ValueError: continue
                if isinstance(result,dict) and result.get('status')=='PASS':reports.append(result)
            return reports
        def client(mode):
            p=subprocess.Popen(['/usr/bin/node',str(root/'client.mjs'),str((prefix/'current').resolve()),mode],
                 stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,
                 user=UID,group=GID,extra_groups=(),env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})
            procs.append(p);p.stdin.write(json.dumps({'origin':origin,'invite':game_invite,'familyPassword':family})+'\n');p.stdin.flush()
            if mode=='write':
                out=p.communicate(timeout=45)[0];require(p.returncode==0 and 'DONE' in out,'Independent settings/account write failed');return
            require(select.select([p.stdout],[],[],35)[0] and p.stdout.readline().strip()=='SEAT_HELD','Independent seat did not enter')
            return p
        def depart(p):
            out=p.communicate('leave\n',timeout=20)[0];require(p.returncode==0 and 'DONE' in out,'Independent seat failed to leave voluntarily')
            until(lambda:read_health(port)['rooms']==0,'Room did not dispose')
        def public_report(reports):
            require(len(reports)==1 and reports[0]['clients']==2 and reports[0]['status']=='PASS','Two independent public SDK clients required')
            r=reports[0]
            require(r['path']=='HTTPS/WSS via public origin','Probe must use public TLS')
            # The shipped probe deliberately produces a credential-free receipt.
            return r
        installed=prefix/'operations'/sha/'deploy/online/manage.py'
        result={'candidate':sha,'operatorSha256':hashlib.sha256(installed.read_bytes()).hexdigest(),'previous':OLD,'gameUid':UID}
        result['previousBuild']=read_health(port)['contract']['buildHash']
        holder=client('hold');op('activate',sha,expected_failure='A room is still occupied or reserved.')
        require((prefix/'current').resolve().name==OLD and read_health(port)['players']==1,'Busy authority must remain serving its player')
        depart(holder);result['occupiedActivationRefused']=True
        result['activate']=public_report(op('activate',sha))
        require(int(command('systemctl','show',unit_names[0],'--property=MainPID','--value').stdout)>0,'No actual staged process')
        print('CS3 activation and public verification passed',flush=True)
        result['candidateBuild']=read_health(port)['contract']['buildHash']
        client('write')
        result['rollback']=public_report(op('rollback'))
        print('CS2 rollback and public verification passed',flush=True)
        require((prefix/'current').resolve().name==OLD and read_health(port)['contract']['buildHash']==result['previousBuild'],'Previous game did not recover')
        conversion=list((root/'history/backups').glob('*/downgrade/receipt.json'))
        require(len(conversion)==1,'Expected one cold conversion')
        result['conversion']=json.loads(conversion[0].read_text())
        with sqlite3.connect(f'file:{conversion[0].with_name("verified.sqlite")}?mode=ro',uri=True) as db:
            require(db.execute('SELECT count(*) FROM users').fetchone()[0]==1,'Post-upgrade account missing from validated backup')
        require('mapId' in result['conversion']['adjustedFields'] and json.loads((state/'settings.json').read_text())['settings']['mapId']=='floor5-prepared',
                'Old map compatibility was not restored')
        result['preservedAccounts']=1
        # Verify rejection and natural drain against an actual occupied candidate.
        (root/'coordinate-player').touch()
        atomic_private(config/'invite.env','CS2_PILOT_INVITE='+secrets.token_urlsafe(32)+'\n')
        failing=spawn_op('activate',sha)
        until(lambda:(root/'admissions-open').exists(),'Candidate did not reopen admissions',50)
        holder=client('hold');(root/'holder-arrived').touch()
        pending=root/'history/cutover-pending.json'
        until(lambda:pending.exists() and json.loads(pending.read_text())['phase']=='rollback-pending','Failed public verification did not persist recovery',90)
        require((prefix/'current').resolve().name==sha and read_health(port)['players']==1,'Busy candidate was interrupted')
        failing.terminate();failing.wait(timeout=8)
        atomic_private(config/'invite.env',env_invite)
        recovering=spawn_op('resume')
        time.sleep(6)
        require(recovering.poll() is None and read_health(port)['players']==1,'Resumed operator interrupted a live seat')
        depart(holder)
        out,err=collected(recovering,140)
        require(recovering.returncode==0,'Recovery probe failed: '+safe_failure(err))
        require(any(line.startswith('{') and json.loads(line).get('status')=='PASS' for line in out.splitlines()),'Missing public rollback probe')
        require(not pending.exists() and (prefix/'current').resolve().name==OLD and read_health(port)['rooms']==0,'Restored census or journal differed')
        require(list((root/'history/backups').glob('*/rollback-verified')),'Missing verified rollback record')
        result.update(status='PASS',publicVerifyFailure=True,operatorInterrupted=True,liveSeatPreservedOnResume=True,verifiedRecovery=True,
                      finalBuild=read_health(port)['contract']['buildHash'],finalRooms=read_health(port)['rooms'])
        freezer=(root/'observed-freezer').read_text().splitlines()
        require(len(freezer)>=4 and all(x=='frozen' for x in freezer),'Expected actual kernel freezer observations')
        require(len(samples)>=3,'Expected game UID observations on activate, rollback and restored verification')
        require(result['rollback']['build']==result['previousBuild'] and result['activate']['build']==result['candidateBuild'],
                'Public verifier selected the wrong release')
        require(production_identity()==production,'Production identity changed during rehearsal')
        result['productionReleaseAndServiceIdsStable']=True
        result['verifiedConnectorFences']=len(freezer)
        result['observedProbeUids']=[uid for uid,_ in samples.values()]
        with receipt.open('x') as out: json.dump(result,out,indent=2);out.write('\n')
        receipt.chmod(0o644)
        print('PASS disposable CS2 → CS3 → CS2 cutover, failed verification and resumed recovery')
    finally:
        for process in procs:
            if process.poll() is None: process.terminate()
        for process in procs:
            if process.poll() is None:
                try: process.wait(timeout=4)
                except subprocess.TimeoutExpired:process.kill();process.wait()
        guards=command('systemctl','list-units','--all','--plain','--no-legend',root.name+'-guard-*.service').stdout
        for row in guards.splitlines():
            name=row.split()[0]
            if re.fullmatch(re.escape(root.name)+r'-guard-[a-f0-9]{32}\.service',name):
                subprocess.run(['systemctl','stop',name],capture_output=True)
        for file in units: subprocess.run(['systemctl','stop',file.stem],capture_output=True)
        for file in units: file.unlink(missing_ok=True)
        if units: subprocess.run(['systemctl','daemon-reload'],capture_output=True)
        shutil.rmtree(root)


def safe_failure(text):
    # Only manager exceptions with known local messages may leave the subprocess.
    line=text.strip().splitlines()[-1] if text.strip() else 'no diagnostic'
    return line if line.startswith(('RuntimeError:','PermissionError:','ValueError:')) and not re.search(r'https?://|invite=|Cookie',line,re.I) else 'staging process failed'


if __name__=='__main__':
    if sys.argv[1:2]==['operator']:
        operator(Path(sys.argv[2]),sys.argv[3:])
    elif len(sys.argv)==6:
        def interrupt(_signal,_frame): raise KeyboardInterrupt
        signal.signal(signal.SIGTERM,interrupt)
        drill(*map(lambda p:Path(p).resolve(),sys.argv[1:4]),sys.argv[4],Path(sys.argv[5]).resolve())
    else:
        raise SystemExit('Usage: sudo python3 release-cutover.py PREVIOUS_RUNTIME CANDIDATE_PILOT CHECKOUT REVISION NEW_RECEIPT')
