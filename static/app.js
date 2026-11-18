/* Career Conversation Challenge: facilitator and player single-page interface. */
'use strict';
const root = document.querySelector('#root');
const toastEl = document.querySelector('#toast');
let mode = 'welcome';
let credentials = null;
let game = null;
let room = null;
let lastSignature = '';
let draft = '';
let dirty = false;
let messageTimer = null;
let refreshActive = false;
let aiRequested = false;
let aiConnectionResult = null;

const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatText = value => h(value).replace(/\n/g,'<br>');
const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const teamName = (tid, teams = game?.teams ?? []) => teams.find(t => t.id === tid)?.name ?? tid;
const roundKey = () => `cc-draft-${credentials?.code}-${game?.round}`;
function notify(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => toastEl.classList.remove('visible'), 3800);
}
function topbar(){
  const right = mode === 'host' ? `<span class="pill green">● Facilitator</span>` : mode === 'player' ? `<span class="pill green">● Live participant</span>` : `<span><span class="statusdot"></span>Team learning experience</span>`;
  return `<header class="sitehead"><div class="headinner"><a class="brand" href="/" aria-label="Career Conversation Challenge home"><span class="logo">✦</span><span>Career Conversation <span class="onlydesktop">Challenge</span></span></a><div class="headright">${right}</div></div></header>`;
}
function footer(){return `<footer class="foot">A team-based career coaching practice game · 6 scenarios · Up to 10 teams · AI feedback available</footer>`;}
function card(content, extra=''){return `<section class="card ${extra}">${content}</section>`;}
function app(content){root.innerHTML = topbar() + `<main class="shell">${content}${footer()}</main>`;bindControls();renderLobbyQRCode();window.SceneAudio?.updateButtons();}
function participantJoinUrl(){return `${location.origin}/?join=${encodeURIComponent(game.code)}`;}
function paintJoinQR(target,joinUrl){
 if(!target)return;
 target.replaceChildren();
 if(typeof window.QRCode!=='function'){target.textContent='QR code unavailable. Please share the join link or room code.';return;}
 try{
  new window.QRCode(target,{text:joinUrl,width:228,height:228,colorDark:'#142855',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});
 }catch(err){target.textContent='QR code unavailable. Please share the join link or room code.';}
}
function renderLobbyQRCode(){
 if(mode==='host'&&game?.phase==='lobby')paintJoinQR(document.querySelector('#lobbyJoinQR'),participantJoinUrl());
}
function showJoinQRDialog(){
 if(mode!=='host'||!game)return;
 const dialog=document.querySelector('#inviteDialog');if(!dialog)return;
 const url=participantJoinUrl();
 dialog.querySelector('[data-room-code]').textContent=game.code;
 const link=dialog.querySelector('[data-join-url]');link.href=url;link.textContent=url;
 dialog.querySelector('#modalJoinQR').setAttribute('aria-label',`QR code to join room ${game.code}`);
 paintJoinQR(dialog.querySelector('#modalJoinQR'),url);
 dialog.showModal();
}
async function api(path, payload) {
  const res = await fetch(`/api/${path}`, {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let out;
  try{out=await res.json()}catch{throw Error(`Server error (${res.status})`)}
  if(!res.ok) throw Error(out.error || 'Something went wrong.');
  return out;
}
function goto(url){history.replaceState(null,'',url);}
function welcome(){
  window.SceneAudio?.stop('Ready to play');
  mode='welcome';game=null;credentials=null;
  app(`<section class="hero"><div class="eyebrow">Grow great managers, together</div><h1>Better career conversations start with practice.</h1><p>A live team challenge where managers write their responses to realistic employee situations, vote for strong answers, and receive AI-assisted feedback on their coaching skills.</p></section>
    <div class="grid2">
    ${card(`<span class="pill">🎤 For the facilitator</span><h2 style="margin-top:20px">Host a live game</h2><p class="muted">Create a room, invite participants, control each round, reveal coaching guidance, and review or adjust AI scores.</p><div class="field"><label for="teamCount">Number of teams</label><select id="teamCount" class="select">${Array.from({length:9},(_,i)=>`<option value="${i+2}" ${(i+2)===5?'selected':''}>${i+2} teams · up to ${(i+2)*4} players</option>`).join('')}</select></div><button class="btn full" data-action="create">Create game room <span>→</span></button>`)}
    ${card(`<span class="pill green">👥 For team members</span><h2 style="margin-top:20px">Join your team</h2><p class="muted">Ask your facilitator for the six-character room code, then join from your own phone or laptop.</p><div class="field"><label for="joinCode">Game room code</label><input id="joinCode" class="input" placeholder="e.g. ABC234" autocomplete="off" maxlength="6" style="text-transform:uppercase;letter-spacing:.12em;font-weight:800"></div><button class="btn secondary full" data-action="find-room">Join a game <span>→</span></button>`)}
    </div><div class="grid3" style="margin-top:18px">${[['01','Respond as the manager','Teams collaborate on one response per scenario.'],['02','Vote for the strongest answer','Every participant votes for another team.'],['03','AI scores and debrief','AI grades three coaching behaviors, with facilitator overrides.']].map(([n,title,desc])=>`<div class="metric"><div class="kicker">STEP ${n}</div><h3 style="margin:10px 0 5px">${title}</h3><p class="muted small" style="margin:0">${desc}</p></div>`).join('')}</div>`);
}
function currentJoinCode(){return String(document.querySelector('#joinCode')?.value || '').trim().toUpperCase();}
async function findRoom(code) {
  code=(code||currentJoinCode()).toUpperCase().trim();
  if(code.length!==6){notify('Please enter the six-character room code.');return;}
  try {room = await api('room',{code});mode='join';credentials={code};goto(`/?join=${encodeURIComponent(code)}`);renderJoin();}
  catch(e){notify(e.message)}
}
function renderJoin(){
  let teams=room.teams;
  app(`<section class="hero"><div class="eyebrow">Welcome to room ${h(room.code)}</div><h1>Choose your team.</h1><p>Enter your name and choose a team. The first member can give the team a custom name; everyone else joins using their own name so the full team roster is displayed.</p></section>
    ${card(`<div class="grid2"><div><div class="field" style="margin-top:0"><label for="playerName">Your name</label><input class="input" id="playerName" maxlength="50" placeholder="First and last name" autocomplete="name"></div><div class="kicker" style="margin-bottom:12px">Select a team (maximum four people)</div><div class="teamlist" id="teamSelect">${teams.map((t,i)=>`<label class="teamtile ${t.count>=4?'full':''}" data-team="${h(t.id)}"><span><input type="radio" name="team" value="${h(t.id)}" ${t.count>=4?'disabled':''} style="margin-right:8px"> <strong>${h(t.name)}</strong></span><span class="small muted">${t.count}/4 joined</span></label>`).join('')}</div><div id="joinTeamNameField" class="field" hidden><label for="joinTeamName">Give your team a name (optional)</label><input class="input" id="joinTeamName" maxlength="40" placeholder="e.g. The Growth Gurus" autocomplete="off"><p class="small muted" style="margin:8px 0 0">First person to join this team can choose its name. You can also change it in the lobby.</p></div><button class="btn full" style="margin-top:20px" data-action="join">Join team <span>→</span></button><button class="btn ghost full" style="margin-top:9px" data-action="reload-room">Refresh team availability</button></div><div class="banner"><strong>How the game works</strong><p class="small muted">1. Discuss the employee's situation with your teammates.</p><p class="small muted">2. One member submits your team's response.</p><p class="small muted">3. Vote for another team's answer.</p><p class="small muted">4. Compare coaching techniques and see the scoreboard.</p><hr class="divider"><p class="small muted" style="margin-bottom:0">If the facilitator has already started, you can still join an available team.</p></div></div>`)}`);
}
async function doJoin(){
  const name=document.querySelector('#playerName')?.value.trim();
  const team=document.querySelector('input[name=team]:checked')?.value;
  const team_name=document.querySelector('#joinTeamNameField:not([hidden]) #joinTeamName')?.value.trim() || '';
  if(!name||!team){notify('Enter your name and select a team.');return;}
  try{
    const result=await api('join',{code:credentials.code,name,team,team_name});
    localStorage.setItem(`cc-member-${credentials.code}`,result.member_id);
    mode='player';credentials={code:result.code,member_id:result.member_id};lastSignature='';draft='';dirty=false;
    await refresh(true);
  }catch(e){notify(e.message)}
}
function roomPanel(){
 const joinUrl=participantJoinUrl();
 return `<div class="roomtop roomtop-qr"><div class="room-invite-copy"><div class="kicker">Your game room code</div><div class="roomcode">${h(game.code)}</div><div class="small muted">Participants can scan the QR code with their phone camera to join this room and select a team.</div><div class="join-url">${h(joinUrl)}</div></div><div class="qr-section"><div class="qr-box" id="lobbyJoinQR" role="img" aria-label="QR code to join room ${h(game.code)}"></div><div class="small muted center" style="margin-top:8px">Scan to join instantly</div></div><div class="room-invite-actions"><div class="copyline"><button class="btn secondary" data-action="copy-link">Copy participant link ⧉</button><button class="btn ghost" data-action="copy-code">Copy code</button></div><div class="note">Only the participant link is encoded in the QR code. Keep your facilitator URL private; it contains the host key.</div></div></div>`;
}
function phasebar(){
 const round=game.round;return `<div class="phasebar" aria-label="Round ${round+1} of ${game.round_count}">${Array.from({length:game.round_count},(_,i)=>`<span class="${i<round?'done':i===round?'active':''}"></span>`).join('')}</div>`;
}
function scenarioCard(){
 let s=game.scenario;
 return card(`<div class="votehead"><span class="tag">ROUND ${game.round+1} OF ${game.round_count} · ${h(s.tag)}</span><span class="pill gray">${h(s.level)}</span></div>${phasebar()}<h2 class="roundtitle">${h(s.title)}</h2><img class="scenario-image" src="${h(s.image)}" alt="Employee and manager discussing ${h(s.tag.toLowerCase())} in an office" loading="eager">${window.SceneAudio?.panel(game) || ""}<div class="quotebox"><span class="kicker">The employee says</span><p class="quote" style="margin:10px 0 0">“${h(s.employee)}”</p></div><div class="kicker">Manager context</div><p style="line-height:1.65;margin:9px 0 19px">${h(s.context)}</p><div class="banner"><strong>Your coaching challenge</strong>${h(s.question)}</div>`);
}
function scenarioRecap(){
 const s=game.scenario;
 return `<div class="scene-recap"><img src="${h(s.image)}" alt="Manager and employee in a career conversation"><div><div class="kicker">Round ${game.round+1} · ${h(s.tag)}</div><h2>${h(s.title)}</h2><p class="small">“${h(s.employee)}”</p></div></div>${window.SceneAudio?.panel(game, true) || ""}`;
}
function phaseLabel(){return {'lobby':'Lobby · waiting for players','write':'Responses open','vote':'Voting open','reveal':'Debrief and scoring','finished':'Game complete'}[game.phase]}
function hostOverview(){
 const controls={lobby:['start','Start round 1 →'],write:['vote','Open voting →'],vote:['reveal','Reveal responses + rubric →'],reveal:[game.round===game.round_count-1?'finish':'next',game.round===game.round_count-1?'Finish game →':'Next scenario →']}[game.phase];
 return `<div class="layouthead"><div><div class="eyebrow">Facilitator dashboard <span class="pill green" style="margin-left:8px">Live</span></div><h1>${h(phaseLabel())}</h1></div><div class="actions"><button class="btn secondary" data-action="show-join-qr">Show join QR ▦</button>${controls?`<button class="btn" data-action="phase" data-phase="${controls[0]}">${h(controls[1])}</button>`:''}</div></div>`;
}
function participantOverview(){
 const team=game.teams.find(t=>t.id===game.my_team);
 return `<div class="layouthead"><div><span class="pill green">${h(team?.name || 'Your team')}</span><span class="pill gray" style="margin-left:6px">${h(phaseLabel())}</span><h1 style="margin-top:12px">${game.phase==='lobby'?'Ready when you are.':game.phase==='finished'?'Great work!':'Your next coaching challenge'}</h1><p class="small muted" style="margin:7px 0 0">Team members: ${h(team?.members?.join(', ') || game.my_name || '')}</p></div><span class="small muted">Room ${h(game.code)}</span></div>`;
}
function teamRoster(){
 return card(`<div class="votehead"><h3 style="margin:0">Team roster</h3><span class="small muted">${game.teams.reduce((n,t)=>n+t.count,0)} / ${game.teams.length*4} joined</span></div><div class="teamlist" style="margin-top:14px">${game.teams.map(t=>`<div class="teamrow"><div><strong>${h(t.name)}</strong><div class="small muted">${t.members.length?h(t.members.join(', ')):'Waiting for teammates'}</div></div><span class="pill ${t.count>=4?'green':'gray'}">${t.count}/4</span></div>`).join('')}</div>`,'flat');
}
function aiConnectionPanel(){
 const detected = game.ai_key_detected;
 const model = game.ai_model || 'gpt-4.1-mini';
 const status = aiConnectionResult?.status;
 const heading = status==='ready'?'AI scoring test passed':status==='error'?'AI scoring test failed':status==='unconfigured'?'API key is missing':detected?'API key detected, not yet tested':'API key not detected';
 const message = aiConnectionResult?.message || (detected?'Test AI scoring to check your API key, billing, and model.':'The running service cannot see OPENAI_API_KEY. Link the environment group containing the key, then save and deploy.');
 const cssClass = status==='ready'?'ai-status-ok':(!detected||status==='error'||status==='unconfigured'?'ai-status-bad':'');
 return card('<h3>AI scoring connection</h3><div class="ai-connection-status '+cssClass+'"><strong>'+h(heading)+'</strong><p class="small">'+h(message)+'</p></div><button class="btn secondary" data-action="test-ai">Test AI connection</button><p class="note">The test grades a sample answer using the real API, with a small usage charge. Your key stays on the server. Model: '+h(model)+'</p>','flat');
}
function hostMetrics(){
 return `<div class="grid3"><div class="metric"><div class="caption">Teams in the room</div><div class="number">${game.teams.length}</div></div><div class="metric"><div class="caption">Responses submitted</div><div class="number">${game.submission_count}/${game.teams.length}</div></div><div class="metric"><div class="caption">Votes received</div><div class="number">${game.vote_count}</div></div></div>`;
}
function scoreboard(){
 const rows=game.teams.map(t=>({name:t.name,id:t.id,members:t.members||[],...game.standings[t.id]})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
 return card(`<div class="votehead"><h3 style="margin:0">🏆 Team leaderboard</h3><span class="pill">Rubric + vote bonus</span></div><table class="scoreboard" style="margin-top:12px"><thead><tr><th>Team</th><th class="right">Coach</th><th class="right">Bonus</th><th class="right">Total</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td><span class="rank">${i+1}</span> <span style="margin-left:6px">${h(r.name)}</span>${mode==='host'&&r.members.length?`<div class="leaderboard-roster">${h(r.members.join(' · '))}</div>`:''}</td><td class="right">${r.rubric}</td><td class="right">+${r.bonus}</td><td class="right" style="font-size:18px;color:#214eac">${r.total}</td></tr>`).join('')}</tbody></table><p class="note">Each round: up to 3 AI-assisted (facilitator-adjustable) coaching points; +1 bonus to the team(s) with the most audience votes (if any). Ties share the bonus.</p>`);
}
function writeArea(){
 const mine=game.responses[game.my_team];
 const version=mine?.version || 0;
 if(!dirty)draft=mine?.text || '';
 const teammateChange=dirty&&mine&&Number(window.currentDraftBase||0)!==version;
 if(!dirty)window.currentDraftBase=version;
 return card(`<span class="pill green">✍️ Team response</span><h3 style="margin:14px 0 8px">What would you actually say?</h3><p class="muted small">Talk with your teammates, then write one response on behalf of your team. Any member can submit an update until voting opens.</p>${teammateChange?`<div class="notify">A teammate has saved a newer answer. Copy your draft before you refresh to avoid overwriting their changes.</div>`:''}<div class="field"><label for="teamResponse">Your team's manager response</label><textarea id="teamResponse" class="textarea" maxlength="2200" placeholder="I'd start by saying…">${h(draft)}</textarea><div class="small muted" style="text-align:right;margin-top:5px">${draft.length}/2,200 characters</div></div><button class="btn full" data-action="submit-response">${mine?'Update team response':'Submit team response'} →</button>${mine?`<p class="note success">✓ Team answer saved · Version ${version}</p>`:''}`);
}
function writingHost(){
 return card(`<h3>Live submission status</h3><p class="muted small">Discuss the situation as a group. Ask one member of each team to submit their shared answer. You control when voting begins.</p><div class="teamlist">${game.teams.map(t=>`<div class="teamrow"><strong>${h(t.name)}</strong><span class="pill ${game.responses[t.id]?'green':'gray'}">${game.responses[t.id]?'✓ Submitted':'Still writing'}</span></div>`).join('')}</div>`,'flat');
}
function responseCards(){
 const responses=Object.entries(game.responses);
 if(!responses.length)return `<div class="empty">No team responses have been submitted yet.</div>`;
 return responses.map(([tid,r],i)=>{
 const revealed=game.phase==='reveal'||game.phase==='finished';
 const eligible=game.phase==='vote'&&mode==='player'&&tid!==game.my_team;
 const voted=game.my_vote===tid;
 const label=revealed||mode==='host'?teamName(tid):`Response ${String.fromCharCode(65+i)}`;
 const votes=revealed?`<span class="pill gray">${plural(game.vote_counts[tid]||0,'vote')}</span>`:'';
 const ai= revealed ? game.ai_feedback?.[tid] : null;
 const aiDetails=ai?`<div class="ai-result"><strong>✦ AI coaching review · ${ai.score}/3</strong><div class="small">Rubric: ${ai.criteria.map((v,i)=>`<span class="rubric-mark ${v?'hit':'miss'}">${i+1}: ${v?'✓':'—'}</span>`).join(' ')}</div><p><strong>Strength:</strong> ${h(ai.strength)}</p><p><strong>Next step:</strong> ${h(ai.improvement)}</p></div>`:'';
 return `<div class="responsecard"><div class="votehead"><strong>${h(label)} ${tid===game.my_team?'· Your team':''}</strong>${votes}</div><div class="body">${formatText(r.text)}</div>${aiDetails}${eligible?`<div class="actions" style="margin-top:15px"><button class="btn ${voted?'secondary':'dark'} smallbtn" data-action="cast-vote" data-team="${h(tid)}">${voted?'✓ Your vote':'Vote for this response'}</button></div>`:''}</div>`;
 }).join('');
}
function rubric(){
 const s=game.scenario;
 return card(`<h3>🎯 Coaching debrief</h3><p class="muted small">A strong manager response demonstrates these three behaviors:</p><div class="criteria">${s.criteria.map((c,i)=>`<div class="criterion"><span class="circle">${i+1}</span><span>${h(c)}</span></div>`).join('')}</div><div class="example" style="margin-top:18px"><div class="kicker" style="color:#167052">Example of a strong response</div><p style="margin:10px 0 0">${h(s.example)}</p></div><p class="note"><strong>Takeaway:</strong> ${h(s.takeaway)}</p>`);
}
function grading(){
 const ai=game.ai_scoring||{};
 const status=ai.status||'unconfigured';
 const statusBlock=status==='running'?`<div class="banner"><strong>✦ AI review in progress</strong> Scoring submitted answers against the three coaching behaviors. Scores update automatically.</div>`:
  status==='done'?`<div class="banner"><strong>✓ AI grading complete</strong> Review explanations below. You can override any score.</div>`:
  status==='error'?`<div class="notify"><strong>AI review failed:</strong> ${h(ai.message||'Please try again.')} <button class="btn smallbtn secondary" data-action="ai-score">Retry AI scoring</button></div>`:
  status==='unconfigured'?`<div class="notify"><strong>AI scoring not connected.</strong> To enable, set <code>OPENAI_API_KEY</code> on your private server. You can score manually below.</div>`:
  `<div class="banner"><strong>✦ AI coaching scores</strong> <button class="btn smallbtn" data-action="ai-score">Score submissions with AI</button></div>`;
 return card(`<h3>✦ Coaching scores</h3><p class="muted small">The AI evaluates three specific coaching behaviors (0–3 points). AI scores are suggestions; the facilitator can edit them. Crowd-vote bonus is calculated separately.</p>${statusBlock}<div class="teamlist" style="margin-top:16px">${game.teams.map(t=>`<div class="teamrow"><div><strong>${h(t.name)}</strong><div class="small muted">${game.responses[t.id]?'Response submitted':'No response'} ${game.ai_feedback?.[t.id]?'· ✦ AI reviewed':''}</div></div><div class="scorebtns" aria-label="Score ${h(t.name)}">${[0,1,2,3].map(i=>`<button class="${game.scores[t.id]===i?'selected':''}" data-action="score" data-team="${h(t.id)}" data-score="${i}" title="Award ${i} coaching points">${i}</button>`).join('')}</div></div>`).join('')}</div><p class="note">The AI scores clarity and coaching behavior, not which response sounds most polished. Missing submissions earn zero.</p>`);
}
function teamIdentityCard(){
 const team=game.teams.find(t=>t.id===game.my_team);
 return card('<span class="pill green">✓ You joined</span><h2 style="margin:14px 0 6px">'+h(team?.name || 'Your team')+'</h2><p class="small muted">Your team can decide on a name together before round 1. Only members of your team can update it.</p><div class="field"><label for="editTeamName">Team name</label><div class="team-edit-actions"><input id="editTeamName" class="input" maxlength="40" value="'+h(team?.name || '')+'" autocomplete="off"><button class="btn secondary" data-action="save-team-name">Save team name</button></div></div><div class="field"><label for="editMemberName">Your name (on the roster)</label><div class="team-edit-actions"><input id="editMemberName" class="input" maxlength="50" value="'+h(game.my_name || '')+'" autocomplete="name"><button class="btn secondary" data-action="save-member-name">Save my name</button></div></div><p class="small muted">Team and player names are locked when the first round begins.</p>','flat');
}
function lobby(){
 if(mode==='host')return `${roomPanel()}<div style="margin-top:18px">${aiConnectionPanel()}</div><div class="layouthead"><h1>Waiting for teams to join</h1><button class="btn" data-action="phase" data-phase="start">Start round 1 →</button></div><div class="grid2">${teamRoster()}${card(`<h3>Facilitator quick guide</h3><p class="muted">Plan roughly 35–45 minutes for six rounds.</p><div class="criteria"><div class="criterion"><span class="circle">1</span><span>Allow 2–3 minutes for team discussion and one shared answer.</span></div><div class="criterion"><span class="circle">2</span><span>Open voting so participants can choose an answer from another team.</span></div><div class="criterion"><span class="circle">3</span><span>Reveal coaching criteria, score each team, and advance.</span></div></div><div class="notify" style="margin-top:16px">On a public deployment, invite participants using your HTTPS website link. Do not share the facilitator URL.</div>`)}</div>`;
 return `${participantOverview()}<div class="grid2">${teamIdentityCard()}${card(`<h3>Team members · ${h(teamName(game.my_team))}</h3><p class="small muted">Each person joins with the room QR code and enters their own name.</p><div class="teamlist" style="margin-top:14px">${(game.teams.find(t=>t.id===game.my_team)?.members || []).map(n=>`<div class="teamrow"><span>👤 ${h(n)}</span></div>`).join('')}</div><p class="note">Keep this page open. The facilitator will start the first scenario soon.</p>`)}</div>`;
}
function inRound(){
 if(mode==='host'){
 const intro=hostOverview()+hostMetrics();
 if(game.phase==='finished')return `${intro}${card(`<div class="center"><div style="font-size:45px">🏆</div><h2>Career Conversation Challenge complete!</h2><p class="muted">Thank everyone for practicing candid, empathetic, action-oriented career conversations.</p><button class="btn secondary" data-action="new-game">Create another game</button></div>`)}${scoreboard()}`;
 if(game.phase==='write')return `${intro}<div class="twoCol" style="margin-top:19px">${scenarioCard()}${writingHost()}</div>`;
 if(game.phase==='vote')return `${intro}<div class="twoCol" style="margin-top:19px">${scenarioCard()}${card(`<h3>Participants are voting</h3><p class="muted small">Each person votes for another team. Votes are hidden until the reveal.</p><div class="metric"><div class="caption">Ballots received</div><div class="number">${game.vote_count}</div></div><p class="note">Open the reveal when you are ready. All submitted responses are displayed below.</p>`)}</div><h3 style="margin-top:24px">Submitted responses</h3>${responseCards()}`;
 if(game.phase==='reveal')return `${intro}${aiConnectionPanel()}${scenarioRecap()}<div class="twoCol" style="margin-top:19px">${rubric()}${grading()}</div><h3 style="margin-top:24px">Team responses and votes</h3>${responseCards()}<div style="margin-top:20px">${scoreboard()}</div>`;
 }
 const head=participantOverview();
 if(game.phase==='finished')return `${head}${card(`<div class="center"><div style="font-size:48px">🏆</div><h2>Game complete. Great work!</h2><p class="muted">Take your favorite coaching question into your next one-on-one conversation.</p></div>`)}${scoreboard()}`;
 if(game.phase==='write')return `${head}<div class="twoCol">${scenarioCard()}${writeArea()}</div>`;
 if(game.phase==='vote')return `${head}<div class="twoCol">${scenarioCard()}${card(`<h3>Vote for the strongest response</h3><p class="muted">Read the submitted responses below. Choose the answer that best acknowledges the employee, explores their goals, and identifies practical next steps.</p><div class="banner"><strong>${game.my_vote?'✓ Vote received':'Voting is open'}</strong>${game.my_vote?'You can change your vote until the reveal.':'You cannot vote for your own team.'}</div>`)}</div><h3 style="margin-top:23px">Responses to consider</h3>${responseCards()}`;
 if(game.phase==='reveal')return `${head}${scenarioRecap()}<div class="twoCol">${rubric()}${card(`<h3>What did you learn?</h3><p>Which question helped the employee feel heard? What made the next step concrete?</p><p class="muted small">Discuss with your team: what would you borrow from another response in a real one-on-one?</p><div class="banner"><strong>Team learning moment</strong> A good career conversation combines curiosity, clarity, and shared ownership.</div>`)}</div><h3 style="margin-top:23px">All team responses</h3>${responseCards()}<div style="margin-top:20px">${scoreboard()}</div>`;
 return `${head}${scenarioCard()}`;
}
function render(){
 if(mode==='join')return renderJoin();
 if(mode==='welcome')return welcome();
 if(!game)return;
 if(game.phase==='lobby')app(lobby());
 else app(inRound());
}
async function refresh(force=false){
 if(!credentials||!['host','player'].includes(mode)||refreshActive)return;
 refreshActive=true;
 try{
  const auth={code:credentials.code};
  if(mode==='host')auth.host_key=credentials.host_key;else auth.member_id=credentials.member_id;
  const next=await api('state',auth);
  const old=game;
  const signature=JSON.stringify(next);
  game=next;
  window.SceneAudio?.onGameUpdate(next);
  if(!old||old.round!==next.round||old.phase!==next.phase){draft='';dirty=false;window.currentDraftBase=0;}
  const active=document.activeElement;
  const typing=active&&(['teamResponse','playerName','joinTeamName','editTeamName','editMemberName'].includes(active.id));
  if(force || signature!==lastSignature){
    if(!typing || !old || old.phase!==next.phase || old.round!==next.round || force){
      lastSignature=signature;
      render();
    }
  }
 }catch(e){
   if(force)notify(e.message);
 }finally{refreshActive=false;}
}
function bindControls(){
 // All controls are event-delegated; no listeners attached on rerender.
}
async function act(e){
 const btn=e.target.closest('[data-action]');if(!btn)return;
 const a=btn.dataset.action;
 if(btn.disabled)return;
 btn.disabled=true;
 try{
  if(a==='create'){
   const count=Number(document.querySelector('#teamCount').value);
   const result=await api('create',{team_count:count});
   credentials={...result};mode='host';lastSignature='';aiConnectionResult=null;
   goto(`/?host=${result.code}&key=${encodeURIComponent(result.host_key)}`);
   await refresh(true);
  }
  else if(a==='find-room'){await findRoom()}
  else if(a==='save-team-name'){
   const name=document.querySelector('#editTeamName')?.value.trim();
   if(!name){notify('Enter a team name before saving.');return;}
   await api('team-name',{...credentials,name});
   await refresh(true);notify('Team name updated for everyone!');
  }
  else if(a==='save-member-name'){
   const name=document.querySelector('#editMemberName')?.value.trim();
   if(!name){notify('Enter your name before saving.');return;}
   await api('member-name',{...credentials,name});
   await refresh(true);notify('Your name has been updated on the team roster.');
  }
  else if(a==='play-scene-audio'){window.SceneAudio?.start(game,btn.dataset.audioMode)}
  else if(a==='stop-scene-audio'){window.SceneAudio?.stop()}
  else if(a==='show-join-qr'){showJoinQRDialog()}
  else if(a==='join'){await doJoin()}
  else if(a==='reload-room'){room=await api('room',{code:credentials.code});renderJoin()}
  else if(a==='phase'){
   const action=btn.dataset.phase;
   await api('phase',{...credentials,action});await refresh(true);
  }
  else if(a==='submit-response'){
   const t=document.querySelector('#teamResponse');
   const answer=t?.value.trim()||'';
   const version=window.currentDraftBase||0;
   await api('respond',{...credentials,text:answer,base_version:version});
   dirty=false;draft=answer;await refresh(true);notify('Your team response was saved.');
  }
  else if(a==='cast-vote'){
   await api('vote',{...credentials,team:btn.dataset.team});await refresh(true);notify('Vote recorded.');
  }
  else if(a==='test-ai'){
   const result=await api('ai-test',{...credentials});
   aiConnectionResult=result;
   render();
   notify(result.status==='ready'?'AI scoring connection works!':'AI scoring needs attention.');
  }
  else if(a==='ai-score'){
   notify('AI coaching review requested. Scores will appear when ready.');
   await api('ai-score',{...credentials});await refresh(true);
  }
  else if(a==='score'){
   await api('score',{...credentials,team:btn.dataset.team,score:Number(btn.dataset.score)});await refresh(true);
  }
  else if(a==='copy-link'||a==='copy-code'){
   const text=a==='copy-code'?game.code:`${location.origin}/?join=${game.code}`;
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
   else {const input=document.createElement('textarea');input.value=text;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();}
   notify(a==='copy-code'?'Code copied!':'Join link copied!');
  }
  else if(a==='new-game'){goto('/');welcome();}
 }catch(err){notify(err.message)}finally{if(btn.isConnected)btn.disabled=false;}
}
root.addEventListener('click',act);
root.addEventListener('change',e=>{
 if(e.target.matches('input[name="team"]')){
  const selected=room?.teams.find(t=>t.id===e.target.value);
  const field=document.querySelector('#joinTeamNameField');
  if(field)field.hidden=!(selected && selected.count===0 && room?.phase==='lobby');
 }
});
root.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='joinCode'){e.preventDefault();findRoom()}});
root.addEventListener('input',e=>{
 if(e.target.id==='teamResponse'){
   draft=e.target.value;dirty=true;
   const count=e.target.parentElement.querySelector('.small.muted');if(count)count.textContent=`${draft.length}/2,200 characters`;
 }
});
window.addEventListener('storage',e=>{if(e.key?.startsWith('cc-member-'))refresh(true)});
const inviteDialog=document.querySelector('#inviteDialog');
inviteDialog?.addEventListener('click',e=>{if(e.target===inviteDialog||e.target.closest('[data-close-invite]'))inviteDialog.close()});
async function init(){
 const url=new URL(location.href);
 const host=url.searchParams.get('host');
 const key=url.searchParams.get('key');
 const join=url.searchParams.get('join');
 if(host&&key){mode='host';credentials={code:host.toUpperCase(),host_key:key};await refresh(true)}
 else if(join){welcome();const code=join.toUpperCase();const saved=localStorage.getItem(`cc-member-${code}`);
  if(saved){mode='player';credentials={code,member_id:saved};await refresh(true);
   if(!game){localStorage.removeItem(`cc-member-${code}`);await findRoom(code)}}
  else await findRoom(code);
 }else welcome();
 setInterval(()=>refresh(false),2000);
}
init();
