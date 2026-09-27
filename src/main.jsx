import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { studyConfig } from './studyConfig';
import './style.css';
import { sendSubmission, wakeServer } from './submission.js';

const storageKey = `pairwise-study:${studyConfig.id}:${studyConfig.version}`;
const configSnapshot = JSON.stringify(studyConfig);
function createSession() {
  const comparisons = [...studyConfig.comparisons];
  for (let i = comparisons.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [comparisons[i], comparisons[j]] = [comparisons[j], comparisons[i]];
  }
  return {
    configSnapshot, submissionId: crypto.randomUUID(), started: false, records: [], receipt: null,
    trials: comparisons.map(c => {
      const flipped = Math.random() < .5;
      return { ...c, left: flipped ? c.b : c.a, right: flipped ? c.a : c.b, flipped };
    }),
  };
}
function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.configSnapshot === configSnapshot && Array.isArray(saved.trials) &&
        saved.trials.length === studyConfig.comparisons.length && Array.isArray(saved.records) &&
        saved.records.length <= saved.trials.length * studyConfig.questions.length &&
        typeof saved.submissionId === 'string') return saved;
  } catch { /* Storage may be unavailable; the study can still submit from memory. */ }
  return createSession();
}

function Placeholder({label}) {
  return <div className="placeholder"><div className="phIcon">▧</div><div>{label}</div><small>Replace in public/images</small></div>;
}
function ImagePanel({item, side}) {
  return <div className="panel">
    <div className="sideLabel">Option {side}</div>
    <div className="imageBox">{item.image ? <img src={item.image} alt={`Option ${side}`} /> : <Placeholder label="Image placeholder" />}</div>
    {item.caption && <div className="caption">{item.caption}</div>}
  </div>;
}
function App(){
  const [session, setSession] = useState(loadSession);
  const [showHome, setShowHome] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const [submissionState, setSubmissionState] = useState(session.receipt ? 'success' : 'idle');
  const [submissionError, setSubmissionError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const { trials, records, started } = session;
  const idx = Math.floor(records.length / studyConfig.questions.length);
  const qIdx = records.length % studyConfig.questions.length;
  const [choice,setChoice]=useState('');
  const [trialStart,setTrialStart]=useState(Date.now());
  const done = idx >= trials.length;
  const current = trials[idx];
  const question = studyConfig.questions[qIdx];
  const total = trials.length * studyConfig.questions.length;
  const completed = records.length;

  function persist(next) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageWarning(''); }
    catch { setStorageWarning('This browser cannot save your progress locally. Keep this page open until your responses are submitted.'); }
    setSession(next);
  }

  useEffect(() => {
    if (session.receipt) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    wakeServer(apiBase);
    const timer = setInterval(() => wakeServer(apiBase), 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [Boolean(session.receipt)]);

  useEffect(() => {
    if (!done || session.receipt) return;
    let active = true;
    setSubmissionState('sending');
    setSubmissionError('');
    sendSubmission(session, studyConfig, import.meta.env.VITE_API_BASE_URL || '').then(receipt => {
      if (!active) return;
      persist({ ...session, receipt });
      setSubmissionState('success');
    }).catch(error => {
      if (!active) return;
      setSubmissionError(error.message);
      setSubmissionState('error');
    });
    return () => { active = false; };
  }, [done, retryCount]);

  const submit=()=>{
    if(!choice) return;
    const pickedMethod = choice === 'left' ? current.left.method : choice === 'right' ? current.right.method : 'Tie';
    const rec={timestamp:new Date().toISOString(),sample_id:current.id,question_id:question.id,question:question.text,left_method:current.left.method,right_method:current.right.method,response:choice,preferred_method:pickedMethod,response_time_ms:Date.now()-trialStart};
    persist({ ...session, records: [...records, rec] }); setChoice(''); setTrialStart(Date.now());
  };
  const startStudy = () => {
    // A completed survey stays in the database; another run gets its own identity.
    const next = session.receipt ? createSession() : session;
    persist({ ...next, started: true });
    setChoice('');
    setSubmissionState('idle');
    setSubmissionError('');
    setRetryCount(0);
    setTrialStart(Date.now());
    setShowHome(false);
  };
  if(!started || showHome) return <main className="shell intro">
    <div className="eyebrow">HUMAN EVALUATION</div><h1>{studyConfig.title}</h1><p>{studyConfig.intro}</p>
    <div className="info"><b>{trials.length}</b> comparisons · <b>{studyConfig.questions.length}</b> criterion/criteria · randomized presentation</div>
    <p className="note">{session.receipt ? 'Your previous responses have been saved. You can start a new study.' : 'Your responses will be submitted automatically when you finish.'}</p>
    <button className="primary" onClick={startStudy}>{session.receipt ? 'Start new study' : 'Start study'}</button>
  </main>;
  if(done) return <main className="shell intro">
    <div className="check">{submissionState === 'success' ? '✓' : '↑'}</div>
    <h1>{submissionState === 'success' ? 'Thank you.' : submissionState === 'error' ? 'Submission pending.' : 'Submitting responses…'}</h1>
    <div role="status" aria-live="polite"><p>{submissionState === 'success' ? 'Your responses have been saved. You can close this page.' : submissionState === 'error' ? 'Your answers are still here. Please retry to finish the study.' : 'Please keep this page open while we save your responses.'}</p></div>
    {submissionState === 'error' && <><p role="alert" className="error">{submissionError}</p><button className="primary" onClick={()=>{setSubmissionState('sending');setRetryCount(n=>n+1)}}>Retry submission</button></>}
    {submissionState === 'success' && <p className="note">Submission ID: {session.submissionId}</p>}
    {submissionState === 'success' && <button className="primary" onClick={()=>setShowHome(true)}>Back to home</button>}
    {storageWarning && submissionState !== 'success' && <p role="alert" className="note">{storageWarning}</p>}
  </main>;
  return <main className="shell">
    <header><div><div className="eyebrow">PAIRWISE STUDY</div><h2>{studyConfig.title}</h2></div><div className="progressText">{completed+1} / {total}</div></header>
    <div className="progress"><span style={{width:`${completed/total*100}%`}} /></div>
    {storageWarning && <p role="alert" className="note">{storageWarning}</p>}
    {current.prompt && <div className="prompt"><span>Input / prompt</span>{current.prompt}</div>}
    <section className="compare"><ImagePanel item={current.left} side="A"/><div className="vs">VS</div><ImagePanel item={current.right} side="B"/></section>
    <section className="question"><h3>{question.text}</h3><div className="choices">
      <button className={choice==='left'?'selected':''} onClick={()=>setChoice('left')}>Prefer A</button>
      {studyConfig.allowTie && <button className={choice==='tie'?'selected':''} onClick={()=>setChoice('tie')}>No preference / Tie</button>}
      <button className={choice==='right'?'selected':''} onClick={()=>setChoice('right')}>Prefer B</button>
    </div><button className="primary next" disabled={!choice} onClick={submit}>{completed + 1 === total ? 'Submit responses' : 'Next →'}</button></section>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
