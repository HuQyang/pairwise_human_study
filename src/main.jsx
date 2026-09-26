import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { studyConfig } from './studyConfig';
import './style.css';

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const esc = (v) => `"${String(v ?? '').replaceAll('"','""')}"`;

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
  const trials = useMemo(() => shuffle(studyConfig.comparisons).map((c) => {
    const flipped = Math.random() < .5;
    return {...c, left: flipped ? c.b : c.a, right: flipped ? c.a : c.b, flipped};
  }), []);
  const [started,setStarted]=useState(false);
  const [idx,setIdx]=useState(0);
  const [qIdx,setQIdx]=useState(0);
  const [choice,setChoice]=useState('');
  const [records,setRecords]=useState([]);
  const [trialStart,setTrialStart]=useState(Date.now());
  const done = idx >= trials.length;
  const current = trials[idx];
  const question = studyConfig.questions[qIdx];
  const total = trials.length * studyConfig.questions.length;
  const completed = idx * studyConfig.questions.length + qIdx;

  const submit=()=>{
    if(!choice) return;
    const pickedMethod = choice === 'left' ? current.left.method : choice === 'right' ? current.right.method : 'Tie';
    const rec={timestamp:new Date().toISOString(),sample_id:current.id,question_id:question.id,question:question.text,left_method:current.left.method,right_method:current.right.method,response:choice,preferred_method:pickedMethod,response_time_ms:Date.now()-trialStart};
    setRecords(r=>[...r,rec]); setChoice(''); setTrialStart(Date.now());
    if(qIdx < studyConfig.questions.length-1) setQIdx(qIdx+1); else {setQIdx(0);setIdx(idx+1);}
  };
  const download=()=>{
    const headers=['timestamp','sample_id','question_id','question','left_method','right_method','response','preferred_method','response_time_ms'];
    const csv=[headers.join(','),...records.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='pairwise-study-results.csv'; a.click(); URL.revokeObjectURL(url);
  };
  if(!started) return <main className="shell intro"><div className="eyebrow">HUMAN EVALUATION</div><h1>{studyConfig.title}</h1><p>{studyConfig.intro}</p><div className="info"><b>{trials.length}</b> comparisons · <b>{studyConfig.questions.length}</b> criterion/criteria · randomized presentation</div><button className="primary" onClick={()=>{setStarted(true);setTrialStart(Date.now())}}>Start study</button></main>;
  if(done) return <main className="shell intro"><div className="check">✓</div><h1>Thank you.</h1><p>Your responses are complete. In this prototype, responses stay in this browser until you export them.</p><button className="primary" onClick={download}>Export responses as CSV</button><p className="note">For a public multi-participant study, connect this interface to a database or form endpoint before collecting real data.</p></main>;
  return <main className="shell">
    <header><div><div className="eyebrow">PAIRWISE STUDY</div><h2>{studyConfig.title}</h2></div><div className="progressText">{completed+1} / {total}</div></header>
    <div className="progress"><span style={{width:`${completed/total*100}%`}} /></div>
    {current.prompt && <div className="prompt"><span>Input / prompt</span>{current.prompt}</div>}
    <section className="compare"><ImagePanel item={current.left} side="A"/><div className="vs">VS</div><ImagePanel item={current.right} side="B"/></section>
    <section className="question"><h3>{question.text}</h3><div className="choices">
      <button className={choice==='left'?'selected':''} onClick={()=>setChoice('left')}>Prefer A</button>
      {studyConfig.allowTie && <button className={choice==='tie'?'selected':''} onClick={()=>setChoice('tie')}>No preference / Tie</button>}
      <button className={choice==='right'?'selected':''} onClick={()=>setChoice('right')}>Prefer B</button>
    </div><button className="primary next" disabled={!choice} onClick={submit}>Next →</button></section>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
