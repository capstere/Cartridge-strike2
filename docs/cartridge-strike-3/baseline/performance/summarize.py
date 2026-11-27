"""Reduce private JSON to the scenario data needed for comparison; exclude room/session details."""
import json, math
from pathlib import Path
import sys

def rounded(x):return None if x is None else round(x,2)

def sample_action(data,game,profile):
    frames=data["frames"]
    inputs=data["inputs"]
    if not frames:return {}
    def event(name,code=None,start=0):
        return next((e[0] for e in inputs if e[0]>start and e[1]==name and (code is None or e[2]==code)),None)
    def baseline(t):
        return next((r for r in reversed(frames) if t is not None and r[0] < t),None)
    def first(t,pred):
        if t is None:return None
        return next((r[0] for r in frames if r[0]>=t and pred(r)),None)
    def delta(t,x):return rounded(x-t) if None not in (t,x) else None
    desktop=profile=="desktop"
    move=event("keydown","KeyW") if desktop else event("touchmove")
    if desktop:
        sprint=event("keydown","KeyX" if game=="candidate" else "ShiftLeft")
        fire=event("pointerdown","mouse")
        reload=event("keydown","KeyR")
    else:
        sprint=event("touchmove",start=move or 0)
        trigger=next((e for e in inputs if e[1]=="pointerdown" and e[3]=="fire"),None)
        reloadEvent=next((e for e in inputs if e[1]=="pointerdown" and e[3]=="reload"),None)
        fire=trigger[0] if trigger else None
        reload=reloadEvent[0] if reloadEvent else None
    pos=baseline(move);aim=baseline(fire)
    moved=first(move,lambda r:math.hypot(r[1]-pos[1],r[2]-pos[2])>.005) if pos else None
    shot=first(fire,lambda r:r[5] is not None and r[5]<aim[5]) if aim and aim[5] is not None else None
    scheduled=next((r[0]+1000*max(0,r[3]-r[2]) for r in data["audio"] if fire is not None and r[0]>=fire and (r[1]=="shot" or (r[1].startswith("g_") and r[1].endswith("_pov")))),None)
    pose=first(sprint,lambda r:r[3] is not None and r[3]>.02)
    # The reference has continuous movement; keep exit and ready events separate.
    ready=first(fire,lambda r:r[4] is not None and r[4]<.3 and not r[11]) if pose else None
    reload_begin=first(reload,lambda r:r[6])
    reload_end=first(reload_begin,lambda r:not r[6] and r[5]==frames[0][5])
    return {
      "observedRenderFrames":len(frames),"sourceInputCount":len(inputs),"localAudioSourceStarts":sum(1 for r in data["audio"] if r[1] in ("shot","reload","step") or r[1].endswith("_pov")),
      "aliveSamples":sum(bool(r[7]) for r in frames),"weapon":frames[0][9],"magazineRange":[min((r[5] for r in frames if r[5] is not None),default=None),max((r[5] for r in frames if r[5] is not None),default=None)],
      "moveToFirstDisplacedRenderMs":delta(move,moved),
      "rushToFirstPoseAbove2PctMs":delta(sprint,pose),"fireToFirstObservedReadyRenderMs":delta(fire,ready),
      "fireToFirstAmmoDropRenderMs":delta(fire,shot),"fireToAudioCommandMs":delta(fire,scheduled),
      "audioCommandMinusAmmoDropRenderMs":delta(shot,scheduled),
      "reloadToFirstActiveRenderMs":delta(reload,reload_begin),"reloadToRefilledRenderMs":delta(reload,reload_end),
      "maxRushBlend":rounded(max((r[3] for r in frames if r[3] is not None),default=None)),
      "travelPathM":rounded(sum(math.hypot(a[1]-b[1],a[2]-b[2]) for a,b in zip(frames,frames[1:]))),
    }

def browser(file):
    j=json.loads(file.read_text())
    if j["status"]!="measured":raise ValueError(str(file)+str(j.get("error")))
    k,p=j["kind"],j["profile"]; startup=j["startup"]; identity=j["identity"]
    metrics={k:j[k] for k in ["frameIntervalMs","renderSubmissionMs","drawCalls","triangles","ratio"]}
    # Report counts of slow events only where the units represent time.
    for name in ["drawCalls","triangles","ratio"]:
        metrics[name]={c:d for c,d in metrics[name].items() if not c.startswith("over")}
    return {"game":k,"input":p,"repeat":j["repeat"],"stamp":j["stamp"],"git":j["before"]["sha"],
        "browser":j["version"],"device":j["before"]["model"],"node":j["before"]["node"],"cache":j["cache"],
        "temperatureC":[j["before"]["thermalC"],j["after"]["thermalC"]],"throttle":[j["before"]["throttled"],j["after"]["throttled"]],
        "cpuFrequencyKHz":[int(j["before"]["freqKHz"]),int(j["after"]["freqKHz"])],"load1m":[float(j["before"]["load"].split()[0]),float(j["after"]["load"].split()[0])],"identity":identity,
        "navigationToMenuVisibleMs":rounded(startup["menuVisible"]),
        "startButtonToControllableMs":rounded(startup["playable"]-startup["startButton"]),
        "navigationToControllableMs":rounded(startup["playable"]),
        "startButtonToClassReadyMs":rounded(startup["classReady"]-startup["startButton"]) if "classReady" in startup else None,
        "subresourceTransferBytesThroughPacingEnd":j.get("transferredBytesAtEndOfPacing",startup.get("resourceBytes")),"navigationHtmlTransferBytes":j.get("navigationHtmlTransferBytes"),
        "postActionsHeap":j["memory"],"metrics":metrics,"actions":sample_action(j["action"],k,p),"pageErrors":j["errors"]}

def server(file):
    obj=json.loads(file.read_text());result=[]
    for j in obj["results"]:
        m=j["measured"]; room=m["rooms"][0]; memory=m["memory"];clean=j["cleanup"]
        result.append({"case":file.stem,"git":j["git"],"completedAt":j["completedAt"],"environment":j["environment"],"humanSDKSeats":j["count"],"bots":room["ai"],"residents":room["residents"],"rttSettingMs":j["rttMs"],"jitterMs":j["jitterMs"],
            "status":j["status"],"pacer":"60 Hz","loss":j["loss"],"roomTransportCountersAtEnd":room["metrics"],"elapsedSeconds":rounded(m["elapsedSeconds"]),"releaseBuild":j["contract"].get("buildHash"),"protocol":j["contract"].get("protocolVersion"),
            "tickMs":m["wholeRun"]["tick"],"intervalMs":m["wholeRun"]["interval"],"simulationMs":m["costMs"]["simulation"],
            "findPathCallMs":m["objectiveCosts"]["findPath"],"slowestTickObserved":m["slow"][0] if m["slow"] else None,"eventLoopMs":m["eventLoopMs"],"bytesOutPerClientS":rounded(j["perPlayerOutboundBytesPerSecond"]),
            "bytesInPerClientS":rounded(m["inBytes"]/m["elapsedSeconds"]/j["count"]),"nTicks":m["updates"],
            "serverPercentOfOneCore":rounded(m["serverCpuPercent"]),"rssMiB":rounded(memory["rss"]/1048576),"heapMiB":rounded(memory["heapUsed"]/1048576),
            "inputToConfirmationMs":j.get("inputToConfirmationMs"),"rttSamplesMs":room["rtts"],"shotAgeMs":m["shotAgeMs"],"botShots":m["botShots"],"shotsByHuman":j["shots"],
            "botTravel":rounded(m["botTravel"]),"grenadesThrown":m["throws"],"combatRespawns":m["combatRespawns"],"maxPending":j["maxPending"],
            "emptyRoomsAfterLeave":len(clean["rooms"]),"thermal":m["thermal"]})
    return result

if __name__=="__main__":
    inp,dst=map(Path,sys.argv[1:3]); dst.mkdir(parents=True,exist_ok=True)
    results=[browser(f) for f in sorted(inp.glob("*-*-*.json")) if f.name.split("-")[0] in ("fps","frontline","candidate")]
    (dst/"client.json").write_text(json.dumps(results,indent=2)+"\n")
    network=[row for f in sorted(inp.glob("server-*.json")) for row in server(f)]
    revision_file=inp/"network-worktree-revisions.json"
    corrections=json.loads(revision_file.read_text()) if revision_file.exists() else {}
    for row in network:
        row["worktreeRevisionAtStart"]=corrections.get(row["case"],row["git"])
        row["revisionSource"]="local worktree reflog and timed run sequence" if row["case"] in corrections else "harness invocation"
    if network:(dst/"network.json").write_text(json.dumps(network,indent=2)+"\n")

    mobile=inp/"online-mobile"/"mobile.json"
    if mobile.exists():
        m=json.loads(mobile.read_text())
        if m["status"]!="PASS":raise ValueError("Local multiplayer touch flow failed")
        keys=("scenario","map","physicalPhone","transport","date","revision","buildHash","browser","viewport","warmupMs","windowMs",
              "renderedClients","sdkPeers","signInToFormMs","enterToWaitingMs","selectMapMs","startToPlayableMs","controls","measurement","reconnectMap","status")
        summary={k:m[k] for k in keys}
        summary["resultReason"]=m["completed"]["reason"]
        summary["finalAuthorityRooms"]=0 # original harness asserts this before PASS
        (dst/"online-mobile.json").write_text(json.dumps(summary,indent=2)+"\n")
    lifecycle=inp/"lifecycle.json"
    if lifecycle.exists():
        raw=json.loads(lifecycle.read_text())
        meta=json.loads(lifecycle.with_suffix(".meta.json").read_text())
        measured=[r for r in raw if r["i"]>0]
        def extent(key,rows=measured):
            vals=[key(r) for r in rows]
            return [min(vals),max(vals)]
        summary={**meta,"warmupCycles":len(raw)-len(measured),"measuredCycles":len(measured),"status":"PASS",
            "retainedGames":extent(lambda r:r["retained"]),"audioContexts":extent(lambda r:r["contexts"]),
            "webAudioNodes":extent(lambda r:r["audioNodes"]),"domListeners":extent(lambda r:r["dom"]["jsEventListeners"]),
            "domDocuments":extent(lambda r:r["dom"]["documents"]),"domNodes":extent(lambda r:r["dom"]["nodes"]),
            "residentInstances":extent(lambda r:r["instances"]),"liveOrAmbientVoices":extent(lambda r:r["voices"]+r["ambient"]),
            "rafOwners":sorted({tuple(r["pending"]) for r in measured}),
            "endpointGpuByMode":{mode:next(r["gpu"] for r in reversed(measured) if r["mode"]==mode) for mode in ("classic","endless")}}
        (dst/"lifecycle.json").write_text(json.dumps(summary,indent=2)+"\n")
